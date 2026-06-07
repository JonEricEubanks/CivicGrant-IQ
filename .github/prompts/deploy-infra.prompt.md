---
mode: agent
description: Deploy all Azure infrastructure for CivicGrant IQ to rg-skillsfest
---

Deploy CivicGrant IQ infrastructure to Azure:

1. Confirm the user is logged in: run `az account show` and verify subscription `b8f90e47-b8ee-45f1-9442-d3b4f8fd0695`
2. If not logged in, run `az login`
3. Run `./infra/deploy.ps1`
4. After completion, verify `backend/.env` was written with all required values
5. Remind the user to create the Foundry IQ knowledge base (`civicgrant-kb`) manually in the Azure AI Foundry portal at https://ai.azure.com, connecting the `civicgrant-docs` blob container

**Important**: AI Search and Azure OpenAI deploy to `eastus2` — do not change this region.
