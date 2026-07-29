const JEM_PREVIEW_PREFIX = "/preview/jem-appraisals";

const JEM_SITE_HOSTS = new Set([
  "jem-appraisals.com",
  "www.jem-appraisals.com",
]);

export function isJemSiteHost(hostname: string): boolean {
  return JEM_SITE_HOSTS.has(hostname.toLowerCase());
}

export function isJemPreviewPath(pathname: string): boolean {
  return (
    pathname === JEM_PREVIEW_PREFIX ||
    pathname === `${JEM_PREVIEW_PREFIX}/` ||
    pathname.startsWith(`${JEM_PREVIEW_PREFIX}/`)
  );
}

/** Map jem-appraisals.com/foo → /preview/jem-appraisals/foo for ASSETS. */
export function jemSiteAssetPath(pathname: string): string {
  if (pathname === "/" || pathname === "") {
    return `${JEM_PREVIEW_PREFIX}/`;
  }
  return `${JEM_PREVIEW_PREFIX}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function jemPreviewCredentials(env: {
  JEM_PREVIEW_USER?: string;
  JEM_PREVIEW_PASSWORD?: string;
}): { user: string; password: string } | null {
  const password = env.JEM_PREVIEW_PASSWORD?.trim();
  if (!password) return null;
  const user = (env.JEM_PREVIEW_USER || "jem").trim();
  return { user, password };
}

export function isJemPreviewAuthorized(
  request: Request,
  env: { JEM_PREVIEW_USER?: string; JEM_PREVIEW_PASSWORD?: string }
): boolean {
  const creds = jemPreviewCredentials(env);
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

export function jemPreviewUnauthorized(): Response {
  return new Response("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="JEM Appraisals Preview", charset="UTF-8"',
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "no-store",
    },
  });
}

export function withJemPreviewHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  headers.set("Cache-Control", "private, no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Production domain — allow indexing, normal caching. */
export function withJemSiteHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("X-Robots-Tag");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
