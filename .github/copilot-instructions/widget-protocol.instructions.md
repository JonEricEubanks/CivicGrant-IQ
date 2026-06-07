---
applyTo: "**/{GrantMatchWidget,GrantPipelineWidget,ChatInterface}.{tsx,ts},**/routes/chat.ts,**/agent.ts"
---

# CivicGrant IQ — Widget Protocol

How the agent generates inline React dashboards inside the chat thread.

## Flow

```
Agent response text
  └─ contains ```widget { "type": "...", "data": {...} } ```
       │
       ├─ backend (routes/chat.ts): extract → emit as SSE "widget" event, strip from display text
       │
       └─ frontend (ChatInterface.tsx): receive → store as message.widget → render component inline
```

## Adding a New Widget Type

### 1. Define the TypeScript interface (frontend)
Add to `frontend/src/components/YourWidget.tsx`:
```tsx
export interface YourWidgetData { /* fields */ }
export function YourWidget({ data }: { data: YourWidgetData }) { ... }
```

### 2. Register the type in `ChatInterface.tsx`
```tsx
// In the WidgetPayload union:
| { type: "your_type"; data: YourWidgetData }

// In the render block:
{msg.widget?.type === "your_type" && <YourWidget data={msg.widget.data as YourWidgetData} />}
```

### 3. Instruct the agent (backend `agent.ts`)
Add to `SYSTEM_PROMPT` the widget JSON schema the model should emit:
````
```widget
{ "type": "your_type", "data": { ... } }
```
````

### 4. No backend route changes needed
`chat.ts` already passes any widget through via `extractWidget()` and the `widget` SSE event.

## Current Widget Types

| type | Component | Data interface |
|------|-----------|----------------|
| `grant_match` | `GrantMatchWidget` | `GrantMatchData` — score gauge, gaps, narrative |
| `grant_pipeline` | `GrantPipelineWidget` | `PipelineGrant[]` — ranked list with bars |

## SSE Event Contract

```
event: widget
data: { "type": "grant_match", "data": { ... } }
```

The frontend handler in `ChatInterface.tsx`:
```tsx
onWidget: (widget) => {
  setMessages(prev => prev.map(m =>
    m.id === assistantId ? { ...m, widget } : m
  ));
}
```

Note: `streamChat()` in `api.ts` already handles the `widget` event — hook `onWidget` in the SSEHandler.

## Pitfalls

- **Import type**: Widget data interfaces must be imported with `import type` due to `verbatimModuleSyntax: true`
- **Regex**: `extractWidget()` in `agent.ts` uses `` /```widget\s*([\s\S]*?)```/ `` — the model must emit exact backtick fences
- **Strip from text**: `chat.ts` strips the widget block from `displayText` before sending the `answer` event — don't duplicate it
