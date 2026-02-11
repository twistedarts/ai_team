//ai_team/web/src/components/CreateRun.tsx
import React, { useMemo, useState } from "react";
import { createRun } from "../api";

type Provider = "openai" | "gemini";
type LaneRole = "PLAN" | "CRITIQUE" | "REFRAME" | "REVISION" | "CONFIRM";

type LaneConfig = {
  enabled: boolean;
  id: string;     // XO-A, XO-B, WILD, GEMINI
  role: LaneRole; // what they do
  provider: Provider;
  model: string;
};

const OPENAI_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-5.2", "gpt-5.2-thinking"];
const GEMINI_MODELS = ["gemini-2.5-flash"];

export default function CreateRun({ onCreated }: { onCreated: (runId: string) => void }) {
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [lanes, setLanes] = useState<LaneConfig[]>([
    { enabled: true, id: "XO-A", role: "PLAN", provider: "openai", model: "gpt-5.2" },
    { enabled: true, id: "XO-B", role: "CRITIQUE", provider: "openai", model: "gpt-4o" },
    { enabled: true, id: "WILD", role: "REFRAME", provider: "openai", model: "gpt-4o-mini" },
    { enabled: true, id: "GEMINI", role: "REFRAME", provider: "gemini", model: "gemini-2.5-flash" },
  ]);

  const modelOptions = useMemo(() => ({ openai: OPENAI_MODELS, gemini: GEMINI_MODELS }), []);

  function updateLane(i: number, patch: Partial<LaneConfig>) {
    setLanes((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (!objective.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const payload = {
        objective: objective.trim(),
        runtime: {
          lanes: lanes.filter((l) => l.enabled),
        },
      };

      const res = await createRun(payload);
      if (res.status === "failed") {
        setErr(res.error ?? "run failed");
      } else {
        onCreated(res.runId);
        setObjective("");
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Create run</h2>

      <div className="small">Objective</div>
      <textarea
        className="textarea"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
        placeholder='e.g. "Put your search terms here."'
      />

      <div className="hr" />

      <h3>Agents</h3>
      <div className="small" style={{ marginBottom: 10 }}>
        Enable lanes, select provider + model, and set each lane’s role.
      </div>

      <div className="list">
        {lanes.map((lane, i) => (
          <div key={lane.id} className="item" style={{ cursor: "default" }}>
            <div style={{ display: "grid", gridTemplateColumns: "28px 80px 1fr 1fr 1fr", gap: 8, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={lane.enabled}
                onChange={(e) => updateLane(i, { enabled: e.target.checked })}
              />
              <div style={{ fontWeight: 500 }}>{lane.id}</div>

              <select className="select" value={lane.role} onChange={(e) => updateLane(i, { role: e.target.value as any })}>
                <option value="PLAN">PLAN</option>
                <option value="CRITIQUE">CRITIQUE</option>
                <option value="REFRAME">REFRAME</option>
                <option value="REVISION">REVISION</option>
                <option value="CONFIRM">CONFIRM</option>
              </select>

              <select
                className="select"
                value={lane.provider}
                onChange={(e) => {
                  const provider = e.target.value as Provider;
                  const firstModel = modelOptions[provider][0] ?? "";
                  updateLane(i, { provider, model: firstModel });
                }}
              >
                <option value="openai">openai</option>
                <option value="gemini">gemini</option>
              </select>

              <select className="select" value={lane.model} onChange={(e) => updateLane(i, { model: e.target.value })}>
                {modelOptions[lane.provider].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 10 }} />

      <button className="btn" onClick={submit} disabled={busy || !objective.trim()}>
        {busy ? "Starting…" : "Start run"}
      </button>

      {err && (
        <>
          <div className="hr" />
          <div className="small" style={{ color: "#ffb4b4" }}>{err}</div>
        </>
      )}
    </div>
  );
}
