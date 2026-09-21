import { describe, it, expect } from "vitest";
import { buildContentSecurityPolicy, generateNonce } from "../csp";

describe("generateNonce", () => {
  it("returns a different value each call", () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe("buildContentSecurityPolicy", () => {
  it("admits inline scripts only through the nonce, never unsafe-inline", () => {
    const policy = buildContentSecurityPolicy("abc123", false);
    const scriptSrc = policy
      .split("; ")
      .find((directive) => directive.startsWith("script-src"));

    expect(scriptSrc).toContain("'nonce-abc123'");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("allows eval only in development", () => {
    expect(buildContentSecurityPolicy("n", true)).toContain("'unsafe-eval'");
    expect(buildContentSecurityPolicy("n", false)).not.toContain(
      "'unsafe-eval'",
    );
  });

  it("allows WebSocket connections only in development", () => {
    expect(buildContentSecurityPolicy("n", true)).toContain("ws:");
    expect(buildContentSecurityPolicy("n", false)).not.toContain("ws:");
  });

  it("blocks framing, plugins, and base tag hijacking", () => {
    const policy = buildContentSecurityPolicy("n", false);
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });
});
