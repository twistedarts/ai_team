// ai_team/web/src/components/RunView.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { commitDecision, getPending, loadRunTrace, type Decision, type PendingEnvelope } from "../api";
import JsonPanel from "./JsonPanel";

const TRACE_POLL_MS = 900;
const TIMELINE_HEIGHT = 420;
const RUNNING_STALE_MS = 12_000; // if "running" but no updates for 12s, treat as stale

function pickNote(o: any): string {
  const note = (o?.artifacts || []).find((a: any) => a?.kind === "note")?.content;
  return note ? String(note) : "";
}

function formatStepsAll(steps: any[]): string {
  if (!Array.isArray(steps) || steps.length === 0) return "";
  return steps
    .map((s, i) => `${i + 1}. ${String(s?.action ?? "").trim() || "(empty step)"}`)
    .join("\n");
}

function findBestAI1(trace: any) {
  const outs = Array.isArray(trace?.outputs) ? trace.outputs : [];
  for (let i = outs.length - 1; i >= 0; i--) {
    const o = outs[i];
    if (o?.agent === "AI1" && o?.type === "REVISION") return o;
  }
  for (let i = outs.length - 1; i >= 0; i--) {
    const o = outs[i];
    if (o?.agent === "AI1" && o?.type === "PLAN") return o;
  }
  return null;
}

function findLastLane(trace: any, laneId: string) {
  const outs = Array.isArray(trace?.outputs) ? trace.outputs : [];
  for (let i = outs.length - 1; i >= 0; i--) {
    const o = outs[i];
    if (String(o?.agent ?? "").toUpperCase() === laneId.toUpperCase()) return o;
  }
  return null;
}

function buildFinalHuman(trace: any): string {
  const ai1 = findBestAI1(trace);
  const ai1Note = ai1 ? pickNote(ai1).trim() : "";
  const ai1Steps = ai1 ? formatStepsAll(ai1?.steps ?? []) : "";

  const ai4 = findLastLane(trace, "AI4");
  const ai4Note = ai4 ? pickNote(ai4).trim() : "";

  const parts: string[] = [];
  if (ai1Note) parts.push(ai1Note);
  if (!ai1Note && ai4Note) parts.push(ai4Note);
  if (ai1Steps) parts.push(`\n\nSteps:\n${ai1Steps}`);

  return parts.join("").trim();
}

function parseUpdatedAt(trace: any): number | null {
  const s = trace?.updatedAt ?? trace?.trace?.updatedAt ?? null;
  if (!s) return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? t : null;
}

export default function RunView({ runId }: { runId: string }) {
  const [trace, setTrace] = useState<any>(null);
  const [pending, setPending] = useState<PendingEnvelope | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [redirectObjective, setRedirectObjective] = useState("");

  const [autoFollow, setAutoFollow] = useState(true);
  const [showCommitGate, setShowCommitGate] = useState(true);
  const [finalOpen, setFinalOpen] = useState(false);

  const pollRef = useRef<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const lastOutputsLenRef = useRef(0);

  function scrollTimelineToBottom() {
    if (!autoFollow) return;
    requestAnimationFrame(() => {
      timelineEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    });
  }

  async function refreshTraceOnce() {
    try {
      const t = await loadRunTrace(runId);
      setTrace(t);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function refreshPendingOnce() {
    try {
      const p = await getPending(runId);
      setPending(p);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  function startPollingFallback() {
    stopPollingFallback();
    pollRef.current = window.setInterval(() => {
      void refreshTraceOnce();
      void refreshPendingOnce();
    }, TRACE_POLL_MS);
  }

  function stopPollingFallback() {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = null;
  }

  function startSSE() {
    stopSSE();
    const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
    esRef.current = es;

    es.addEventListener("snapshot", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data || "{}");
        if (data?.trace !== undefined) setTrace(data.trace);
        if (data?.pending !== undefined) setPending(data.pending);
        setErr(null);
        requestAnimationFrame(() => scrollTimelineToBottom());
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    });

    es.addEventListener("error", () => {
      stopSSE();
      startPollingFallback();
    });
  }

  function stopSSE() {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  }

  useEffect(() => {
    setTrace(null);
    setPending(null);
    setRedirectObjective("");
    setErr(null);
    setShowCommitGate(true);
    setFinalOpen(false);
    lastOutputsLenRef.current = 0;

    void refreshTraceOnce();
    void refreshPendingOnce();
    startSSE();

    return () => {
      stopSSE();
      stopPollingFallback();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  const outputs = Array.isArray(trace?.outputs) ? trace.outputs : [];
  const rawStatus = String(trace?.status ?? "unknown").toLowerCase();

  const updatedAtMs = parseUpdatedAt(trace);
  const ageMs = updatedAtMs ? Date.now() - updatedAtMs : null;

  const isTerminal = rawStatus === "done" || rawStatus === "failed";
  const isRunningFresh = rawStatus === "running" && !isTerminal && (ageMs === null || ageMs < RUNNING_STALE_MS);
  const isRunningStale = rawStatus === "running" && !isTerminal && ageMs !== null && ageMs >= RUNNING_STALE_MS;

  useEffect(() => {
    const len = outputs.length;
    if (len > lastOutputsLenRef.current) {
      lastOutputsLenRef.current = len;
      scrollTimelineToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outputs.length, autoFollow]);

  const gateStatus = pending?.gateStatus ?? "LOADING";
  const report = pending && (pending as any).pending ? (pending as any).report : null;
  const canCommit = Boolean(report && gateStatus === "READY_FOR_COMMIT");

  const humanDecision = trace?.trace?.humanDecision?.decision ?? null;
  const committed = Boolean(humanDecision);
  const approved = humanDecision === "approve";

  useEffect(() => {
    if (approved) {
      setFinalOpen(true);
      setShowCommitGate(false);
    } else if (committed) {
      setShowCommitGate(false);
    } else if (canCommit) {
      setShowCommitGate(true);
    }
  }, [approved, committed, canCommit]);

  const proposedText = useMemo(() => {
    const fromReport = String((report as any)?.proposedOutput ?? "").trim();
    if (fromReport) return fromReport;

    const ai1 = findBestAI1(trace);
    const note = ai1 ? pickNote(ai1).trim() : "";
    const steps = ai1 ? formatStepsAll(ai1?.steps ?? []) : "";
    const bits: string[] = [];
    if (note) bits.push(note);
    if (steps) bits.push(`\n\nSteps:\n${steps}`);
    return bits.join("").trim() || "(no proposal yet)";
  }, [report, trace]);

  const finalText = useMemo(() => buildFinalHuman(trace), [trace]);

  async function doCommit(decision: Decision) {
    setBusy(true);
    setErr(null);
    try {
      await commitDecision(runId, decision, redirectObjective.trim());
      await refreshPendingOnce();
      await refreshTraceOnce();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div>
            <h2>Run</h2>
            <div className="small">{runId}</div>
            <div className="small">
              {updatedAtMs ? `updated: ${new Date(updatedAtMs).toLocaleString()}` : "updated: (unknown)"}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn secondary" onClick={() => void refreshTraceOnce()} disabled={busy}>
              Refresh trace
            </button>
            <button className="btn secondary" onClick={() => void refreshPendingOnce()} disabled={busy}>
              Refresh pending
            </button>
          </div>
        </div>

        <div className="hr" />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span className="badge">
            status: {rawStatus}
            {isRunningFresh ? <span className="spinner" /> : null}
            {isRunningStale ? <span style={{ marginLeft: 8, opacity: 0.85 }}>(stale)</span> : null}
          </span>
          <span className="badge">gate: {gateStatus}</span>
          <span className="badge">outputs: {outputs.length}</span>

          <label className="small" style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={autoFollow} onChange={(e) => setAutoFollow(e.target.checked)} />
            Auto-follow
          </label>
        </div>

        {err && (
          <>
            <div className="hr" />
            <div className="small" style={{ color: "#ffb4b4" }}>
              {err}
            </div>
          </>
        )}
      </div>

      {approved && finalText ? (
        <details className="card" open={finalOpen} onToggle={(e) => setFinalOpen((e.target as HTMLDetailsElement).open)}>
          <summary className="small" style={{ cursor: "pointer" }}>
            Final output (approved)
          </summary>
          <div style={{ height: 10 }} />
          <div className="small" style={{ whiteSpace: "pre-wrap" }}>
            {finalText}
          </div>
        </details>
      ) : null}

      {showCommitGate && canCommit && !committed ? (
        <div className="card">
          <h3>Commit gate</h3>
          <div className="small" style={{ marginBottom: 8 }}>
            READY_FOR_COMMIT. Human decision required.
          </div>

          <div className="hr" />

          <div className="small" style={{ fontWeight: 500, marginBottom: 6 }}>
            Proposed output
          </div>

          <div
            style={{
              maxHeight: 260,
              overflowY: "auto",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 10,
              padding: 10,
            }}
          >
            <div className="small" style={{ whiteSpace: "pre-wrap" }}>
              {proposedText || "(no proposal yet)"}
            </div>
          </div>

          <div className="hr" />

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" disabled={busy} onClick={() => void doCommit("approve")}>
              Approve
            </button>
            <button className="btn danger" disabled={busy} onClick={() => void doCommit("reject")}>
              Reject
            </button>
            <button
              className="btn secondary"
              disabled={busy || !redirectObjective.trim()}
              onClick={() => void doCommit("redirect")}
              title="Redirect requires a new objective"
            >
              Redirect
            </button>
          </div>

          <div style={{ height: 10 }} />
          <div className="small">Redirect objective</div>
          <input
            className="input"
            value={redirectObjective}
            onChange={(e) => setRedirectObjective(e.target.value)}
            placeholder='e.g. "Revise: include exact commands for QLoRA setup + training script"'
          />
        </div>
      ) : null}

      <details className="card" open>
        <summary className="small" style={{ cursor: "pointer" }}>
          Agent timeline
        </summary>
        <div style={{ height: 12 }} />

        <div style={{ maxHeight: TIMELINE_HEIGHT, overflowY: "auto", paddingRight: 6 }}>
          {outputs.length === 0 ? (
            <div className="small">(no outputs yet)</div>
          ) : (
            <div className="list">
              {outputs.map((o: any, idx: number) => {
                const note = pickNote(o);
                const steps = Array.isArray(o?.steps) ? o.steps : [];
                return (
                  <div key={`${idx}`} className="item" style={{ cursor: "default" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <div style={{ fontWeight: 600 }}>{o?.agent ?? "?"}</div>
                      <div className="small">{o?.type ?? ""}</div>
                    </div>

                    <div className="small" style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                      {note || "(no note)"}
                    </div>

                    {steps.length > 0 ? (
                      <>
                        <div className="small" style={{ marginTop: 10, fontWeight: 700 }}>
                          Steps
                        </div>
                        <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
                          {steps.map((s: any, i: number) => (
                            <li key={i} style={{ marginTop: 6 }}>
                              <div style={{ whiteSpace: "pre-wrap" }}>{String(s?.action ?? "")}</div>
                            </li>
                          ))}
                        </ol>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          <div ref={timelineEndRef} />
        </div>
      </details>

      <details className="card">
        <summary className="small" style={{ cursor: "pointer" }}>
          Dev panels (raw JSON)
        </summary>
        <div style={{ height: 12 }} />
        <div className="grid2">
          <JsonPanel title="Pending / report" data={pending} />
          <JsonPanel title="Trace" data={trace} />
        </div>
      </details>

      {isTerminal && !committed && !canCommit ? (
        <div className="card">
          <div className="small">Run finished with no commit gate (status: {rawStatus}).</div>
        </div>
      ) : null}
    </div>
  );
}
