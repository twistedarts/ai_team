import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { Orchestrator } from "./runtime/orchestrator.js";
import { CommandValidator } from "./runtime/validator/commandValidator.js";
import { uuid } from "./runtime/types.js";

async function main() {
  const taskId = uuid();
  const objective = process.argv.slice(2).join(" ") || "Demo task: implement debate loop runtime skeleton";

  const task = {
    taskId,
    objective,
    constraints: {
  noNetwork: true,
  mustBeDeterministic: true,
  maxIterations: 3,

  // New: side-effect/actuation policy
  noSideEffects: true,              // runtime must not send anything
  draftOnly: true,                  // only draft/stage artifacts are allowed
  requireHumanCommit: true,         // must go through commit gate to actuate
  actuationLayer: "os_intents",     // target actuator (ios/mac app intents)
  allowExternalCalls: false         // model must not call external services directly
},

    inputs: { files: [], notes: "v0.1 demo" }
  };

  const orch = new Orchestrator(new CommandValidator());
  const ws = await orch.run(task);

  mkdirSync("logs/runs", { recursive: true });
  const outPath = join("logs/runs", `${ws.id}.json`);
  writeFileSync(outPath, JSON.stringify(ws, null, 2), "utf-8");

  console.log(`\nTRACE saved: ${outPath}`);
}

main().catch((e) => {
  const msg =
    e instanceof Error
      ? (e.stack ?? e.message)
      : typeof e === "string"
        ? e
        : JSON.stringify(e, null, 2);

  process.stderr.write(msg + "\n");
  process.exit(1);
});

