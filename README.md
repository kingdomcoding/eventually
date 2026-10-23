# event-model-blueprint

Minimal **Event Modeling** document schema (TypeScript + Zod). JSON on disk; no app yet.

## Why this shape (canvas next)

- **`nodes[]` + `edges[]`** — canvas renders graph directly; layout lives on nodes as optional `layout: { x, y }`.
- **`swimlanes[]`** with **`band`**: `ui` | `commandView` | `events` — storyboard and timeline rows.
- **Events** carry **`timelineIndex`** — default horizontal ordering before manual layout.
- **`indexForCanvas(doc)`** — grouped read model for the first UI (see `src/canvas-index.ts`).

## Commands

```bash
npm install
npm run validate                    # default sample
npm run validate samples/minimal-hotel.json
npm run typecheck
```

## Review later

- `src/nodes.ts` — sticky-note types
- `src/validate.ts` — semantic rules (completeness, edges)
- `src/patch.ts` — AI proposal shape
- `samples/minimal-hotel.json` — one vertical slice
