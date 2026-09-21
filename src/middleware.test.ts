// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { config, middleware } from "./middleware";

function pageRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost:3000/", { headers });
}

function nonceFromPolicy(policy: string): string {
  const match = /'nonce-([^']+)'/.exec(policy);
  if (!match) throw new Error(`No nonce in policy: ${policy}`);
  return match[1];
}

describe("middleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sets a nonce based Content-Security-Policy on the response", () => {
    const response = middleware(pageRequest());

    const policy = response.headers.get("Content-Security-Policy");
    expect(policy).toContain("script-src");
    expect(policy).toMatch(/'nonce-[^']+'/);
    expect(policy).toContain("frame-ancestors 'none'");
  });

  it("forwards the same nonce and policy to the page through request headers", () => {
    const response = middleware(pageRequest());

    const policy = response.headers.get("Content-Security-Policy") ?? "";
    // NextResponse.next({ request }) exposes forwarded headers with this prefix.
    const forwardedNonce = response.headers.get("x-middleware-request-x-nonce");
    const forwardedPolicy = response.headers.get(
      "x-middleware-request-content-security-policy",
    );

    expect(forwardedNonce).toBe(nonceFromPolicy(policy));
    expect(forwardedPolicy).toBe(policy);
  });

  it("generates a fresh nonce for every request", () => {
    const first = middleware(pageRequest());
    const second = middleware(pageRequest());

    expect(first.headers.get("x-middleware-request-x-nonce")).not.toBe(
      second.headers.get("x-middleware-request-x-nonce"),
    );
  });

  it("ignores a nonce or policy supplied by the client", () => {
    const response = middleware(
      pageRequest({
        "x-nonce": "attacker-nonce",
        "Content-Security-Policy": "script-src *",
      }),
    );

    const policy = response.headers.get("Content-Security-Policy") ?? "";
    expect(policy).not.toContain("attacker-nonce");
    expect(policy).not.toContain("script-src *");
    expect(response.headers.get("x-middleware-request-x-nonce")).not.toBe(
      "attacker-nonce",
    );
  });

  it("never allows unsafe-eval in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    const policy =
      middleware(pageRequest()).headers.get("Content-Security-Policy") ?? "";

    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("ws:");
  });

  it("allows eval and WebSockets for hot reloading in development", () => {
    vi.stubEnv("NODE_ENV", "development");

    const policy =
      middleware(pageRequest()).headers.get("Content-Security-Policy") ?? "";

    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("ws:");
  });
});

describe("middleware matcher", () => {
  const [matcher] = config.matcher;
  const pattern = new RegExp(`^${matcher.source}$`);

  it("runs on page routes", () => {
    expect(pattern.test("/")).toBe(true);
    expect(pattern.test("/some/page")).toBe(true);
  });

  it.each([
    "/api/ingest",
    "/api/ai/query",
    "/api/auth/github-token",
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/favicon.ico",
  ])("skips %s", (path) => {
    expect(pattern.test(path)).toBe(false);
  });

  it("skips router prefetches so they never burn a nonce", () => {
    expect(matcher.missing).toEqual(
      expect.arrayContaining([
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ]),
    );
  });
});
