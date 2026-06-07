---
description: Add a new inline widget type to the CivicGrant IQ chat interface
---

# Add Widget Skill

Add a new inline dashboard widget that the AI agent can generate inside chat messages.

## Steps

### 1. Define the data interface (frontend)

Create `frontend/src/components/<WidgetName>Widget.tsx`:

```tsx
import "./WidgetNameWidget.css";

export interface WidgetNameData {
  // define fields the agent will populate
}

export function WidgetNameWidget({ data }: { data: WidgetNameData }) {
  return (
    <div className="widgetname-widget">
      {/* render data */}
    </div>
  );
}
```

Create the matching `WidgetNameWidget.css` — dark navy theme, no CSS nesting:
- Background: `#0a0f1e`, border: `1px solid #1e3a5f`, border-radius: `16px`
- Add entry animation: `animation: widgetSlideIn 0.4s cubic-bezier(0.34,1.56,0.64,1)`

### 2. Register in `ChatInterface.tsx`

```tsx
// Add to WidgetPayload union (near top of file):
| { type: "widget_name"; data: WidgetNameData }

// Add import (must use `import type` for the data interface):
import { WidgetNameWidget } from "./WidgetNameWidget";
import type { WidgetNameData } from "./WidgetNameWidget";

// Add to the render block inside assistant message body:
{msg.widget?.type === "widget_name" && (
  <WidgetNameWidget data={msg.widget.data as WidgetNameData} />
)}
```

### 3. Add the widget schema to the agent system prompt (`backend/src/agent.ts`)

Append to `SYSTEM_PROMPT` inside the WIDGET OUTPUT REQUIREMENT section:

````
When you need to show [describe scenario], append a widget block:
```widget
{
  "type": "widget_name",
  "data": {
    "field1": "<description>",
    "field2": <number>
  }
}
```
````

### 4. No backend route changes needed

`extractWidget()` in `agent.ts` and the `widget` SSE event in `routes/chat.ts` are already generic — they pass any widget type through unchanged.

### 5. Verify

```sh
cd frontend && npm run build   # must pass — check for MISSING_EXPORT errors
cd backend && npm run typecheck
```

## Common Pitfalls

- **`import type`** — data interfaces exported from widget files must be imported with `import type` in `ChatInterface.tsx` due to `verbatimModuleSyntax: true`
- **No CSS nesting** — lightningcss (Vite 8) rejects `&` selectors; use flat class selectors
- **Widget fences** — the model must emit exact triple-backtick fences; test the prompt before shipping
