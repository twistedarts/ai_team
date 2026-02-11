export type ProfileId = "email_adapter" | "debug" | "code";

export const Profiles: Record<ProfileId, any> = {
  email_adapter: {
    constraints: {
      noNetwork: true,
      mustBeDeterministic: true,
      maxIterations: 3,
      noSideEffects: true,
      draftOnly: true,
      requireHumanCommit: true,
      actuationLayer: "os_intents",
      allowExternalCalls: false
    }
  },
  debug: { constraints: { noNetwork: true, mustBeDeterministic: true, maxIterations: 2 } },
  code: { constraints: { noNetwork: true, mustBeDeterministic: true, maxIterations: 2 } }
};
