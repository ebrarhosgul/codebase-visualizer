import { NextRequest, NextResponse } from "next/server";
import {
  GITHUB_PAT_COOKIE_NAME,
  validateGithubTokenFormat,
  maskGithubToken,
  encryptGithubToken,
  decryptGithubToken,
} from "@/lib/github/crypto";

interface SetTokenRequest {
  readonly token: string;
}

/**
 * Route handler for POST /api/auth/github-token.
 * Encrypts a GitHub personal access token using AES-256-GCM and stores it in an httpOnly cookie.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: SetTokenRequest;
  try {
    body = (await req.json()) as SetTokenRequest;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON request body." },
      { status: 400 },
    );
  }

  const { token } = body;
  if (
    !token ||
    typeof token !== "string" ||
    !validateGithubTokenFormat(token)
  ) {
    return NextResponse.json(
      {
        success: false,
        error:
          "Invalid token format. GitHub token must start with 'ghp_' or 'github_pat_'.",
      },
      { status: 400 },
    );
  }

  const encryptedValue = encryptGithubToken(token);
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
    maxAge: 60 * 60 * 24 * 30, // 30 days
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
    return NextResponse.json({
      hasToken: false,
      maskedToken: null,
    });
  }

  const decrypted = decryptGithubToken(cookieValue);
  if (!decrypted) {
    return NextResponse.json({
      hasToken: false,
      maskedToken: null,
    });
  }

  return NextResponse.json({
    hasToken: true,
    maskedToken: maskGithubToken(decrypted),
  });
}

/**
 * Route handler for DELETE /api/auth/github-token.
 * Clears the encrypted github_pat cookie.
 */
export async function DELETE(): Promise<NextResponse> {
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
