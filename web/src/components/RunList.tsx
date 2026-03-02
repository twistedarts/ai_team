
import React, { useEffect, useMemo, useRef, useState } from "react";
import { listRuns, type RunIndexItem } from "../api";

function currentRunIdFromHash(): string {
  const h = (window.location.hash || "").replace(/^#/, "").trim();
  return h || "";
}

export default function RunList({ onSelect }: { onSelect: (runId: string) => void }) {
  const [runs, setRuns] = useState<RunIndexItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<string>(() => currentRunIdFromHash());

  const MAX = 5;
  const pollRef = useRef<number | null>(null);

  async function refresh() {
    try {
      const r = await listRuns();
      setRuns(Array.isArray(r) ? r : []);
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  useEffect(() => {
    // Initial load
    void refresh();

    // Poll so the list updates when a new run is created (revise/redirect).
    pollRef.current = window.setInterval(() => {
      void refresh();
    }, 2000);

    // Update selected when hash changes (and refresh list on navigation).
    const onHash = () => {
      const id = currentRunIdFromHash();
      setSelected(id);
      void refresh();
      if (id) onSelect(id);
    };
    window.addEventListener("hashchange", onHash);

    // Refresh when tab becomes visible again.
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("visibilitychange", onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = useMemo(() => (showAll ? runs : runs.slice(0, MAX)), [runs, showAll]);

  function selectRun(runId: string) {
    setSelected(runId);
    // Keep routing consistent with the rest of your UI behavior.
    const nextHash = `#${runId}`;
    if (window.location.hash !== nextHash) window.location.hash = nextHash;
    onSelect(runId);
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <h2>Runs</h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn secondary" onClick={() => void refresh()}>
            Refresh
          </button>
          <button className="btn secondary" onClick={() => setShowAll((v) => !v)}>
            {showAll ? `Show last ${MAX}` : "Show all"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="small" style={{ color: "#ffb4b4" }}>
          {err}
        </div>
      ) : null}

      <div className="list">
        {view.map((r) => {
          const isSelected = r.runId === selected;
          return (
            <div
              key={r.runId}
              className="item"
              onClick={() => selectRun(r.runId)}
              role="button"
              style={{
                border: isSelected ? "1px solid rgba(255,255,255,0.35)" : undefined,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div style={{ fontWeight: 500 }}>{r.objective ?? "(no objective)"}</div>
                <div className="small">{String(r.status ?? "unknown")}</div>
              </div>
              <div className="small">{r.runId}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
