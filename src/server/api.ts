// ai_team/src/server/api.ts
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";

import { Profiles } from "./profiles.js";
import { saveTrace, listRuns, loadTrace, traceMeta } from "./runStore.js";

import { Orchestrator } from "../runtime/orchestrator.js";
import { CommandValidator } from "../runtime/validator/commandValidator.js";
import { uuid } from "../runtime/types.js";

import { getPendingCommit, resolveHumanCommit } from "../runtime/commit.js";
import type { HumanDecision } from "../runtime/commit.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/runs", (_req, res) => res.json(listRuns()));

app.get("/api/runs/:id", (req, res) => {
  try {
    res.json(loadTrace(String(req.params.id)));
  } catch (e: any) {
    res.status(404).json({ error: e?.message ?? "not found" });
  }
});

// ALWAYS 200. If no pending => pending:false
app.get("/api/runs/:id/pending", (req: Request, res: Response) => {
  const runId = String(req.params.id);
  const p = getPendingCommit(runId);

  if (!p) {
    return res.status(200).json({
      runId,
      pending: false,
      gateStatus: "NO_PENDING",
    });
  }

  return res.status(200).json({
    runId,
    pending: true,
    gateStatus: "READY_FOR_COMMIT",
    createdAt: p.createdAt,
    report: p.report,
    proposal: p.proposal,
  });
});

/**
 * SSE: snapshot stream. (Your current SSE implementation is fine.)
 */
app.get("/api/runs/:id/events", (req: Request, res: Response) => {
  const runId = String(req.params.id);

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let lastSig = "";

  const readSnapshot = () => {
    let trace: any = null;
    try {
      trace = loadTrace(runId);
    } catch {
      // ok
    }

    const p = getPendingCommit(runId);
    const pending = p
      ? {
          runId,
          pending: true,
          gateStatus: "READY_FOR_COMMIT",
          createdAt: p.createdAt,
          report: p.report,
          proposal: p.proposal,
        }
      : { runId, pending: false, gateStatus: "NO_PENDING" };

    const meta = traceMeta(runId);

    const sigObj = {
      m: meta?.mtimeMs ?? 0,
      s: trace?.status ?? null,
      u: trace?.updatedAt ?? null,
      p: (pending as any)?.pending ?? false,
      g: (pending as any)?.gateStatus ?? null,
    };
    const sig = JSON.stringify(sigObj);

    return { sig, payload: { trace, pending, meta } };
  };

  const tick = () => {
    const { sig, payload } = readSnapshot();
    if (sig !== lastSig) {
      lastSig = sig;
      send("snapshot", payload);
    }
  };

  tick();
  const interval = setInterval(tick, 400);
  const heartbeat = setInterval(() => send("heartbeat", { t: Date.now() }), 15000);

  req.on("close", () => {
    clearInterval(interval);
    clearInterval(heartbeat);
  });
});

/**
 * Create run
 */
app.post("/api/runs", (req: Request, res: Response) => {
  const runId = uuid();

  const objective = String(req.body?.objective ?? "").trim();
  if (!objective) return res.status(400).json({ error: "objective required" });

  const profileKey = String(req.body?.profile ?? "debug");
  const profileObj = (Profiles as any)[profileKey] ?? (Profiles as any)["debug"];
  if (!profileObj) return res.status(400).json({ error: `unknown profile: ${profileKey}` });

  const mergedConstraints = { ...(profileObj?.constraints ?? {}), ...(req.body?.constraints ?? {}) };
  const agentSet = String(req.body?.agentSet ?? "XO_WILD_CRITIC").toUpperCase().trim();

  const task = {
    taskId: runId,
    objective,
    constraints: mergedConstraints,
    inputs: {
      files: [],
      notes: `profile=${profileKey} agentSet=${agentSet}`,
      runtime: { profile: profileKey, agentSet },
    },
  };

  saveTrace(runId, {
    runId,
    task,
    status: "running",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  (async () => {
    try {
      const orch = new Orchestrator(new CommandValidator());
      const ws = await orch.run(task);
      saveTrace(runId, { ...ws, runId, task, status: "done", updatedAt: new Date().toISOString() });
    } catch (e: any) {
      saveTrace(runId, {
        runId,
        task,
        status: "failed",
        error: e?.stack ?? String(e),
        updatedAt: new Date().toISOString(),
      });
    }
  })();

  res.json({ runId, status: "running" });
});

/**
 * Commit (atomic redirect support)
 */
app.post("/api/runs/:id/commit", async (req: Request, res: Response) => {
  const runId = String(req.params.id);
  const decision = String(req.body?.decision ?? "").toLowerCase() as HumanDecision;
  const redirectObjective = String(req.body?.redirectObjective ?? "").trim();

  if (!["approve", "reject", "redirect"].includes(decision)) {
    return res.status(400).json({
      runId,
      committed: false,
      reason: "decision must be approve|reject|redirect",
    });
  }

  if (decision === "redirect" && !redirectObjective) {
    return res.status(400).json({
      runId,
      committed: false,
      reason: "redirectObjective required when decision=redirect",
    });
  }

  // 1) Resolve original commit (audit trail). Always 200 even if none pending.
  const ok = resolveHumanCommit(runId, decision, redirectObjective);
  if (!ok) {
    return res.status(200).json({
      runId,
      committed: false,
      reason: "NO_PENDING_COMMIT",
    });
  }

  // 2) If redirect: create a new run immediately and return its id
  if (decision === "redirect") {
    // inherit runtime hints from existing trace if present
    let profile = "debug";
    let agentSet = "XO_WILD_CRITIC";

    try {
      const t: any = loadTrace(runId);
      profile = String(t?.task?.inputs?.runtime?.profile ?? profile);
      agentSet = String(t?.task?.inputs?.runtime?.agentSet ?? agentSet);
    } catch {
      // ignore
    }

    // create new run using the same create logic
    const newRunId = uuid();
    const profileObj = (Profiles as any)[profile] ?? (Profiles as any)["debug"];
    const mergedConstraints = { ...(profileObj?.constraints ?? {}) };

    const task = {
      taskId: newRunId,
      objective: redirectObjective,
      constraints: mergedConstraints,
      inputs: {
        files: [],
        notes: `profile=${profile} agentSet=${agentSet} (redirected from ${runId})`,
        runtime: { profile, agentSet },
      },
    };

    saveTrace(newRunId, {
      runId: newRunId,
      task,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    (async () => {
      try {
        const orch = new Orchestrator(new CommandValidator());
        const ws = await orch.run(task);
        saveTrace(newRunId, { ...ws, runId: newRunId, task, status: "done", updatedAt: new Date().toISOString() });
      } catch (e: any) {
        saveTrace(newRunId, {
          runId: newRunId,
          task,
          status: "failed",
          error: e?.stack ?? String(e),
          updatedAt: new Date().toISOString(),
        });
      }
    })();

    return res.status(200).json({
      runId,
      committed: true,
      decision,
      redirectedToRunId: newRunId,
    });
  }

  return res.status(200).json({
    runId,
    committed: true,
    decision,
  });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
