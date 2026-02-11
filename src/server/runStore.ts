//ai_team/src/server/runStore.ts
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type RunIndexItem = {
  runId: string;
  objective: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "done" | "failed" | "unknown";
};

const RUN_DIR = join(process.cwd(), "logs", "runs");
mkdirSync(RUN_DIR, { recursive: true });

function fp(runId: string) {
  return join(RUN_DIR, `${runId}.json`);
}

export function saveTrace(runId: string, trace: unknown) {
  writeFileSync(fp(runId), JSON.stringify(trace, null, 2), "utf-8");
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

      const status =
        (t?.status as any) ??
        (t?.error ? "failed" : "done");

      return {
        runId,
        objective: t?.task?.objective ?? "",
        createdAt: t?.createdAt ?? "",
        updatedAt: t?.updatedAt ?? t?.createdAt ?? "",
        status: status ?? "unknown",
      };
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
