import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "logs", "runs");
const files = readdirSync(dir).filter(f => f.endsWith(".json"));

const STALE_MS = 30_000;

const now = Date.now();
let changed = 0;

for (const f of files) {
  const p = join(dir, f);
  const runId = f.replace(/\.json$/, "");
  const raw = JSON.parse(readFileSync(p, "utf-8"));

  const updatedAt = Date.parse(raw?.updatedAt || raw?.createdAt || "");
  const age = Number.isFinite(updatedAt) ? (now - updatedAt) : Infinity;

  let status = raw?.status;
  if (raw?.error) status = "failed";
  if (raw?.trace?.humanDecision?.decision && status === "running") status = "done";

  if (status === "running" && age > STALE_MS) status = "unknown";

  if (status !== raw?.status) {
    raw.status = status;
    raw.updatedAt = new Date().toISOString();
    writeFileSync(p, JSON.stringify({ ...raw, runId }, null, 2), "utf-8");
    changed++;
  }
}

console.log(`Repaired ${changed} run(s).`);
