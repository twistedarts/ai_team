import { spawn } from "node:child_process";
import { Validator } from "./index.js";
import { AgentOutput, ValidatorResult, ValidatorCheck, ValidationStatus } from "../types.js";

type Cmd = { cmd: string; args: string[]; name: string };

function run(cmd: Cmd): Promise<{ name: string; ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd.cmd, cmd.args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.stderr.on("data", (d) => (out += d.toString()));
    p.on("close", (code) => resolve({ name: cmd.name, ok: code === 0, out }));
  });
}

/**
 * v0.1: optional validator that runs commands discovered in artifacts:
 * - looks for artifacts of kind "command" with content like: `npm test`
 * - runs them sequentially
 */
export class CommandValidator implements Validator {
  async validate(outputs: AgentOutput[]): Promise<ValidatorResult> {
    const commands: Cmd[] = [];

    for (const o of outputs) {
      for (const a of o.artifacts) {
        if (a.kind === "command") {
          const parts = a.content.trim().split(/\s+/);
          const [cmd, ...args] = parts;
          if (cmd) commands.push({ cmd, args, name: a.content.trim() });
        }
      }
    }

    if (commands.length === 0) {
      // PASS with no checks is allowed (you can tighten this later)
      return {
        validator: "CODE_VALIDATOR",
        status: "PASS",
        checks: [{ name: "no_checks", status: "PASS", details: "No command artifacts provided." 
}],
        blocking: false,
        timestamp: new Date().toISOString()
      };
    }

    const checks: ValidatorCheck[] = [];
    for (const c of commands) {
      const r = await run(c);
      checks.push({
        name: r.name,
        status: r.ok ? "PASS" : "FAIL",
        details: r.out.slice(0, 4000)
      });
      if (!r.ok) {
        return {
          validator: "CODE_VALIDATOR",
          status: "FAIL",
          checks,
          blocking: true,
          timestamp: new Date().toISOString()
        };
      }
    }

    return {
      validator: "CODE_VALIDATOR",
      status: "PASS",
      checks,
      blocking: false,
      timestamp: new Date().toISOString()
    };
  }
}


