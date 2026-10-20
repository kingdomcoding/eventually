# Swimlane gutter

The left gutter shares React Flow’s vertical transform: row `top = row.y × zoom + panY`, `height = LANE_ROW_HEIGHT × zoom`.

Stickies are placed at `yForLaneRow(row.y)` so node centers align with gutter row centers.

Band titles (**Users**, **Commands · views**, **Events**) render in inter-band gaps when the gap is tall enough; otherwise a band chip on the first visible row of that band. **Users** and **Commands · views** rows hide when that lane has no visible canvas nodes (show on hover preview as faded, on open/focus as solid). Horizontal dividers are gutter-only and follow the same visibility: band separators only when both adjacent bands have at least one visible gutter row; row separators only when both adjacent rows are visible. In pure story mode with Users and Commands · views collapsed, no divider lines appear above Events.

Emphasis (active / present / idle) is opacity; band kind uses a left accent bar and subtle fill.

The **Streams** band (`events` in the schema) uses one gutter row per stream swimlane; each row shows the stream name and `streamPattern` (e.g. `subscription-{userId}`). **ui** lanes remain per actor/role.
