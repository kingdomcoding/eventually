# Workflow route (From → To)

## Purpose

Highlight a **forward then-chain** between two events on the map. The full blueprint stays visible; off-route content is faded. Path and workflow mean the same thing for now.

## Endpoints

- **From** and **To** are both required for a valid route.
- Endpoints must be **events**.
- **Start must reach end** via `ordersBefore` edges (shown as **then**). Wrong order or no chain → error, no highlight.
- **Start === end** → single-event route.

## Path computation

- Graph: event → event edges with `rel: "ordersBefore"`.
- **Nodes on path:** intersection of forward reachability from From and backward reachability to To (union of all branches in a diamond).
- **Edges on path:** every then-edge whose endpoints are both on that node set.

## Map emphasis

- **On path:** events full strength; route **then** edges blue (`#5b9bf5`).
- **Off path:** other timeline events dimmed; commands/views/screens hidden until hover, focus, or open slice (POI).
- **From/To search:** duplicate event names show as `Name · timeline step N`.
- **Show all:** everything visible; route styling remains on top.
- **POI:** hover preview, focus anchor, or open event slices temporarily lift off-route nodes.

## Session

Persisted on the board snapshot:

- `workflowFromEventId`
- `workflowToEventId`

Clear route resets both and frames the story timeline.

## Camera

When both endpoints are set and valid, camera fits the path neighborhood (path events + detail cluster). User pan/zoom is unchanged afterward.
