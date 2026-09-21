/**
 * Host that @monaco-editor/react loads the editor scripts, styles, and fonts
 * from by default.
 */
const MONACO_CDN = "https://cdn.jsdelivr.net";

/**
 * Generates a fresh, unguessable nonce for one response.
 * Uses only Web Crypto so it also runs in the Edge runtime.
 */
export function generateNonce(): string {
  return btoa(crypto.randomUUID());
}

/**
 * Builds the Content-Security-Policy header value for a page response.
 * Inline scripts run only when they carry the per response nonce. Development
 * additionally allows eval, which React's dev tooling needs.
 */
export function buildContentSecurityPolicy(
  nonce: string,
  isDevelopment: boolean,
): string {
  const scriptSources = [
    "'self'",
    `'nonce-${nonce}'`,
    MONACO_CDN,
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
  ];

  const directives: readonly (readonly [string, readonly string[]])[] = [
    ["default-src", ["'self'"]],
    ["script-src", scriptSources],
    // React Flow, Monaco, and Tailwind set inline styles at runtime.
    ["style-src", ["'self'", "'unsafe-inline'", MONACO_CDN]],
    ["img-src", ["'self'", "data:", "blob:"]],
    ["font-src", ["'self'", "data:", MONACO_CDN]],
    [
      "connect-src",
      // Dev server hot reloading talks over a WebSocket
      ["'self'", MONACO_CDN, ...(isDevelopment ? ["ws:", "wss:"] : [])],
    ],
    ["worker-src", ["'self'", "blob:"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["frame-ancestors", ["'none'"]],
  ];

  return directives
    .map(([name, sources]) => `${name} ${sources.join(" ")}`)
    .join("; ");
}
