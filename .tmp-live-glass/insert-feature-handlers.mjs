import fs from "fs";

const p = "src/index.ts";
let s = fs.readFileSync(p, "utf8");
if (s.includes("async function handleFeatureReport")) {
  console.log("already present");
  process.exit(0);
}
const needle = "async function handlePromoSignups";
const insert = `async function handleFeatureReport(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let data: {
    kind?: string;
    message?: string;
    username?: string;
    displayName?: string;
    page?: string;
  };
  try {
    data = (await request.json()) as typeof data;
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  try {
    const report = await saveFeatureReport(data, env);
    return jsonResponse({
      success: true,
      message: "Sent to JD — thanks!",
      id: report.id,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Reports are not configured on this server yet." }, 503);
    }
    if (code === "KIND_REQUIRED") {
      return jsonResponse({ error: "Choose Feature request or Bug report." }, 400);
    }
    if (code === "MESSAGE_REQUIRED") {
      return jsonResponse({ error: "Write a short message before sending." }, 400);
    }
    if (code === "MESSAGE_TOO_LONG") {
      return jsonResponse({ error: "Message is too long (max about 4000 characters)." }, 400);
    }
    console.error("feature-report failed:", err);
    return jsonResponse({ error: "Could not send your report. Try again in a moment." }, 500);
  }
}

async function handleFeatureReports(request: Request, env: Env): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const url = new URL(request.url);
  const teacherUsername = url.searchParams.get("teacherUsername") || "";
  const allowed = (env.HW_TEACHER_USER || "jlm").toLowerCase();
  if (teacherUsername.trim().toLowerCase() !== allowed) {
    return jsonResponse({ error: "Teacher login required." }, 403);
  }

  try {
    const limit = Number(url.searchParams.get("limit") || "40");
    const reports = await listFeatureReports(env, { limit });
    return jsonResponse({ reports });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "KV_NOT_CONFIGURED") {
      return jsonResponse({ error: "Report storage is not configured on this server." }, 503);
    }
    console.error("feature-reports list failed:", err);
    return jsonResponse({ error: "Could not load reports." }, 500);
  }
}

`;
if (!s.includes(needle)) {
  console.error("needle missing");
  process.exit(1);
}
s = s.replace(needle, insert + needle);
fs.writeFileSync(p, s);
console.log("inserted handlers");
