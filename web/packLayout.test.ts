import assert from "node:assert/strict";
import test from "node:test";
import { BAND_GAP, LANE_ROW_HEIGHT, NODE_H, NODE_W } from "./layoutMetrics.js";
import { assignNodesToRows, packLayout } from "./packLayout.js";

test("packLayout leaves default-sized cards on the base lane geometry", () => {
  const base = {
    streamRows: [
      {
        id: "ui",
        name: "Triggers",
        band: "ui" as const,
        order: 0,
        y: 48,
        yLine: 48 + LANE_ROW_HEIGHT,
        height: LANE_ROW_HEIGHT,
      },
      {
        id: "events",
        name: "Events",
        band: "events" as const,
        order: 0,
        y: 48 + LANE_ROW_HEIGHT + BAND_GAP,
        yLine: 48 + LANE_ROW_HEIGHT + BAND_GAP + LANE_ROW_HEIGHT,
        height: LANE_ROW_HEIGHT,
      },
    ],
    positions: new Map([
      ["trg", { x: 100, y: 48 + (LANE_ROW_HEIGHT - NODE_H) / 2 }],
      ["evt", { x: 100, y: 48 + LANE_ROW_HEIGHT + BAND_GAP + (LANE_ROW_HEIGHT - NODE_H) / 2 }],
    ]),
  };

  const packed = packLayout(base, new Map());
  assert.equal(packed.streamRows[0]!.height, LANE_ROW_HEIGHT);
  assert.equal(packed.streamRows[1]!.y, base.streamRows[1]!.y);
  assert.equal(packed.positions.get("evt")!.y, base.positions.get("evt")!.y);
});

test("packLayout grows a lane when a card expands and shifts the lane below", () => {
  const base = {
    streamRows: [
      {
        id: "ui",
        name: "Triggers",
        band: "ui" as const,
        order: 0,
        y: 48,
        yLine: 48 + LANE_ROW_HEIGHT,
        height: LANE_ROW_HEIGHT,
      },
      {
        id: "cmd",
        name: "Commands · Data Tables",
        band: "commandView" as const,
        order: 0,
        y: 48 + LANE_ROW_HEIGHT + BAND_GAP,
        yLine: 48 + 2 * LANE_ROW_HEIGHT + BAND_GAP,
        height: LANE_ROW_HEIGHT,
      },
      {
        id: "events",
        name: "Events",
        band: "events" as const,
        order: 0,
        y: 48 + 2 * (LANE_ROW_HEIGHT + BAND_GAP),
        yLine: 48 + 3 * LANE_ROW_HEIGHT + 2 * BAND_GAP,
        height: LANE_ROW_HEIGHT,
      },
    ],
    positions: new Map([
      ["trg", { x: 100, y: 48 + (LANE_ROW_HEIGHT - NODE_H) / 2 }],
      ["command", { x: 100, y: 48 + LANE_ROW_HEIGHT + BAND_GAP + (LANE_ROW_HEIGHT - NODE_H) / 2 }],
      ["evt", { x: 100, y: 48 + 2 * (LANE_ROW_HEIGHT + BAND_GAP) + (LANE_ROW_HEIGHT - NODE_H) / 2 }],
    ]),
  };

  const expandedH = 220;
  const packed = packLayout(base, new Map([["command", { width: NODE_W, height: expandedH }]]));

  assert.ok(packed.streamRows[1]!.height >= expandedH);
  assert.ok(packed.streamRows[2]!.y > base.streamRows[2]!.y);

  const cmd = packed.positions.get("command")!;
  const evt = packed.positions.get("evt")!;
  assert.ok(cmd.y + expandedH <= evt.y, "expanded command must not overlap the event below");
});

test("packLayout pushes overlapping cards apart horizontally in the same lane", () => {
  const y = 48 + (LANE_ROW_HEIGHT - NODE_H) / 2;
  const base = {
    streamRows: [
      {
        id: "events",
        name: "Events",
        band: "events" as const,
        order: 0,
        y: 48,
        yLine: 48 + LANE_ROW_HEIGHT,
        height: LANE_ROW_HEIGHT,
      },
    ],
    positions: new Map([
      ["a", { x: 100, y }],
      ["b", { x: 180, y }],
    ]),
  };

  const packed = packLayout(
    base,
    new Map([
      ["a", { width: 200, height: NODE_H }],
      ["b", { width: NODE_W, height: NODE_H }],
    ]),
  );

  const a = packed.positions.get("a")!;
  const b = packed.positions.get("b")!;
  assert.ok(b.x >= a.x + 200, "second card shifts right of the wide first card");
});

test("assignNodesToRows picks the nearest lane mid", () => {
  const rows = [
    {
      id: "ui",
      name: "Triggers",
      band: "ui" as const,
      order: 0,
      y: 0,
      yLine: LANE_ROW_HEIGHT,
      height: LANE_ROW_HEIGHT,
    },
    {
      id: "events",
      name: "Events",
      band: "events" as const,
      order: 0,
      y: 200,
      yLine: 200 + LANE_ROW_HEIGHT,
      height: LANE_ROW_HEIGHT,
    },
  ];
  const byRow = assignNodesToRows(
    new Map([
      ["t", { x: 0, y: 20 }],
      ["e", { x: 0, y: 220 }],
    ]),
    rows,
  );
  assert.deepEqual(byRow.get("ui"), ["t"]);
  assert.deepEqual(byRow.get("events"), ["e"]);
});
