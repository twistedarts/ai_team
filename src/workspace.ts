import { TaskInput, Workspace, uuid } from "./types.js";

export function createWorkspace(task: TaskInput): Workspace {
  return {
    id: uuid(),
    createdAt: new Date().toISOString(),
    task,
    outputs: [],
    trace: {
      traceVersion: "0.1.0"
    }
  };
}

export function addAgentOutput(ws: Workspace, out: any) {
  ws.outputs.push(out);
}

export function setValidator(ws: Workspace, vr: any) {
  ws.validator = vr;
}

export function setReport(ws: Workspace, report: any) {
  ws.report = report;
}

