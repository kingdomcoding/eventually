# Apex Bee timeline model (`samples/apex-bee.json`)

`modelVersion` **5** adds **commands** and **screens** for Timeline mode, mapped from the Apex Bee app (`~/batcave/apex-bee`).

## Bands

| Band | Swimlanes | Contents |
|------|-----------|----------|
| **ui** | Web, Mobile app, Ops & system | LiveView routes and mobile API surfaces |
| **commandView** | Commands | Ash command resources (`RegisterDevice`, `SubmitExam`, …) |
| **events** | Eight EventStore streams (unchanged) | `*V1` domain events |

Timeline stack ends at the **events** spine (no band below).

## Edges

- **issues** — screen → command (including “Ops & system” surfaces for webhooks, poll, IEx).
- **produces** — command → event (28 pairs, 1:1 with code).
- **ordersBefore** — stream partial order (Swimlanes mode; hidden on timeline canvas).

Event spine order is still **`meta.narrativeOrder`** (28 event ids).

## Regenerate

After editing command/screen mappings, adjust `scripts/enrich-apex-bee-timeline.mjs` and run:

```bash
node scripts/enrich-apex-bee-timeline.mjs
npm run validate -- samples/apex-bee.json
```

## Known gaps (mirrors product)

- **LeaveGroup** → `MemberLeftV1`: command modeled; no screen `issues` edge yet.
- **Import\*** events: triggered from ops/migration, not learner UI.
- **Interview** commands: web `/interview` only (no mobile API in router).
