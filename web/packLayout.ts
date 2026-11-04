import {
  BAND_GAP,
  INTER_COL_GAP,
  LANE_ROW_HEIGHT,
  NODE_H,
  NODE_W,
  yForLaneRow,
  type LayoutResult,
  type NodePosition,
  type StreamRow,
} from "./layoutMetrics.js";

export type NodeSize = { width: number; height: number };

const LANE_PAD = 16;

function sizeOrDefault(sizes: ReadonlyMap<string, NodeSize>, id: string): NodeSize {
  return sizes.get(id) ?? { width: NODE_W, height: NODE_H };
}

/** Assign each node to the stream row whose mid Y is closest to the node's base Y. */
export function assignNodesToRows(
  positions: ReadonlyMap<string, NodePosition>,
  rows: StreamRow[],
): Map<string, string[]> {
  const byRow = new Map<string, string[]>(rows.map((r) => [r.id, []]));
  if (!rows.length) return byRow;

  for (const [id, pos] of positions) {
    let best = rows[0]!;
    let bestDist = Infinity;
    for (const row of rows) {
      const mid = yForLaneRow(row.y, row.height);
      const dist = Math.abs(pos.y - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = row;
      }
    }
    byRow.get(best.id)!.push(id);
  }
  return byRow;
}

/**
 * Grow lane heights to fit measured sticky sizes and shift later lanes down.
 * Within each lane, push nodes right when measured widths would overlap.
 * Always computed from the base layout + current sizes (collapsing restores spacing).
 */
export function packLayout(
  base: LayoutResult,
  sizes: ReadonlyMap<string, NodeSize>,
): LayoutResult {
  if (!base.streamRows.length || base.positions.size === 0) {
    return {
      positions: new Map(base.positions),
      streamRows: base.streamRows.map((r) => ({ ...r })),
    };
  }

  const orderedRows = [...base.streamRows].sort((a, b) => a.y - b.y || a.order - b.order);
  const byRow = assignNodesToRows(base.positions, orderedRows);

  const packedRows: StreamRow[] = [];
  const positions = new Map<string, NodePosition>();
  let yCursor = orderedRows[0]!.y;

  for (const row of orderedRows) {
    const ids = byRow.get(row.id) ?? [];
    let maxH = NODE_H;
    for (const id of ids) {
      maxH = Math.max(maxH, sizeOrDefault(sizes, id).height);
    }
    const height = Math.max(row.height, LANE_ROW_HEIGHT, maxH + LANE_PAD * 2);
    const packedRow: StreamRow = {
      ...row,
      y: yCursor,
      height,
      yLine: yCursor + height,
    };
    packedRows.push(packedRow);

    const inRow = ids
      .map((id) => {
        const basePos = base.positions.get(id)!;
        const size = sizeOrDefault(sizes, id);
        return {
          id,
          baseX: basePos.x,
          width: size.width,
          height: size.height,
        };
      })
      .sort((a, b) => a.baseX - b.baseX || a.id.localeCompare(b.id));

    let nextLeft = -Infinity;
    for (const item of inRow) {
      let x = item.baseX;
      if (nextLeft > -Infinity && x < nextLeft) {
        x = nextLeft;
      }
      const y = yCursor + (height - item.height) / 2;
      positions.set(item.id, { x, y });
      nextLeft = x + item.width + INTER_COL_GAP;
    }

    yCursor += height + BAND_GAP;
  }

  // Preserve any node that somehow missed a row assignment.
  for (const [id, pos] of base.positions) {
    if (!positions.has(id)) positions.set(id, { ...pos });
  }

  return { positions, streamRows: packedRows };
}
