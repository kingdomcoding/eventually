# Viewport and session

## Persistence (`localStorage` key `event-model-blueprint.session.v1`)

- Board: show-all, open event ids, open order, **focus anchor id** (any sticky type), **workflow from/to event ids**
- Legacy snapshots may store `focusEventId`; loaded as `focusAnchorId`
- Viewport: pan x/y, zoom
- Not persisted: hover preview

## Focus anchor

- **Event** — open/pin slice + focus; emphasis = event detail cluster
- **Command / view** — toggle focus only; emphasis = command or view neighborhood (includes events where applicable)
- **Screen** — toggle focus only; emphasis = screen + commands/views on it (**no events**)

**Focus hold:** story mode with no open slices but a non-event anchor (e.g. hover-then-click) keeps the emphasis closure visible without pinning events.

## Camera intents

| Transition | Intent |
|------------|--------|
| Load + saved viewport | Restore viewport (no auto-fit) |
| Load + workflow from & to set | Frame workflow path (overrides saved viewport) |
| Load + no viewport + focus anchor | Frame focus closure |
| Load + no viewport | Frame story timeline (events) |
| Open / refocus event | Frame focus-fit closure |
| Toggle focus anchor on | Frame focus closure |
| Toggle focus anchor off, no opens | Frame story timeline |
| Toggle focus anchor off, opens remain | Frame visible nodes |
| Close last open event | Frame story timeline (or focus closure if anchor remains) |
| Close focused event, others open | Frame visible nodes |
| Show all on | Frame full board |
| Reset story / toggle off show-all / focus hold | Frame story timeline |

Focus-fit closure: type-specific; events/views expand shared views via `fedBy` where applicable; screen/command use shallow emphasis sets.
