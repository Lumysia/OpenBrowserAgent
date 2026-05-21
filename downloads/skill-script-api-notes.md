# Skill Script API Notes

## Idea

Allow skills to include executable scripts, but keep execution constrained by the active agent's capabilities.

## Core Model

- Skill scripts do not receive raw `chrome.*`, `window`, `document`, unrestricted `fetch`, or extension internals.
- Skill scripts run through a controlled SDK.
- All privileged work goes through platform APIs such as `tools.call(...)`.
- Every `tools.call(...)` is checked against the active agent's capabilities, preferences, tool schema, timeout, and execution allowlist.
- Outputs must be JSON-serializable.

## Proposed SDK

```ts
await tools.call("scanPageTextBlocks", { scope: "viewport", limit: 80 });
await tools.call("insertTextAnnotations", { items });
await ai.completeJson({ schema, messages });
await state.get("key");
await state.set("key", value);
progress.update({ done, total });
```

## Permission Boundary

The skill may know about all OpenBrowserAgent APIs, but execution is restricted by the current agent.

If the active agent lacks a capability, calls return an error instead of executing:

```json
{ "success": false, "error": "Tool is not available to the active agent." }
```

## Translation Use Case

An immersive translation skill could orchestrate:

- Scan page text blocks.
- Group blocks into batches.
- Call the model for structured batch translation.
- Insert bilingual annotations near original text.
- Update progress.
- Remove or refresh annotations.

The DOM itself is still modified only by trusted tools such as `insertTextAnnotations`, not by arbitrary skill code.

## Suggested First Step

Implement a minimal script runner with:

- Controlled `tools.call`.
- Capability-gated execution.
- Timeout and cancellation.
- JSON-only inputs/outputs.
- Basic logging/progress.

Defer a full plugin ecosystem until this proves useful.
