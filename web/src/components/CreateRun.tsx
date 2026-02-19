// ai_team/web/src/components/CreateRun.tsx
import React, { useState } from "react";
import { createRun } from "../api";

type Provider = "openai" | "gemini" | "azure_openai" | "anthropic";

type ModelSpec = {
  provider: Provider;
  model: string;
  temperature?: number;
  max_output_tokens?: number;
};

type LaneConfig = {
  enabled: boolean;
  id: "AI1" | "AI2" | "AI3" | "AI4";
  label: string;
  spec: ModelSpec;
};

const PROVIDER_CATALOG: Record<Provider, string> = {
  openai: "OpenAI",
  gemini: "Gemini",
  azure_openai: "Azure OpenAI",
  anthropic: "Anthropic",
};

const MODEL_CATALOG: Record<Provider, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-5.2", "gpt-5.2-thinking"],
  gemini: ["gemini-2.5-flash"],
  azure_openai: [
    "gpt-4o-deploy",
    "gpt-4o-mini-deploy",
  ],
  anthropic: [
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
  ],
};

// Role-appropriate defaults for temp and tokens
const LANE_DEFAULTS: Record<string, { temp: number; tokens: number }> = {
  AI1: { temp: 0.2, tokens: 1800 },   // Planner — structured, deterministic
  AI2: { temp: 0.2, tokens: 1200 },   // Critic — precise, analytical
  AI3: { temp: 0.7, tokens: 900 },    // Reframer — creative, divergent
  AI4: { temp: 0.75, tokens: 900 },   // Reframer — creative, divergent
};

export default function CreateRun({ onCreated }: { onCreated: (runId: string) => void }) {
  const [objective, setObjective] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [lanes, setLanes] = useState<LaneConfig[]>([
    { enabled: true, id: "AI1", label: "Planner", spec: { provider: "" as Provider, model: "", temperature: 0.2, max_output_tokens: 1800 } },
    { enabled: true, id: "AI2", label: "Critic", spec: { provider: "" as Provider, model: "", temperature: 0.2, max_output_tokens: 1200 } },
    { enabled: true, id: "AI3", label: "Reframer", spec: { provider: "" as Provider, model: "", temperature: 0.7, max_output_tokens: 900 } },
    { enabled: true, id: "AI4", label: "Reframer", spec: { provider: "" as Provider, model: "", temperature: 0.75, max_output_tokens: 900 } },
  ]);

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
      const ROLE_MAP: Record<string, string> = {
        AI1: "PLAN",
        AI2: "CRITIQUE",
        AI3: "REFRAME",
        AI4: "REFRAME",
      };

      const enabledLanes = lanes
        .filter((l) => l.enabled && l.spec.provider && l.spec.model)
        .map((l) => ({
          id: l.id,
          enabled: true,
          role: ROLE_MAP[l.id] ?? "REFRAME",
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

      <div className="list">
        {lanes.map((lane, i) => {
          const models = MODEL_CATALOG[lane.spec.provider] ?? [];
          const defaults = LANE_DEFAULTS[lane.id] ?? { temp: 0.5, tokens: 1000 };
          return (
            <div key={lane.id} className="item" style={{ cursor: "default" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 1fr 1fr",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{lane.id}</div>
                  <div className="small">{lane.label}</div>
                </div>

                <select
                  className="select"
                  value={lane.spec.provider}
                  onChange={(e) => {
                    const provider = e.target.value as Provider;
                    updateLaneSpec(i, { provider, model: "" });
                  }}
                >
                  <option value="">Provider</option>
                  {Object.entries(PROVIDER_CATALOG).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>

                <select
                  className="select"
                  value={lane.spec.model}
                  onChange={(e) => updateLaneSpec(i, { model: e.target.value })}
                  disabled={models.length === 0}
                >
                  <option value="">Model</option>
                  {models.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ height: 6 }} />

              <div style={{ display: "flex", gap: 12, alignItems: "center", paddingLeft: 0 }}>
                <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  temp
                  <input
                    className="input-narrow"
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
                    placeholder={String(defaults.temp)}
                  />
                </label>

                <label className="small" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  max tokens
                  <input
                    className="input-narrow"
                    type="number"
                    step="50"
                    min="1"
                    value={lane.spec.max_output_tokens ?? ""}
                    onChange={(e) =>
                      updateLaneSpec(i, {
                        max_output_tokens: e.target.value === "" ? undefined : Number(e.target.value),
                      })
                    }
                    placeholder={String(defaults.tokens)}
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
