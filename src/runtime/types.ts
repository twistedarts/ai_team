
import { z } from "zod";

export type UUID = string;
export const uuid = (): UUID =>
  `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

// -----------------------------
// Public lanes + provider/model
// -----------------------------

export type LaneId = "AI1" | "AI2" | "AI3" | "AI4";
export type ProviderId = "openai" | "gemini" | "anthropic" | "azure_openai";

export type ModelSpec = {
  provider: ProviderId;
  model: string; // OpenAI model, Gemini model, Claude model, or Azure deployment name
  temperature?: number;
  max_output_tokens?: number;
};

// Lane role is selectable per run. Keep this tight; expand later if needed.
export type LaneRole = "PLAN" | "CRITIQUE" | "REFRAME" | "REVISION" | "CONFIRM";

export type LaneConfig = {
  id: LaneId;
  enabled: boolean;
  role: LaneRole;
  spec: ModelSpec;
};

export type RuntimeConfig = {
  lanes: LaneConfig[];
  // dev-only optional fields; do not use for user-facing taxonomy
  debug?: boolean;
};

// -----------------------------
// Existing core types
// -----------------------------

export type ValidationStatus = "PASS" | "FAIL";
export type RuntimeStatus = "READY_FOR_COMMIT" | "NEEDS_REVISION" | "ABSTAIN";
export type ConsensusDecision = "PROCEED" | "REVISE" | "STOP";

export type ArtifactKind = "diff" | "file" | "command" | "note";

// RuntimeConfig is embedded under task.inputs.runtime
export const RuntimeConfigSchema = z.object({
  lanes: z
    .array(
      z.object({
        id: z.enum(["AI1", "AI2", "AI3", "AI4"]),
        enabled: z.boolean().default(true),
        role: z.enum(["PLAN", "CRITIQUE", "REFRAME", "REVISION", "CONFIRM"]),
        spec: z.object({
          provider: z.enum(["openai", "gemini", "anthropic", "azure_openai"]),
          model: z.string().min(1),
          temperature: z.number().optional(),
          max_output_tokens: z.number().int().optional()
        })
      })
    )
    .default([])
});

export const TaskInputSchema = z.object({
  taskId: z.string(),
  objective: z.string(),
  constraints: z
    .object({
      noNetwork: z.boolean().default(true),
      mustBeDeterministic: z.boolean().default(true),
      maxIterations: z.number().int().min(1).max(10).default(3)
    })
    .passthrough(),
  inputs: z
    .object({
      files: z.array(z.string()).default([]),
      notes: z.string().optional(),
      runtime: RuntimeConfigSchema.optional() // <--- NEW
    })
    .passthrough()
});

export type TaskInput = z.infer<typeof TaskInputSchema>;

export type ClaimRisk = "low" | "med" | "high";

export interface Claim {
  id: string;
  text: string;
  dependsOn: string[];
  risk: ClaimRisk;
}

export interface Step {
  id: string;
  action: string;
  pre: string[];
  post: string[];
  evidenceNeeded: string[];
}

export interface Assumption {
  id: string;
  text: string;
  isVerified: boolean;
}

export interface Artifact {
  kind: ArtifactKind;
  content: string;
}

export type AgentName = LaneId; // keep compatibility for now inside runtime code (public name only)
export type AgentType = Exclude<LaneRole, "CONFIRM">; 

export interface AgentOutput {
  agent: AgentName;
  type: AgentType;
  claims: Claim[];
  steps: Step[];
  assumptions: Assumption[];
  artifacts: Artifact[];
}

export interface ValidatorCheck {
  name: string;
  status: ValidationStatus;
  details?: string;
}

export interface ValidatorResult {
  validator: "CODE_VALIDATOR";
  status: ValidationStatus;
  checks: ValidatorCheck[];
  blocking: boolean;
  timestamp: string;
}

export interface ConsensusReport {
  taskId: UUID;

  // what the human is approving/rejecting
  proposedOutput: string;

  status: RuntimeStatus;
  consensus: {
    decision: ConsensusDecision;
    confidence: number; // 0..1
    reasons: string[];
  };
  dissent: { agent: AgentName; issue: string; severity: ClaimRisk }[];
  validation: { status: ValidationStatus; summary: string };
  nextActions: { label: string; requiresCommit: boolean }[];
}

export interface Workspace {
  id: UUID;
  createdAt: string;
  task: TaskInput;

  outputs: AgentOutput[];
  validator?: ValidatorResult;
  report?: ConsensusReport;

  trace: Record<string, unknown>;
}

