/** Clickable Homework Hub links for Discord / cadence / memo pings. */

export const HUB_ORIGIN = "https://japaneselanguagementor.com";

export function hubPlatformUrl(qs: Record<string, string | undefined | null>): string {
  const url = new URL("/homework/platform.html", HUB_ORIGIN);
  for (const [key, value] of Object.entries(qs)) {
    const v = String(value || "").trim();
    if (v) url.searchParams.set(key, v);
  }
  return url.toString();
}

/** Open that student's submitted sheet in your review overlay. */
export function teacherReviewLink(submissionId: string): string {
  return hubPlatformUrl({ tr: String(submissionId || "").trim() });
}

/** View the hub as that student, optionally on a tab / memo / sit past list. */
export function studentPageLink(
  username: string,
  extra?: { tab?: string; memo?: string; sitpast?: boolean }
): string {
  return hubPlatformUrl({
    as: String(username || "").trim().toLowerCase(),
    tab: extra?.tab,
    memo: extra?.memo,
    sitpast: extra?.sitpast ? "1" : "",
  });
}

export function curriculumTabFromAssignmentId(assignmentId: string): string {
  return String(assignmentId || "")
    .replace(/^curriculum-/i, "")
    .trim()
    .toLowerCase() || "today";
}
