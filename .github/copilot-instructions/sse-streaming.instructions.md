---
applyTo: "**/routes/*.ts,**/api.ts"
---

# CivicGrant IQ — SSE Streaming Contract

All API routes stream responses as **Server-Sent Events**. Do not change event names or payload shapes without updating both sides.

## Event Order (chat route)

```
status          { message: string }
reasoning_step  { step: number, label: string, content: string, completed: boolean }  ← emitted 0–5×
citations       { citations: Citation[] }                                              ← omitted if empty
widget          { type: string, data: unknown }                                        ← omitted if no widget block
answer          { threadId: string, runId: string, content: string }                  ← display text, widget stripped
done            { threadId: string }
error           { message: string }                                                    ← only on failure
```

## Event Order (scan route)

```
status          { message: string }
reasoning_step  { step: number, label: string, content: string, completed: boolean }
citations       { citations: Citation[] }
widget          { type: "grant_pipeline", data: { ... } }
results         { threadId: string, content: string }
done            { threadId: string }
error           { message: string }
```

## Wire Format

Each event is two lines followed by a blank line:
```
event: <name>\n
data: <JSON>\n
\n
```

The `send()` helper in every route already enforces this — always use it, never write `res.write()` directly.

## Frontend Handler (`frontend/src/api.ts`)

`SSEHandler` has one optional callback per event type. Adding a new event requires:
1. Add `onYourEvent?: (data: YourType) => void` to the `SSEHandler` type
2. Add `if (event === "your_event") handlers.onYourEvent?.(parsed)` in the parse loop
3. Pass the handler where `streamChat` / `streamScan` is called

## Rules

- `flushHeaders()` must be called immediately after setting SSE headers, before any async work
- Always call `res.end()` in the `finally` block — the client hangs otherwise
- Never `await` inside the SSE loop without a try/catch — unhandled rejections close the stream silently
- The `answer` event content must have the widget block stripped: `response.replace(/\`\`\`widget[\s\S]*?\`\`\`/g, "").trim()`
