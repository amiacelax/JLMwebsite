// Sends one prompt to Claude through the Cursor SDK and prints the reply text.
// usage: node cursor_ask.mjs <prompt-file> [model]     (CURSOR_API_KEY in the environment)
// (The Python Cursor SDK's bridge doesn't work on Windows yet, so we use the TypeScript one.)
import { Agent } from "@cursor/sdk";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const prompt = readFileSync(process.argv[2], "utf8");
const model = process.argv[3] || "claude-sonnet-5-5";
const empty = mkdtempSync(join(tmpdir(), "lesson-ask-"));   // empty folder: nothing to touch

try {
  const result = await Agent.prompt(prompt, {
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: model },
    local: { cwd: empty },
  });
  if (result.status !== "finished") {
    console.error("run status: " + result.status);
    process.exit(2);
  }
  process.stdout.write(result.result ?? "");
  process.exit(0);
} catch (err) {
  console.error("startup failed: " + (err?.message ?? err));
  process.exit(1);
}
