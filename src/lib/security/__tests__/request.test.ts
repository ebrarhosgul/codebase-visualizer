import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp, isSameOriginRequest, readJsonBody } from "../request";

function makeRequest(
  headers: Record<string, string> = {},
  init: { method?: string; body?: string } = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/test", {
    method: init.method ?? "POST",
    headers,
    body: init.body,
  });
}

describe("getClientIp", () => {
  it("uses the rightmost forwarded entry, which the trusted proxy appended", () => {
    const req = makeRequest({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" });
    expect(getClientIp(req)).toBe("203.0.113.9");
  });

  it("cannot be spoofed by changing the leftmost forwarded entry", () => {
    const a = makeRequest({ "x-forwarded-for": "1.1.1.1, 203.0.113.9" });
    const b = makeRequest({ "x-forwarded-for": "2.2.2.2, 203.0.113.9" });
    expect(getClientIp(a)).toBe(getClientIp(b));
  });

  it("falls back to x-real-ip, then a constant", () => {
    expect(getClientIp(makeRequest({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
    expect(getClientIp(makeRequest())).toBe("unknown");
  });
});

describe("isSameOriginRequest", () => {
  it("allows requests that carry no browser origin headers", () => {
    expect(isSameOriginRequest(makeRequest())).toBe(true);
  });

  it("allows a matching Origin", () => {
    expect(
      isSameOriginRequest(makeRequest({ origin: "http://localhost:3000" })),
    ).toBe(true);
  });

  it("allows a matching Origin behind a proxy using x-forwarded-host", () => {
    const req = makeRequest({
      origin: "https://app.example.com",
      "x-forwarded-host": "app.example.com",
    });
    expect(isSameOriginRequest(req)).toBe(true);
  });

  it("rejects a foreign Origin", () => {
    expect(
      isSameOriginRequest(makeRequest({ origin: "https://evil.example" })),
    ).toBe(false);
  });

  it("rejects the opaque null Origin", () => {
    expect(isSameOriginRequest(makeRequest({ origin: "null" }))).toBe(false);
  });

  it("rejects cross-site and same-site fetch metadata", () => {
    expect(
      isSameOriginRequest(makeRequest({ "sec-fetch-site": "cross-site" })),
    ).toBe(false);
    expect(
      isSameOriginRequest(makeRequest({ "sec-fetch-site": "same-site" })),
    ).toBe(false);
  });

  it("allows same-origin and user initiated fetch metadata", () => {
    expect(
      isSameOriginRequest(makeRequest({ "sec-fetch-site": "same-origin" })),
    ).toBe(true);
    expect(isSameOriginRequest(makeRequest({ "sec-fetch-site": "none" }))).toBe(
      true,
    );
  });
});

describe("readJsonBody", () => {
  it("parses a JSON body", async () => {
    const req = makeRequest(
      { "content-type": "application/json" },
      { body: '{"a":1}' },
    );
    const result = await readJsonBody(req, { maxBytes: 100 });
    expect(result).toEqual({ ok: true, value: { a: 1 } });
  });

  it("rejects a body over the byte cap as 413", async () => {
    const req = makeRequest(
      {},
      { body: JSON.stringify({ pad: "x".repeat(500) }) },
    );
    const result = await readJsonBody(req, { maxBytes: 100 });
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("enforces the cap on the streamed bytes when Content-Length is understated", async () => {
    const body = JSON.stringify({ pad: "x".repeat(500) });
    const req = makeRequest({ "content-length": "10" }, { body });
    const result = await readJsonBody(req, { maxBytes: 100 });
    expect(result).toMatchObject({ ok: false, status: 413 });
  });

  it("rejects malformed JSON as 400", async () => {
    const result = await readJsonBody(makeRequest({}, { body: "nope" }), {
      maxBytes: 100,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a form style content type when JSON is required", async () => {
    const req = makeRequest(
      { "content-type": "text/plain" },
      { body: '{"provider":"gemini"}' },
    );
    const result = await readJsonBody(req, {
      maxBytes: 100,
      requireJsonContentType: true,
    });
    expect(result).toMatchObject({ ok: false, status: 400 });
  });

  it("accepts a JSON content type with a charset when JSON is required", async () => {
    const req = makeRequest(
      { "content-type": "application/json; charset=utf-8" },
      { body: '{"ok":true}' },
    );
    const result = await readJsonBody(req, {
      maxBytes: 100,
      requireJsonContentType: true,
    });
    expect(result).toEqual({ ok: true, value: { ok: true } });
  });
});
