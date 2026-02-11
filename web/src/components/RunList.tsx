//ai_tesm/web/src/components/RunList.tsx
import React, { useEffect, useMemo, useState } from "react";
import { listRuns, type RunIndexItem } from "../api";

export default function RunList({ onSelect }: { onSelect: (runId: string) => void }) {
  const [runs, setRuns] = useState<RunIndexItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const MAX = 5;

  async function refresh() {
    setErr(null);
    try {
      const r = await listRuns();
      setRuns(Array.isArray(r) ? r : []);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  const view = useMemo(() => (showAll ? runs : runs.slice(0, MAX)), [runs, showAll]);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h2>Runs</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn secondary" onClick={refresh}>Refresh</button>
          <button className="btn secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show last ${MAX}` : "Show all"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="small" style={{ color: "#ffb4b4" }}>{err}</div>
      ) : null}

      <div className="list">
        {view.map((r) => (
          <div key={r.runId} className="item" onClick={() => onSelect(r.runId)} role="button">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontWeight: 500 }}>{r.objective ?? "(no objective)"}</div>
              <div className="small">{String(r.status ?? "unknown")}</div>
            </div>
            <div className="small">{r.runId}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
