# CivicGrant IQ — Frontend

React 18 + TypeScript + Vite single-page app for [CivicGrant IQ](../README.md), an AI grant analyst for municipal governments. Deployed to Azure Static Web Apps; talks to the Express backend over `/api/*`.

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies API calls to the backend — start it first (`cd ../backend && npm run dev`).

## What lives here

19 components under `src/components/`, the highlights:

| Component | Purpose |
|---|---|
| `ChatInterface.tsx` | Main chat UI — consumes 17 SSE event types from `POST /api/chat` |
| `GraphPathsPanel.tsx` | GraphRAG evidence-chain visualization (the hero artifact) |
| `AgentOrchestraBar.tsx` | Live status of the five-agent fleet |
| `ReasoningSteps.tsx` | 6-step reasoning chain visualizer |
| `GrantMatchWidget.tsx` | Animated match-score gauge |
| `GrantScanner.tsx` | Live grants.gov portfolio scan |
| `GrantAdminDashboard.tsx` | Post-award admin hub (disbursements, milestones, SF-425) |
| `ReportPreviewModal.tsx` | PDF report preview / export |
| `WorkIqPanel.tsx` | SharePoint (Work IQ) city-context inspector |
| `DemoTour.tsx` | Guided first-visit walkthrough |

API client: `src/api.ts`. Streaming: Server-Sent Events parsed incrementally in `ChatInterface.tsx`.

## Build

```sh
npm run build   # type-checks then emits dist/
```

See the [root README](../README.md) for architecture, deployment, and the full project story.
