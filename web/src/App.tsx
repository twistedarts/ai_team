import React, { useEffect, useState } from "react";
import CreateRun from "./components/CreateRun";
import RunList from "./components/RunList";
import RunView from "./components/RunView";
import { listRuns, type RunIndexItem } from "./api";

export default function App() {
  const [runs, setRuns] = useState<RunIndexItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setErr(null);
    try {
      const data = await listRuns();
      setRuns(data);
      if (!selected && data[0]?.runId) setSelected(data[0].runId);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>AI Team Console</div>
        <div className="small">A Multi-Agent Deterministic Runtime Orchestration Loop</div>
      </div>

      {err && (
        <div className="card" style={{ borderColor: "#7a2a2a" }}>
          <div className="small" style={{ color: "#ffb4b4" }}>{err}</div>
        </div>
      )}

      <div className="row">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CreateRun
            onCreated={(runId) => {
              setSelected(runId);
              refresh();
            }}
          />
          <RunList
            runs={runs}
            selected={selected}
            onSelect={(id) => setSelected(id)}
            onRefresh={refresh}
            loading={loading}
          />
        </div>

        <div>{selected ? <RunView runId={selected} /> : <div className="card">(select a run)</div>}</div>
      </div>
    </div>
  );
}
