import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { BlueprintDocumentSchema } from "../src/document.js";
import {
  focusEmphasisClosure,
  focusFitClosure,
} from "./graphIndex.js";

const here = dirname(fileURLToPath(import.meta.url));
const hotel = BlueprintDocumentSchema.parse(
  JSON.parse(readFileSync(join(here, "../samples/minimal-hotel.json"), "utf8")),
);

function hasEventId(ids: Set<string>, doc: typeof hotel): boolean {
  for (const id of ids) {
    const n = doc.nodes.find((x) => x.id === id);
    if (n?.type === "event") return true;
  }
  return false;
}

test("screen emphasis has no events", () => {
  const screen = hotel.nodes.find((n) => n.type === "screen");
  assert.ok(screen);
  const ids = focusEmphasisClosure(hotel, screen.id);
  assert.equal(hasEventId(ids, hotel), false);
  assert.ok(ids.has(screen.id));
});

test("command emphasis includes produced events", () => {
  const command = hotel.nodes.find((n) => n.type === "command");
  assert.ok(command);
  const ids = focusEmphasisClosure(hotel, command.id);
  assert.ok(ids.has(command.id));
  assert.ok(hasEventId(ids, hotel));
});

test("event emphasis matches detail cluster size floor", () => {
  const event = hotel.nodes.find((n) => n.type === "event");
  assert.ok(event);
  const ids = focusEmphasisClosure(hotel, event.id);
  assert.ok(ids.has(event.id));
});

test("focus fit for screen equals emphasis", () => {
  const screen = hotel.nodes.find((n) => n.type === "screen");
  assert.ok(screen);
  const emphasis = focusEmphasisClosure(hotel, screen.id);
  const fit = focusFitClosure(hotel, screen.id);
  assert.deepEqual([...fit].sort(), [...emphasis].sort());
});
