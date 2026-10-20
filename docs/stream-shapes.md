# Stream shapes (partial order)

Each **streams** swimlane can carry optional `streamShape` metadata beside `streamPattern`. Shapes describe how events on one EventStore stream may relate—not a single global timeline.

## Fields

| Field | Meaning |
| --- | --- |
| `entryOneOf` | First append on an instance may be any one of these (mutually exclusive starts). |
| `exitOneOf` | Instance may end with any one of these terminals. |
| `unorderedPool` | After `afterEventId`, listed events may appear in any order and may repeat. |
| `layoutColumns` | Canvas columns left-to-right; one id per column is the spine; multiple ids in one column stack vertically (OR). |

## Edges

- `ordersBefore` — required precedence on the same stream (then).
- `loopsBack` — optional cycle (e.g. interview advanced → scored).

Workflow routing uses then + loop-back + pool clique reachability on **one stream only**.

## Sample

See `samples/apex-bee.json` for Apex Bee’s eight stream kinds with OR-starts, payment tines, interview loop, study-group pool, and flag OR-starts.
