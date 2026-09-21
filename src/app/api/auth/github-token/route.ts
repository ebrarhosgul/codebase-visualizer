import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  GITHUB_PAT_COOKIE_NAME,
  validateGithubTokenFormat,
  maskGithubToken,
  encryptGithubToken,
  decryptGithubToken,
} from "@/lib/github/crypto";
import { CREDENTIAL_COOKIE_TTL_SECONDS } from "@/lib/security/cookie-crypto";
import { isSameOriginRequest, readJsonBody } from "@/lib/security/request";

const MAX_BODY_BYTES = 4 * 1024;

const setTokenRequestSchema = z.object({
  token: z.string().max(512),
});

/**
 * Response headers for status reads: the masked token must never be cached by
 * browsers or intermediaries.
 */
const NO_STORE_HEADERS = { "Cache-Control": "no-store, max-age=0" } as const;

/**
 * Route handler for POST /api/auth/github-token.
 * Encrypts a GitHub personal access token using AES-256-GCM and stores it in an httpOnly cookie.
 * Only same origin JSON requests are accepted so another site cannot plant a
 * token in the visitor's browser.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross site requests are not allowed." },
      { status: 403 },
    );
  }

  const bodyResult = await readJsonBody(req, {
    maxBytes: MAX_BODY_BYTES,
    requireJsonContentType: true,
  });
  if (!bodyResult.ok) {
    return NextResponse.json(
      { success: false, error: bodyResult.message },
      { status: bodyResult.status },
    );
  }

  const parsed = setTokenRequestSchema.safeParse(bodyResult.value);
  const token = parsed.success ? parsed.data.token : undefined;
  if (!token || !validateGithubTokenFormat(token)) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid token format. GitHub token must start with 'ghp_' or 'github_pat_'.",
      },
      { status: 400 },
    );
  }

  let encryptedValue: string;
  try {
    encryptedValue = encryptGithubToken(token);
  } catch (err: unknown) {
    console.error(
      "Unable to encrypt GitHub token cookie:",
      err instanceof Error ? err.message : err,
    );
    return NextResponse.json(
      {
        success: false,
        error: "Secure credential storage is not configured on this server.",
      },
      { status: 500 },
    );
  }

  const masked = maskGithubToken(token);

  const response = NextResponse.json({
    success: true,
    maskedToken: masked,
  });

  response.cookies.set({
    name: GITHUB_PAT_COOKIE_NAME,
    value: encryptedValue,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CREDENTIAL_COOKIE_TTL_SECONDS,
  });

  return response;
}

/**
 * Route handler for GET /api/auth/github-token.
 * Checks whether an encrypted token cookie exists and returns its masked representation.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const cookieValue = req.cookies.get(GITHUB_PAT_COOKIE_NAME)?.value;
  if (!cookieValue) {
    return NextResponse.json(
      { hasToken: false, maskedToken: null },
      { headers: NO_STORE_HEADERS },
    );
  }

  const decrypted = decryptGithubToken(cookieValue);
  if (!decrypted) {
    return NextResponse.json(
      { hasToken: false, maskedToken: null },
      { headers: NO_STORE_HEADERS },
    );
  }

  return NextResponse.json(
    { hasToken: true, maskedToken: maskGithubToken(decrypted) },
    { headers: NO_STORE_HEADERS },
  );
}

/**
 * Route handler for DELETE /api/auth/github-token.
 * Clears the encrypted github_pat cookie.
 */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json(
      { success: false, error: "Cross site requests are not allowed." },
      { status: 403 },
    );
  }

  const response = NextResponse.json({
    success: true,
  });

  response.cookies.set({
    name: GITHUB_PAT_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
