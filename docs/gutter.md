# Swimlane gutter

The left gutter shares React Flow’s vertical transform: row `top = row.y × zoom + panY`, `height = LANE_ROW_HEIGHT × zoom`.

Stickies are placed at `yForLaneRow(row.y)` so node centers align with gutter row centers.

Band titles (**Screens**, **Commands · views**, **Events**) render in inter-band gaps when the gap is tall enough; otherwise a band chip on the first row of that band. Horizontal dividers are gutter-only.

Emphasis (active / present / idle) is opacity; band kind uses a left accent bar and subtle fill.
