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

type ColumnItem = {
  id: string;
  baseX: number;
  width: number;
  height: number;
  rowId: string;
};

/**
 * Nodes that share a base X are one vertical column. Column width is the
 * widest measured card, and the next column starts after that real right
 * edge plus the gap — so a wide card cannot slide over a neighbor that was
 * spaced from a narrower card in another row. Each card is centered in the
 * column so stacked arrows share one x.
 */
function placeColumns(
  items: ColumnItem[],
  rowGeom: ReadonlyMap<string, { y: number; height: number }>,
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const groups = new Map<number, ColumnItem[]>();
  for (const item of items) {
    const key = Math.round(item.baseX);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  const columns: Array<{ baseX: number; items: ColumnItem[] }> = [];
  for (const [baseX, group] of groups) {
    const seenRow = new Set<string>();
    const primary: ColumnItem[] = [];
    const extras: ColumnItem[] = [];
    const sorted = [...group].sort(
      (a, b) => a.rowId.localeCompare(b.rowId) || a.id.localeCompare(b.id),
    );
    for (const item of sorted) {
      if (seenRow.has(item.rowId)) extras.push(item);
      else {
        seenRow.add(item.rowId);
        primary.push(item);
      }
    }
    columns.push({ baseX, items: primary });
    extras.forEach((item, index) => {
      columns.push({ baseX: baseX + (index + 1) * 0.001, items: [item] });
    });
  }
  columns.sort((a, b) => a.baseX - b.baseX || a.items[0]!.id.localeCompare(b.items[0]!.id));

  let nextLeft = -Infinity;
  for (const column of columns) {
    const columnWidth = Math.max(...column.items.map((item) => item.width));
    let left = column.baseX;
    if (nextLeft > -Infinity && left < nextLeft) left = nextLeft;
    const center = left + columnWidth / 2;
    for (const item of column.items) {
      const row = rowGeom.get(item.rowId)!;
      positions.set(item.id, {
        x: center - item.width / 2,
        y: row.y + (row.height - item.height) / 2,
      });
    }
    nextLeft = left + columnWidth + INTER_COL_GAP;
  }
  return positions;
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
 * Side-by-side columns keep a gap measured from the widest card's real edge,
 * and cards that share a column are centered on that edge. Always computed
 * from the base layout + current sizes (collapsing restores spacing).
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
  const rowGeom = new Map<string, { y: number; height: number }>();
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
    rowGeom.set(row.id, { y: yCursor, height });
    yCursor += height + BAND_GAP;
  }

  const items: ColumnItem[] = [];
  for (const row of orderedRows) {
    for (const id of byRow.get(row.id) ?? []) {
      const basePos = base.positions.get(id)!;
      const size = sizeOrDefault(sizes, id);
      items.push({
        id,
        baseX: basePos.x,
        width: size.width,
        height: size.height,
        rowId: row.id,
      });
    }
  }
  const positions = placeColumns(items, rowGeom);

  // Preserve any node that somehow missed a row assignment.
  for (const [id, pos] of base.positions) {
    if (!positions.has(id)) positions.set(id, { ...pos });
  }

  return { positions, streamRows: packedRows };
}
