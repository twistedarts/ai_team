// ai_team/web/src/components/CreateRun.tsx
import React, { useMemo, useState } from "react";
import { createRun } from "../api";

type Provider = "openai" | "gemini" | "azure_openai" | "anthropic";
type LaneRole = "PLAN" | "CRITIQUE" | "REFRAME" | "REVISION" | "CONFIRM";

type ModelSpec = {
  provider: Provider;
  model: string;
  temperature?: number;
  max_output_tokens?: number;
};

type LaneConfig = {
  enabled: boolean;
  id: "AI1" | "AI2" | "AI3" | "AI4";
  role: LaneRole;
  spec: ModelSpec;
};

const MODEL_CATALOG: Record<Provider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-5.2", "gpt-5.2-thinking"],
  gemini: ["gemini-2.5-flash"],
  azure_openai: [
    // In Azure this is typically the DEPLOYMENT name, not the base model name.
    // Put your deployment names here (examples):
    "gpt-4o-deploy",
    "gpt-4o-mini-deploy",
  ],
  anthropic: [
    // Examples; adjust to what you actually enable.
    "claude-3-5-sonnet-latest",
    "claude-3-5-haiku-latest",
  ],
};

function firstModel(provider: Provider): string {
  return MODEL_CATALOG[provider][0] ?? "";
}

export default function CreateRun({ onCreated }: { onCreated: (runId: string) => void }) {
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [lanes, setLanes] = useState<LaneConfig[]>([
    { enabled: true, id: "AI1", role: "PLAN", spec: { provider: "openai", model: "gpt-5.2" } },
    { enabled: true, id: "AI2", role: "CRITIQUE", spec: { provider: "openai", model: "gpt-4o" } },
    { enabled: true, id: "AI3", role: "REFRAME", spec: { provider: "openai", model: "gpt-4o-mini" } },
    { enabled: true, id: "AI4", role: "REFRAME", spec: { provider: "gemini", model: "gemini-2.5-flash" } },
  ]);

  const providerOptions: Provider[] = useMemo(
    () => ["openai", "gemini", "azure_openai", "anthropic"],
    []
  );

  function updateLane(i: number, patch: Partial<LaneConfig>) {
    setLanes((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function updateLaneSpec(i: number, patch: Partial<ModelSpec>) {
    setLanes((prev) =>
      prev.map((l, idx) => (idx === i ? { ...l, spec: { ...l.spec, ...patch } } : l))
    );
  }

  async function submit() {
    if (!objective.trim()) return;
    setBusy(true);
    setErr(null);

    try {
      const enabledLanes = lanes
        .filter((l) => l.enabled)
        .map((l) => ({
          id: l.id,
          enabled: true,
          role: l.role,
          spec: {
            provider: l.spec.provider,
            model: l.spec.model,
            temperature: l.spec.temperature,
            max_output_tokens: l.spec.max_output_tokens,
          },
        }));

      const payload = {
        objective: objective.trim(),
        runtime: {
          lanes: enabledLanes,
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
        placeholder='e.g. "How would I plan an engine overhaul?"'
      />

      <div className="hr" />

      <h3>Agents</h3>
      <div className="small" style={{ marginBottom: 10 }}>
        Enable lanes, select provider + model, and set each lane’s role. No lane is tied to a provider.
      </div>

      <div className="list">
        {lanes.map((lane, i) => {
          const models = MODEL_CATALOG[lane.spec.provider] ?? [];
          return (
            <div key={lane.id} className="item" style={{ cursor: "default" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "28px 70px 1fr 1fr 1fr",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={lane.enabled}
                  onChange={(e) => updateLane(i, { enabled: e.target.checked })}
                />
                <div style={{ fontWeight: 600 }}>{lane.id}</div>

                <select
                  className="select"
                  value={lane.role}
                  onChange={(e) => updateLane(i, { role: e.target.value as LaneRole })}
                >
                  <option value="PLAN">PLAN</option>
                  <option value="CRITIQUE">CRITIQUE</option>
                  <option value="REFRAME">REFRAME</option>
                  <option value="REVISION">REVISION</option>
                  <option value="CONFIRM">CONFIRM</option>
                </select>

                <select
                  className="select"
                  value={lane.spec.provider}
                  onChange={(e) => {
                    const provider = e.target.value as Provider;
                    updateLaneSpec(i, { provider, model: firstModel(provider) });
                  }}
                >
                  {providerOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <select
                  className="select"
                  value={lane.spec.model}
                  onChange={(e) => updateLaneSpec(i, { model: e.target.value })}
                  disabled={models.length === 0}
                >
                  {models.length === 0 ? (
                    <option value="">(no models configured)</option>
                  ) : (
                    models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div style={{ height: 8 }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  temp
                  <input
                    className="input"
                    style={{ width: 110 }}
                    type="number"
                    step="0.05"
                    min="0"
                    max="2"
                    value={lane.spec.temperature ?? ""}
                    onChange={(e) =>
                      updateLaneSpec(i, {
                        temperature: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="(default)"
                  />
                </label>

                <label className="small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  max tokens
                  <input
                    className="input"
                    style={{ width: 140 }}
                    type="number"
                    step="50"
                    min="1"
                    value={lane.spec.max_output_tokens ?? ""}
                    onChange={(e) =>
                      updateLaneSpec(i, {
                        max_output_tokens: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder="(default)"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 10 }} />

      <button className="btn" onClick={submit} disabled={busy || !objective.trim()}>
        {busy ? "Starting…" : "Start run"}
      </button>

      {err && (
        <>
          <div className="hr" />
          <div className="small" style={{ color: "#ffb4b4" }}>
            {err}
          </div>
        </>
      )}
    </div>
  );
}
