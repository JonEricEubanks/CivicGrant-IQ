# CivicGrant IQ — Agent Instructions

Municipal Grant Revenue Intelligence Agent for the **Agents League @ AISF 2026** hackathon.
Pitch: *"You have $8.7M in grants your city qualifies for this month."*

## Project Structure

```
backend/   Express + TypeScript API — Foundry agent, SSE streaming
frontend/  React 18 + Vite + TypeScript — chat UI with inline widget rendering
infra/     PowerShell deploy script for Azure (rg-skillsfest)
.vscode/   mcp.json — Foundry IQ MCP server config for VS Code Copilot
```

## Build & Run Commands

**Backend**
```sh
cd backend
npm run dev          # nodemon + ts-node (hot reload, port 3001)
npm run typecheck    # tsc --noEmit (no output = clean)
npm run build        # tsc → dist/
```

**Frontend**
```sh
cd frontend
npm run dev          # Vite HMR, port 5173
npm run build        # tsc -b && vite build → dist/
npm run lint         # eslint
```

**Infra**
```sh
./infra/deploy.ps1   # Deploys all Azure resources, prints backend/.env values
```

## Architecture

### Backend (`backend/src/`)

| File | Role |
|------|------|
| `index.ts` | Express entry, CORS → `localhost:5173`, mounts `/api/chat` + `/api/scan` |
| `config.ts` | Env validation via `require_env()` — throws on missing required vars |
| `agent.ts` | Core: `AIProjectClient.getOpenAIClient()` → OpenAI Assistants API with Foundry IQ MCP tool |
| `routes/chat.ts` | `POST /api/chat` — SSE stream for grant analysis |
| `routes/scan.ts` | `POST /api/scan` — SSE stream for city profile scan |

**Agent reasoning chain** — every response walks 6 labeled steps:
`Step 1 Parse → Step 2 Match → Step 3 Verify → Step 4 Gaps → Step 5 Narrative → Step 6 Strategy`

**Widget protocol** — the agent embeds a `\`\`\`widget` JSON block in its response. `chat.ts` strips it from display text and emits it as a separate `widget` SSE event. The frontend renders it as a live React dashboard.

SSE event order: `status` → `reasoning_step` (×6) → `citations` → `widget` → `answer` → `done`

### Frontend (`frontend/src/`)

| File | Role |
|------|------|
| `api.ts` | SSE client — `streamChat()` and `streamScan()` |
| `types.ts` | Shared interfaces: `ReasoningStep`, `Citation`, `CityProfile`, `ScanResult` |
| `App.tsx` | Tab layout: "Analyze Grant" (chat) / "Scan My City" (scanner) |
| `components/ChatInterface.tsx` | Full chat UI — sidebar, starter prompts, inline widgets |
| `components/GrantMatchWidget.tsx` | Animated SVG gauge + number counters + gap cards |
| `components/GrantPipelineWidget.tsx` | Ranked grant list with animated progress bars |
| `components/ReasoningSteps.tsx` | 6-step reasoning chain visualizer |
| `components/CitationsPanel.tsx` | Source citations with badge types |
| `components/GrantScanner.tsx` | City profile form for the scan tab |

## Critical Conventions

### TypeScript — Vite 8 + Rolldown
The frontend uses `"verbatimModuleSyntax": true` (see `tsconfig.app.json`). This requires:
- **All type-only imports must use `import type`**
- Example: `import type { Citation } from "../types"` not `import { Citation } from "../types"`
- Forgetting this causes `MISSING_EXPORT` errors at build time

### Azure Resource Constraints
- **All Azure resources deploy to `eastus2`** — required for AI Search agentic retrieval
- Resource group `rg-skillsfest` is the logical container; the RG itself is `northcentralus`
- AI Search must be **Standard tier** for agentic retrieval

### Env Variables
Copy `backend/.env.example` → `backend/.env` before running. See [`backend/.env.example`](backend/.env.example).
`config.ts` will throw at startup for any missing required var — check the error message first.

### SDK: `@azure/ai-projects`
- Current version uses `AIProjectClient(endpoint, credential)` constructor (2-arg, not 4-arg)
- Use `client.getOpenAIClient()` to get the OpenAI-compatible client, then use `oai.beta.threads.*`, `oai.beta.assistants.*` — the standard OpenAI Assistants API
- `client.agents.*` is the **Foundry hosted-agent registry** (not for conversation threads)
- Foundry IQ MCP tool type: `"mcp"` with `server_url`, `require_approval: "never"`, `allowed_tools: ["knowledge_base_retrieve"]`

### CSS
- All components have co-located `.css` files (e.g. `GrantMatchWidget.tsx` + `GrantMatchWidget.css`)
- Dark navy theme — base colors: `#020617` (bg), `#0f172a` (card), `#1e293b` (elevated), `#3b82f6` (accent)
- No CSS nesting or Sass — use plain class selectors only (lightningcss minifier rejects CSS nesting)

## Azure Resources (rg-skillsfest)

| Resource | Name | Location |
|----------|------|----------|
| AI Search | `civicgrant-search` | eastus2 |
| Azure OpenAI | `civicgrant-aoai` | eastus2 |
| Storage | `civicgrantstore` | northcentralus |
| Foundry Hub | `civicgrant-hub` | eastus2 |
| Foundry Project | `civicgrant-project` | eastus2 |

Models deployed: `gpt-4o-mini` (chat), `text-embedding-3-large` (embeddings).
Knowledge base: `civicgrant-kb`, blob container: `civicgrant-docs`.
