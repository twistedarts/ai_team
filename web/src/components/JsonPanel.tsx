import React, { useMemo, useState } from "react";

type Props = {
  title?: string;
  data: unknown;
  collapsedByDefault?: boolean;
};

function safeJson(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

// ✅ Named export expected by RunView.tsx:  import { JsonPanel } from "./JsonPanel";
export function JsonPanel({ title = "json", data, collapsedByDefault = false }: Props) {
  const [open, setOpen] = useState(!collapsedByDefault);
  const text = useMemo(() => safeJson(data), [data]);

  return (
    <div className="card" style={{ background: "#0c1020" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 800, fontSize: 12 }}>{title}</div>
        <button className="btn secondary smallBtn" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Show"}
        </button>
      </div>

      {open && (
        <pre style={{ marginTop: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {text}
        </pre>
      )}
    </div>
  );
}

// ✅ Also export default for flexibility (won’t hurt)
export default JsonPanel;
