import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import {
  POST as tokenPost,
  GET as tokenGet,
  DELETE as tokenDelete,
} from "../github-token/route";
import {
  GITHUB_PAT_COOKIE_NAME,
  encryptGithubToken,
} from "@/lib/github/crypto";

describe("/api/auth/github-token Route Handler", () => {
  it("accepts valid classic personal access token and sets httpOnly cookie (covers: AC-5)", async () => {
    const validToken = "ghp_12345678901234567890abcdef";
    const req = new NextRequest("http://localhost:3000/api/auth/github-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: validToken }),
    });

    const res = await tokenPost(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      success: boolean;
      maskedToken: string;
    };
    expect(json.success).toBe(true);
    expect(json.maskedToken).toBe("ghp_...cdef");

    const cookie = res.cookies.get(GITHUB_PAT_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.value.split(":")).toHaveLength(3);
  });

  it("accepts valid fine-grained personal access token (covers: AC-5)", async () => {
    const validToken = "github_pat_12345678901234567890123456";
    const req = new NextRequest("http://localhost:3000/api/auth/github-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: validToken }),
    });

    const res = await tokenPost(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      success: boolean;
      maskedToken: string;
    };
    expect(json.success).toBe(true);
    expect(json.maskedToken).toBe("github_pat_...3456");
  });

  it("rejects token with invalid prefix or length (covers: AC-5)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/github-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "not_a_valid_token_1234" }),
    });

    const res = await tokenPost(req);
    expect(res.status).toBe(400);

    const json = (await res.json()) as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toContain("Invalid token format");
  });

  it("rejects empty token (covers: AC-5)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/github-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "" }),
    });

    const res = await tokenPost(req);
    expect(res.status).toBe(400);
  });

  it("returns hasToken: false when cookie is absent (covers: AC-5)", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/github-token", {
      method: "GET",
    });

    const res = await tokenGet(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      hasToken: boolean;
      maskedToken: string | null;
    };
    expect(json.hasToken).toBe(false);
    expect(json.maskedToken).toBeNull();
  });

  it("returns hasToken: true and masked token when valid cookie is present (covers: AC-5)", async () => {
    const token = "ghp_12345678901234567890cdef";
    const encrypted = encryptGithubToken(token);

    const req = new NextRequest("http://localhost:3000/api/auth/github-token", {
      method: "GET",
      headers: {
        cookie: `${GITHUB_PAT_COOKIE_NAME}=${encrypted}`,
      },
    });

    const res = await tokenGet(req);
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      hasToken: boolean;
      maskedToken: string | null;
    };
    expect(json.hasToken).toBe(true);
    expect(json.maskedToken).toBe("ghp_...cdef");
  });

  it("clears cookie on DELETE request (covers: AC-5)", async () => {
    const res = await tokenDelete();
    expect(res.status).toBe(200);

    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(true);

    const cookie = res.cookies.get(GITHUB_PAT_COOKIE_NAME);
    expect(cookie).toBeDefined();
    expect(cookie?.value).toBe("");
    expect(cookie?.maxAge).toBe(0);
  });
});
