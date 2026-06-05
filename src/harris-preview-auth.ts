const HARRIS_PREVIEW_PREFIX = "/preview/harris-notarization";

export function isHarrisPreviewPath(pathname: string): boolean {
  return (
    pathname === HARRIS_PREVIEW_PREFIX ||
    pathname === `${HARRIS_PREVIEW_PREFIX}/` ||
    pathname.startsWith(`${HARRIS_PREVIEW_PREFIX}/`)
  );
}

export function harrisPreviewCredentials(env: {
  HARRIS_PREVIEW_USER?: string;
  HARRIS_PREVIEW_PASSWORD?: string;
}): { user: string; password: string } | null {
  const password = env.HARRIS_PREVIEW_PASSWORD?.trim();
  if (!password) return null;
  const user = (env.HARRIS_PREVIEW_USER || "harris").trim();
  return { user, password };
}

export function isHarrisPreviewAuthorized(
  request: Request,
  env: { HARRIS_PREVIEW_USER?: string; HARRIS_PREVIEW_PASSWORD?: string }
): boolean {
  const creds = harrisPreviewCredentials(env);
  if (!creds) return false;

  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Basic ")) return false;

  let decoded = "";
  try {
    decoded = atob(header.slice(6));
  } catch {
    return false;
  }

  const colon = decoded.indexOf(":");
  if (colon < 0) return false;

  const user = decoded.slice(0, colon);
  const password = decoded.slice(colon + 1);
  return user === creds.user && password === creds.password;
}

export function harrisPreviewUnauthorized(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Harris Firm Preview", charset="UTF-8"',
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store",
    },
  });
}

export function withHarrisPreviewHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
