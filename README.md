# AI Team

A deterministic, multi-agent "committee" runtime for structured reasoning with a **Human Commit Gate**.

AI Team runs a fixed-order orchestration loop (AI1 plan → AI2 critique → AI3 reframe → AI4 reframe → AI1 revision → validation → commit gate) and produces a **trace** with human-readable proposed output + final output on approval.

Includes a web console with:
- Live agent timeline (SSE, auto-follow)
- Commit gate with human-readable proposed output
- Final output shown only after approval
- Raw JSON panels hidden behind dev toggles

---

## What it is

**AI Team** is a deterministic runtime and console for "agent deliberation":
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
- `src/runtime/agents/*` — agent implementations (AI1, AI2, AI3, AI4)
- `src/runtime/model/openai.ts` — OpenAI adapter
- `src/runtime/model/gemini.ts` — Gemini adapter
- `src/runtime/model/anthropic.ts` — Anthropic adapter
- `src/runtime/consensus.ts` — builds commit gate proposal + consensus report
- `src/runtime/commit.ts` — commit gate logic + human decision recording
- `src/runtime/validator/*` — validator stubs (expandable)

### Roles
- **AI1** — Planner + Reviser: produces the initial plan and integrates feedback into a revised output
- **AI2** — Critic + Confirmer: critiques the plan and confirms after validation
- **AI3** — Reframer: provides alternative perspectives (OpenAI lane)
- **AI4** — Reframer: provides alternative perspectives (Gemini lane)

### Pipeline
```
AI1 plan → AI2 critique → AI3 reframe → AI4 reframe → AI1 revision → validate → AI2 confirm → consensus → commit gate
```

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
- An OpenAI API key (for AI1, AI2, AI3 lanes)
- A Google/Gemini API key (for AI4 lane)

---

## Environment (.env)

Create a `.env` at repo root:

```bash
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key   # or GEMINI_API_KEY depending on adapter
GEMINI_API_KEY=your_gemini_key   # if you use this name instead
```

Notes:
- Gemini adapter accepts GOOGLE_API_KEY or GEMINI_API_KEY (either works).
- Keep .env out of git.

---

## Install

From repo root:

```bash
npm install
```

If the web console is a separate package under web/:

```bash
cd web
npm install
cd ..
```

## Build

```bash
npm run build
```

If web/ has its own build:

```bash
cd web
npm run build
```

## Run

Start the API/runtime:

```bash
npm run api
```

This exposes:
- `GET /api/health`
- Run endpoints under `/api/runs/*`

Start the web console from web/:

```bash
npm run dev
```

Open the Vite URL shown in the terminal. The web console proxies `/api/*` to the backend.

---

## Using the console

1. Create a run with an objective (task)
2. Watch live deliberation in the timeline (SSE)
3. When READY_FOR_COMMIT appears:
   - Review proposed output
   - Approve / Reject / Redirect
4. On approval:
   - "Final output" panel opens
   - Commit gate collapses

---

## Agent lanes & model selection

Each agent lane can be mapped to a provider and model:
- **OpenAI**: e.g. gpt-4o-mini, gpt-4o
- **Gemini**: e.g. gemini-2.5-flash (free tier)
- **Anthropic**: (adapter present, expansion planned)

---

## Trace format

Each run stores:
- `task` — objective + constraints + runtime selections
- `outputs[]` — agent outputs
- `validator` — validation result
- `report` — consensus + proposed output
- `trace.humanDecision` — recorded once committed

---

## Roadmap (near term)

- Agent + model selection UI (per lane)
- Role-based configuration (decouple roles from agent IDs)
- Runs list: pagination / finite cap
- Collapsible sections (timeline, dev panels, etc.)
- Rich artifacts viewer (cards instead of raw JSON)
- Run diff (compare two traces)

---

## License

TBD
