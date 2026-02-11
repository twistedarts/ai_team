// ai_team/src/runtime/types.ts
import { z } from "zod";

export type UUID = string;
export const uuid = (): UUID =>
  `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;

export type AgentName = "XO-A" | "XO-B" | "WILD" | "GEMINI";
export type AgentType = "PLAN" | "CRITIQUE" | "REFRAME" | "REVISION";

export type ValidationStatus = "PASS" | "FAIL";
export type RuntimeStatus = "READY_FOR_COMMIT" | "NEEDS_REVISION" | "ABSTAIN";
export type ConsensusDecision = "PROCEED" | "REVISE" | "STOP";

export type ArtifactKind = "diff" | "file" | "command" | "note";

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
      notes: z.string().optional()
    })
    .passthrough()
});

export type TaskInput = z.infer<typeof TaskInputSchema>;

export type ClaimRisk = "low" | "med" | "high";

export interface Claim {
  id: string;
  text: string;
  dependsOn: string[]; // <- make this required for strict schema consistency
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

  // ✅ what the human is approving/rejecting
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
