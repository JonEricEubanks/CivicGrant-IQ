---
mode: agent
description: Start the CivicGrant IQ backend and frontend dev servers
---

Start both development servers for CivicGrant IQ:

1. Verify `backend/.env` exists (copy from `backend/.env.example` if missing and remind the user to fill in the Azure values)
2. Run `cd backend && npm run dev` in the background (port 3001)
3. Run `cd frontend && npm run dev` in the background (port 5173)
4. Confirm both servers are running and print the URLs
