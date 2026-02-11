import { AgentOutput, ValidatorResult } from "../types.js";

export interface Validator {
  validate(outputs: AgentOutput[]): Promise<ValidatorResult>;
}

