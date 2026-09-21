import type { NextRequest } from "next/server";

/**
 * Resolves the client address used to key rate limits.
 * The rightmost X-Forwarded-For entry is the one appended by the nearest
 * trusted proxy; the leftmost entries are supplied by the client and can be
 * spoofed freely to dodge a limiter, so they are never used.
 * Deployments with several proxy hops share the last hop's address, which
 * fails safe (a shared bucket) rather than open.
 */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const entries = forwarded
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    const last = entries[entries.length - 1];
    if (last) {
      return last;
    }
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  return realIp || "unknown";
}

/**
 * Rejects cross site requests to state changing endpoints.
 * Browsers always attach Origin to cross origin POSTs and Sec-Fetch-Site to
 * every request, so a page on another site cannot get past this check.
 * Requests with neither header (curl, server to server) carry no ambient
 * browser credentials and are allowed.
 */
export function isSameOriginRequest(req: NextRequest): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return false;
  }

  const origin = req.headers.get("origin");
  if (!origin) {
    return true;
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false; // Includes the literal "null" origin
  }

  const allowedHosts = [
    req.headers.get("host"),
    req.headers.get("x-forwarded-host"),
    req.nextUrl.host,
  ].filter((host): host is string => Boolean(host));

  return allowedHosts.includes(originHost);
}

export type JsonBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | {
      readonly ok: false;
      readonly status: 400 | 413;
      readonly message: string;
    };

export interface ReadJsonBodyOptions {
  /** Hard cap on the request body, enforced while streaming. */
  readonly maxBytes: number;
  /**
   * Require Content-Type: application/json. A cross site HTML form can only
   * send text/plain, urlencoded or multipart bodies without a CORS preflight.
   */
  readonly requireJsonContentType?: boolean;
}

/**
 * Reads and parses a JSON request body with a byte cap that does not trust
 * the Content-Length header.
 */
export async function readJsonBody(
  req: NextRequest,
  options: ReadJsonBodyOptions,
): Promise<JsonBodyResult> {
  const tooLarge: JsonBodyResult = {
    ok: false,
    status: 413,
    message: "Request body is too large.",
  };

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    return tooLarge;
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return { ok: false, status: 400, message: "Request body is empty." };
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.byteLength;
      if (received > options.maxBytes) {
        await reader.cancel();
        return tooLarge;
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, message: "Unable to read request body." };
  }

  const text = new TextDecoder().decode(Buffer.concat(chunks));
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, message: "Invalid JSON request body." };
  }

  // Checked after the size capped read so malformed bodies keep their more
  // specific error; a well formed body sent as text/plain is still refused.
  if (options.requireJsonContentType) {
    const contentType = req.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return {
        ok: false,
        status: 400,
        message: "Content-Type must be application/json.",
      };
    }
  }

  return { ok: true, value };
}

/**
 * Builds a JSON error Response with the given status.
 */
export function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
