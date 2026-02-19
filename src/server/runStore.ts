// ai_team/src/server/runStore.ts
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type RunStatus = "running" | "done" | "failed" | "unknown";

export type RunIndexItem = {
  runId: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
};

const RUN_DIR = join(process.cwd(), "logs", "runs");
mkdirSync(RUN_DIR, { recursive: true });

function fp(runId: string) {
  return join(RUN_DIR, `${runId}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

// Ensure every persisted snapshot has stable timestamps + a sane status.
function normalizeSnapshot(runId: string, raw: any): any {
  const t = raw && typeof raw === "object" ? raw : {};

  // Always stamp runId for sanity.
  if (!t.runId) t.runId = runId;

  const createdAt = typeof t.createdAt === "string" && t.createdAt ? t.createdAt : nowIso();
  const updatedAt = nowIso();

  // Derive status if missing / invalid.
  let status: RunStatus =
    t.status === "running" || t.status === "done" || t.status === "failed" || t.status === "unknown"
      ? t.status
      : "unknown";

  // If error exists, status must be failed.
  if (t.error) status = "failed";

  // If a human decision exists, the run is terminal (done) even if some earlier snapshot said running.
  const humanDecision =
    t?.trace?.humanDecision?.decision ??
    t?.trace?.humanDecision ??
    null;

  if (humanDecision && status === "running") status = "done";

  // If the caller says done/failed, keep it terminal.
  if (t.status === "done") status = "done";
  if (t.status === "failed") status = "failed";

  t.createdAt = createdAt;
  t.updatedAt = updatedAt;
  t.status = status;

  return t;
}

export function saveTrace(runId: string, trace: unknown) {
  const normalized = normalizeSnapshot(runId, trace as any);
  writeFileSync(fp(runId), JSON.stringify(normalized, null, 2), "utf-8");
}

export function loadTrace(runId: string) {
  return JSON.parse(readFileSync(fp(runId), "utf-8"));
}

export function traceMeta(runId: string): { exists: boolean; mtimeMs?: number } {
  try {
    const st = statSync(fp(runId));
    return { exists: true, mtimeMs: st.mtimeMs };
  } catch {
    return { exists: false };
  }
}

export function listRuns(): RunIndexItem[] {
  const files = readdirSync(RUN_DIR).filter((f) => f.endsWith(".json"));

  return files
    .map((f) => {
      const runId = f.replace(/\.json$/, "");
      const t: any = loadTrace(runId);

      const status: RunStatus =
        t?.status === "running" || t?.status === "done" || t?.status === "failed" || t?.status === "unknown"
          ? t.status
          : t?.error
            ? "failed"
            : "unknown";

      return {
        runId,
        objective: t?.task?.objective ?? "",
        createdAt: t?.createdAt ?? "",
        updatedAt: t?.updatedAt ?? t?.createdAt ?? "",
        status,
      };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

const STALE_MS = 5 * 60 * 1000; // 5 minutes

export function clearStaleRuns(): number {
  const files = readdirSync(RUN_DIR).filter((f) => f.endsWith(".json"));
  let cleared = 0;
  const now = Date.now();

  for (const f of files) {
    const runId = f.replace(/\.json$/, "");
    try {
      const t: any = loadTrace(runId);
      if (t?.status === "running") {
        const updated = Date.parse(t?.updatedAt ?? "");
        if (!Number.isFinite(updated) || now - updated > STALE_MS) {
          t.status = "failed";
          t.error = "Marked as failed (stale)";
          t.updatedAt = nowIso();
          writeFileSync(fp(runId), JSON.stringify(t, null, 2), "utf-8");
          cleared++;
        }
      }
    } catch {
      // skip bad files
    }
  }
  return cleared;
}
