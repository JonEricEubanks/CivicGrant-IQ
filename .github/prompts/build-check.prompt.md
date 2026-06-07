---
mode: agent
description: Typecheck and build both backend and frontend, report any errors
---

Run a full build verification for CivicGrant IQ:

1. `cd backend && npm run typecheck` — report any TypeScript errors
2. `cd frontend && npm run build` — report bundle output size or errors
3. If both pass, confirm the project is ready to deploy
4. If either fails, show the errors and suggest fixes based on the conventions in AGENTS.md
