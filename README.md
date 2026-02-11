# AI Team

A deterministic, multi-agent “committee” runtime for structured reasoning with a **Human Commit Gate**.

AI Team runs a fixed-order orchestration loop (XO-A plan → XO-B critique → Wild reframe → (optional) Gemini reframe → XO-A revision → validation → commit gate) and produces a **trace** with human-readable proposed output + final output on approval.

Includes a web console with:
- Live agent timeline (SSE, auto-follow)
- Commit gate with human-readable proposed output
- Final output shown only after approval
- Raw JSON panels hidden behind dev toggles

---

## What it is

**AI Team** is a deterministic runtime and console for “agent deliberation”:
- Agents produce structured outputs (claims, steps, artifacts)
- A validator can PASS/FAIL artifacts (currently code-validator stubs are supported)
- A commit gate presents a **synopsis** so the operator can approve/reject/redirect
- Runs are stored and replayable

Design goals:
- Deterministic orchestration (fixed ordering)
- Human commit before any side-effecting action
- Human-readable outputs by default; JSON only for logs/dev

---

## Architecture

### Runtime
- `src/runtime/orchestrator.ts` — fixed-order agent pipeline
- `src/runtime/workspace.ts` — workspace state + run lifecycle
- `src/runtime/agents/*` — agent implementations (XO-A, XO-B, WILD, GEMINI)
- `src/runtime/model/openai.ts` — OpenAI adapter
- `src/runtime/model/gemini.ts` — Gemini adapter
- `src/runtime/consensus.ts` — builds commit gate proposal + consensus report
- `src/runtime/commit.ts` — commit gate logic + human decision recording
- `src/runtime/validator/*` — validator stubs (expandable)

### API
- `src/server/api.ts` — Express API for runs, traces, pending commit, commit decision
- Uses SSE for live updates:
  - `GET /api/runs/:runId/events` (EventSource)

### Web console
- `web/` — Vite + React console
- Live run updates via SSE
- Agent timeline auto-follows as new outputs arrive
- Commit gate + final output UX

---

## Requirements

- Node.js (recommended LTS)
- An OpenAI API key (for XO lanes)
- A Google/Gemini API key (for Gemini lane)

---

## Environment (.env)

Create a `.env` at repo root:

```bash
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key   # or GEMINI_API_KEY depending on adapter
GEMINI_API_KEY=your_gemini_key   # if you use this name instead


Notes:

Gemini adapter accepts GOOGLE_API_KEY or GEMINI_API_KEY (either works).

Keep .env out of git.

Install

From repo root:

npm install


If the web console is a separate package under web/:

cd web
npm install
cd ..

Build
npm run build


If web/ has its own build:

cd web
npm run build

Run
Start the API/runtime
npm run api


This should expose:

GET /api/health

run endpoints under /api/runs/*

Start the web console

From web/:

npm run dev


Open the Vite URL shown in the terminal.

The web console proxies /api/* to the backend.

Using the console

Create a run with an objective (task)

Watch live deliberation in the timeline (SSE)

When READY_FOR_COMMIT appears:

Review Proposed output

Approve / Reject / Redirect

On approval:

“Final output” panel opens

Commit gate collapses/disappears

Agent sets & model lanes

The system supports multiple agent sets (example):

FULL

XO_WILD_CRITIC

(others as defined in profiles / config)

Each agent can be mapped to a provider+model:

OpenAI: e.g. gpt-4o-mini, gpt-4o, etc.

Gemini: e.g. gemini-2.5-flash (free tier)

(Planned) UI improvements:

per-agent model selection

no pre-baked “agent groups” required

provider expansion: Anthropic, local LLM lane later

Trace format

Each run stores:

task (objective + constraints + runtime selections)

outputs[] (agent outputs)

validator result

report (consensus + proposed output)

trace.humanDecision once committed

Roadmap (near term)

Agent + model selection UI (per lane)

Runs list: pagination / finite cap

Collapsible sections (timeline, dev panels, etc.)

Rich artifacts viewer (cards instead of raw JSON)

Run diff (compare two traces)

License

TBD

