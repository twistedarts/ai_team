import React, { useState } from "react";
import CreateRun from "./components/CreateRun";
import RunList from "./components/RunList";
import RunView from "./components/RunView";

export default function App() {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="container">
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>AI Team Console</div>
        <div className="small">A Multi-Agent Deterministic Runtime Orchestration Loop</div>
      </div>

      <div className="row">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <CreateRun
            onCreated={(runId) => {
              setSelected(runId);
            }}
          />
          <RunList
            onSelect={(id) => setSelected(id)}
          />
        </div>

        <div>{selected ? <RunView key={selected} runId={selected} onRedirect={(newRunId) => { setSelected(newRunId); }} onRerun={(newRunId) => { setSelected(newRunId); }} /> : (
          <div className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 200, opacity: 0.6 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No job selected</div>
            <div className="small">Create a new run or select one from the list</div>
          </div>
        )}</div>
      </div>
    </div>
  );
}
