// ai_team/src/server/api.ts
import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";

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
 * SSE: snapshot stream.
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

type IncomingRuntime = {
  lanes?: any[];
};

type CreateRunBody = {
  objective?: string;
  constraints?: Record<string, unknown>;
  runtime?: IncomingRuntime;
};

/**
 * Create run (public taxonomy: AI1..AI4, runtime-selected providers/models per lane)
 */
app.post("/api/runs", (req: Request, res: Response) => {
  const runId = uuid();

  const body = (req.body ?? {}) as CreateRunBody;
  const objective = String(body.objective ?? "").trim();
  if (!objective) return res.status(400).json({ error: "objective required" });

  // Public default constraints (caller may override)
  const defaultConstraints = {
    noNetwork: true,
    mustBeDeterministic: true,
    maxIterations: 2,
  };

  const mergedConstraints = { ...defaultConstraints, ...(body.constraints ?? {}) };

  const lanes = Array.isArray(body.runtime?.lanes) ? body.runtime!.lanes : [];

  const task = {
    taskId: runId,
    objective,
    constraints: mergedConstraints,
    inputs: {
      files: [],
      notes: "",
      runtime: {
        lanes,
      },
    },
  };

  // Initial snapshot
  saveTrace(runId, {
    runId,
    task,
    status: "running",
  });

  (async () => {
    try {
      const orch = new Orchestrator(new CommandValidator());
      const ws = await orch.run(task);
      saveTrace(runId, {
        ...ws,
        runId,
        task,
        status: "done",
      });
    } catch (e: any) {
      saveTrace(runId, {
        runId,
        task,
        status: "failed",
        error: e?.stack ?? String(e),
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
    // inherit lanes + constraints from existing trace if present
    let inheritedLanes: any[] = [];
    let inheritedConstraints: Record<string, unknown> = {
      noNetwork: true,
      mustBeDeterministic: true,
      maxIterations: 2,
    };

    try {
      const t: any = loadTrace(runId);
      const lanes = t?.task?.inputs?.runtime?.lanes;
      if (Array.isArray(lanes)) inheritedLanes = lanes;
      const c = t?.task?.constraints;
      if (c && typeof c === "object") inheritedConstraints = { ...inheritedConstraints, ...c };
    } catch {
      // ignore
    }

    const newRunId = uuid();
    const task = {
      taskId: newRunId,
      objective: redirectObjective,
      constraints: inheritedConstraints,
      inputs: {
        files: [],
        notes: `(redirected from ${runId})`,
        runtime: { lanes: inheritedLanes },
      },
    };

    saveTrace(newRunId, {
      runId: newRunId,
      task,
      status: "running",
    });

    (async () => {
      try {
        const orch = new Orchestrator(new CommandValidator());
        const ws = await orch.run(task);
        saveTrace(newRunId, {
          ...ws,
          runId: newRunId,
          task,
          status: "done",
        });
      } catch (e: any) {
        saveTrace(newRunId, {
          runId: newRunId,
          task,
          status: "failed",
          error: e?.stack ?? String(e),
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
