/** Homework draft for teacher maker — OpenAI, Cloudflare AI, or built-in templates. */

export interface HomeworkGenerateRequest {
  grammarPoint?: string;
  studentUsername?: string;
  youtubeUrl?: string;
  notes?: string;
  teacherUsername?: string;
}

export interface HomeworkGenerateResult {
  assignment: Record<string, unknown>;
  catalogEntry: Record<string, unknown>;
  /** How the sheet was created — shown in teacher UI */
  source: "openai" | "cloudflare" | "template";
}

interface EnvGenerate {
  OPENAI_API_KEY?: string;
  HW_TEACHER_USER?: string;
  AI?: {
    run(
      model: string,
      input: { messages: { role: string; content: string }[] }
    ): Promise<{ response?: string }>;
  };
}

const TEACHER_USER_DEFAULT = "jlm";

const SYSTEM_PROMPT = `You create Japanese homework JSON for Japanese Language Mentor fillable worksheets.

Return ONLY valid JSON (no markdown) with this shape:
{
  "assignment": {
    "title": "grammar point title",
    "sections": [
      {
        "id": "grammar",
        "title": "Section 1 — Grammar point",
        "instructions": "Fill in the blank with the correct grammar form...",
        "mode": "grammar-blank",
        "tenseBubbles": ["Now-Later", "Past"],
        "activeTense": "Now-Later",
        "items": [ { "id": "s1-1", "parts": [...], "negative": false } ]
      },
      {
        "id": "context",
        "title": "Section 2 — Your words",
        "instructions": "Fill in the blank with your own Japanese...",
        "mode": "context-blank",
        "items": [ ... ]
      }
    ]
  }
}

Each blank MUST include variants:
"variants": {
  "casual": { "Now-Later": "...", "Past": "..." },
  "polite": { "Now-Later": "...", "Past": "..." }
}

Section 1: exactly 5 items with answers. Section 2: exactly 3 items, each one wide blank only (no answer on blanks).
Include 1-2 negative items where natural. Hints use hiragana dictionary + conjugation.`;

function slugify(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : trimmed;
  return JSON.parse(body);
}

function isTeacherUser(env: EnvGenerate, username: string | undefined): boolean {
  const allowed = (env.HW_TEACHER_USER || TEACHER_USER_DEFAULT).toLowerCase();
  return String(username || "").trim().toLowerCase() === allowed;
}

function normalizeAssignment(
  draft: Record<string, unknown>,
  grammarPoint: string,
  studentUsername: string,
  youtubeUrl: string
): Record<string, unknown> {
  const id = `${studentUsername}-${slugify(grammarPoint) || "homework"}`;
  const assignment = { ...draft } as Record<string, unknown>;
  assignment.id = id;
  assignment.title = assignment.title || grammarPoint;
  assignment.youtubeUrl = youtubeUrl || assignment.youtubeUrl || "";
  assignment.status = "draft";
  assignment.forSale = false;
  assignment.salePrice = 0.99;
  delete assignment.level;
  delete assignment.date;
  delete assignment.register;

  const sections = (assignment.sections as unknown[]) || [];
  sections.forEach((sec) => {
    const section = sec as Record<string, unknown>;
    if (section.mode === "grammar-blank") {
      section.tenseBubbles = section.tenseBubbles || ["Now-Later", "Past"];
      section.activeTense = "Now-Later";
    }
    const items = (section.items as unknown[]) || [];
    items.forEach((it) => {
      const item = it as Record<string, unknown>;
      const parts = (item.parts as unknown[]) || [];
      parts.forEach((p) => {
        const part = p as Record<string, unknown>;
        if (part.type !== "blank") return;
        const variants = part.variants as Record<string, Record<string, string>> | undefined;
        if (variants?.casual?.["Now-Later"] && !part.answer) {
          part.answer = variants.casual["Now-Later"];
        }
      });
    });
  });

  return assignment;
}

function buildCatalogEntry(
  assignment: Record<string, unknown>,
  studentUsername: string,
  grammarPoint: string,
  youtubeUrl: string
): Record<string, unknown> {
  return {
    id: assignment.id,
    title: assignment.title || grammarPoint,
    studentLabel: studentUsername,
    lessonName: grammarPoint,
    students: [studentUsername],
    youtubeUrl: youtubeUrl || assignment.youtubeUrl || "",
    forSale: false,
    salePrice: 0.99,
    summary: `Homework: ${grammarPoint}`,
  };
}

type VariantSet = {
  casual: { "Now-Later": string; Past: string };
  polite: { "Now-Later": string; Past: string };
};

function blankPart(
  name: string,
  variants: VariantSet,
  hint?: { dictionary: string; conjugation: string }
) {
  return {
    type: "blank",
    name,
    wide: true,
    answer: variants.casual["Now-Later"],
    variants,
    hint,
  };
}

function grammarLine(
  id: string,
  before: string,
  variants: VariantSet,
  after: string,
  hint: { dictionary: string; conjugation: string },
  negative = false
) {
  return {
    id,
    negative: negative || undefined,
    parts: [
      { type: "text", value: before },
      blankPart(id, variants, hint),
      ...(after ? [{ type: "text", value: after }] : []),
    ],
  };
}

function openLine(id: string, before: string, after: string, hint?: { dictionary: string; conjugation: string }) {
  const parts: Record<string, unknown>[] = [{ type: "text", value: before }];
  const blank: Record<string, unknown> = { type: "blank", name: id, wide: true };
  if (hint) blank.hint = hint;
  parts.push(blank);
  if (after) parts.push({ type: "text", value: after });
  return { id, parts };
}

/** Built-in drafts — no OpenAI key required. */
function generateHomeworkFromTemplate(
  grammarPoint: string,
  _notes: string
): Record<string, unknown> {
  const gp = grammarPoint.trim();
  const isNaiToIkenai = /ないといけない|なければならない|なくちゃ|ないとけない/i.test(
    gp.replace(/～/g, "")
  );

  let s1Items: Record<string, unknown>[];

  if (isNaiToIkenai) {
    s1Items = [
      grammarLine(
        "s1-1",
        "明日、学校に",
        {
          casual: { "Now-Later": "行かないといけない", Past: "行かないといけなかった" },
          polite: { "Now-Later": "行かないといけません", Past: "行かないといけませんでした" },
        },
        "",
        { dictionary: "いく", conjugation: "plain" }
      ),
      grammarLine(
        "s1-2",
        "もう",
        {
          casual: { "Now-Later": "帰らないといけない", Past: "帰らないといけなかった" },
          polite: { "Now-Later": "帰らないといけません", Past: "帰らないといけませんでした" },
        },
        "",
        { dictionary: "かえる", conjugation: "plain" }
      ),
      grammarLine(
        "s1-3",
        "薬を",
        {
          casual: { "Now-Later": "飲まないといけない", Past: "飲まないといけなかった" },
          polite: { "Now-Later": "飲まないといけません", Past: "飲まないといけませんでした" },
        },
        "",
        { dictionary: "のむ", conjugation: "plain" }
      ),
      grammarLine(
        "s1-4",
        "",
        {
          casual: { "Now-Later": "勉強しないといけない", Past: "勉強しないといけなかった" },
          polite: { "Now-Later": "勉強しないといけません", Past: "勉強しないといけませんでした" },
        },
        "",
        { dictionary: "べんきょう", conjugation: "する" }
      ),
      grammarLine(
        "s1-5",
        "今日は遊んでは",
        {
          casual: { "Now-Later": "いけない", Past: "いけなかった" },
          polite: { "Now-Later": "いけません", Past: "いけませんでした" },
        },
        "",
        { dictionary: "あそぶ", conjugation: "ない" },
        true
      ),
    ];
  } else {
    const stem = gp.replace(/^～/, "").replace(/／.*/, "") || "れんしゅう";
    s1Items = [
      grammarLine(
        "s1-1",
        "例文：",
        {
          casual: { "Now-Later": stem, Past: stem + "（過去）" },
          polite: { "Now-Later": stem + "です", Past: stem + "でした" },
        },
        "",
        { dictionary: "れんしゅう", conjugation: "plain" }
      ),
      grammarLine(
        "s1-2",
        "もう一度：",
        {
          casual: { "Now-Later": stem, Past: stem + "（過去）" },
          polite: { "Now-Later": stem + "です", Past: stem + "でした" },
        },
        "",
        { dictionary: "れんしゅう", conjugation: "plain" }
      ),
      grammarLine(
        "s1-3",
        "練習③：",
        {
          casual: { "Now-Later": stem, Past: stem + "（過去）" },
          polite: { "Now-Later": stem + "です", Past: stem + "でした" },
        },
        "",
        { dictionary: "れんしゅう", conjugation: "plain" }
      ),
      grammarLine(
        "s1-4",
        "練習④：",
        {
          casual: { "Now-Later": stem, Past: stem + "（過去）" },
          polite: { "Now-Later": stem + "です", Past: stem + "でした" },
        },
        "",
        { dictionary: "れんしゅう", conjugation: "plain" }
      ),
      grammarLine(
        "s1-5",
        "練習⑤：",
        {
          casual: { "Now-Later": stem, Past: stem + "（過去）" },
          polite: { "Now-Later": stem + "です", Past: stem + "でした" },
        },
        "",
        { dictionary: "れんしゅう", conjugation: "plain" }
      ),
    ];
  }

  const s2Items = [1, 2, 3].map((n) => {
    const id = "s2-" + n;
    return { id, parts: [{ type: "blank", name: id, wide: true }] };
  });

  return {
    title: grammarPoint,
    sections: [
      {
        id: "grammar",
        title: "Section 1 — Grammar point",
        instructions:
          "Fill in the blank with the correct grammar form. Switch Casual/Polite and Now-Later/Past at the top to practice.",
        mode: "grammar-blank",
        tenseBubbles: ["Now-Later", "Past"],
        activeTense: "Now-Later",
        items: s1Items,
      },
      {
        id: "context",
        title: "Section 2 — Your words",
        instructions:
          "Write your own sentences using this grammar in the boxes below.",
        mode: "context-blank",
        items: s2Items,
      },
    ],
  };
}

async function generateWithOpenAi(
  env: EnvGenerate,
  grammarPoint: string,
  studentUsername: string,
  youtubeUrl: string,
  notes: string
): Promise<Record<string, unknown>> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("SKIP");

  const userPrompt = [
    `Grammar point: ${grammarPoint}`,
    `Student: ${studentUsername}`,
    youtubeUrl ? `YouTube: ${youtubeUrl}` : "",
    notes ? `Notes: ${notes}` : "",
    "Section 1: 5 grammar blanks with full variant grid. Section 2: 3 open wide blanks (one per item).",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.45,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    console.error("OpenAI error", res.status, await res.text());
    throw new Error("AI_FAILED");
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI_EMPTY");

  const parsed = extractJsonObject(content) as { assignment?: Record<string, unknown> };
  if (!parsed.assignment?.sections) throw new Error("AI_INVALID");
  return parsed.assignment;
}

async function generateWithCloudflareAi(
  env: EnvGenerate,
  grammarPoint: string,
  studentUsername: string,
  youtubeUrl: string,
  notes: string
): Promise<Record<string, unknown>> {
  if (!env.AI) throw new Error("SKIP");

  const userPrompt = [
    `Grammar: ${grammarPoint}`,
    `Student: ${studentUsername}`,
    youtubeUrl ? `YouTube: ${youtubeUrl}` : "",
    notes ? `Notes: ${notes}` : "",
    "Return JSON only.",
  ]
    .filter(Boolean)
    .join("\n");

  const result = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });

  const content = result.response;
  if (!content) throw new Error("AI_EMPTY");

  const parsed = extractJsonObject(content) as { assignment?: Record<string, unknown> };
  if (!parsed.assignment?.sections) throw new Error("AI_INVALID");
  return parsed.assignment;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("TIMEOUT")), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

export async function generateHomeworkWithAi(
  data: HomeworkGenerateRequest,
  env: EnvGenerate
): Promise<HomeworkGenerateResult> {
  if (!isTeacherUser(env, data.teacherUsername)) {
    throw new Error("TEACHER_ONLY");
  }

  const grammarPoint = String(data.grammarPoint || "").trim();
  const studentUsername = String(data.studentUsername || "")
    .trim()
    .toLowerCase();
  if (!grammarPoint) throw new Error("GRAMMAR_REQUIRED");
  if (!studentUsername) throw new Error("STUDENT_REQUIRED");

  const youtubeUrl = String(data.youtubeUrl || "").trim();
  const notes = String(data.notes || "").trim();

  let draft: Record<string, unknown>;
  let source: HomeworkGenerateResult["source"] = "template";

  draft = generateHomeworkFromTemplate(grammarPoint, notes);
  source = "template";

  if (env.OPENAI_API_KEY?.trim()) {
    try {
      const aiDraft = await withTimeout(
        generateWithOpenAi(env, grammarPoint, studentUsername, youtubeUrl, notes),
        10000
      );
      draft = aiDraft;
      source = "openai";
    } catch (err) {
      console.warn("OpenAI homework draft skipped, using built-in template:", err);
    }
  }

  const assignment = normalizeAssignment(draft, grammarPoint, studentUsername, youtubeUrl);
  const catalogEntry = buildCatalogEntry(assignment, studentUsername, grammarPoint, youtubeUrl);

  console.log(
    `homework-generate: ${source} id=${String(assignment.id)} s1=${
      ((assignment.sections as unknown[])?.[0] as { items?: unknown[] })?.items?.length ?? 0
    }`
  );

  return { assignment, catalogEntry, source };
}
