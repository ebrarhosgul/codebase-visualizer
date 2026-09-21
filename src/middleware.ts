import { NextResponse, type NextRequest } from "next/server";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/csp";

/**
 * Attaches a per response nonce based Content-Security-Policy to page requests.
 * The policy is also set on the forwarded request so Next.js stamps the nonce
 * onto its own inline bootstrap scripts, and the root layout reads x-nonce for
 * the theme script.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const policy = buildContentSecurityPolicy(
    nonce,
    process.env.NODE_ENV === "development",
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: API responses are JSON or event streams, not documents.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
