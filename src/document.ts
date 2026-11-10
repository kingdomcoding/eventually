import { z } from "zod";
import { BlueprintEdgeSchema } from "./edges.js";
import { BlueprintNodeSchema } from "./nodes.js";
import { StreamShapeSchema } from "./streamShape.js";

/** Canvas bands; ui/commandView may have multiple streams; events band holds one row per stream. */
export const StreamBandSchema = z.enum(["ui", "commandView", "events"]);

export type StreamBand = z.infer<typeof StreamBandSchema>;

export const StreamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  band: StreamBandSchema,
  /** Row index within this band (0 = first lane). */
  order: z.number().int().nonnegative(),
  /** EventStore stream id pattern (e.g. subscription-{userId}). Shown in gutter. */
  streamPattern: z.string().min(1).optional(),
  /** Legal append sequences (partial order), not a single spine. */
  streamShape: StreamShapeSchema.optional(),
});

export const BlueprintMetaSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.number().int().positive(),
  modelVersion: z.number().int().positive(),
  /** Global left-to-right story order (event node ids) for timeline mode. */
  narrativeOrder: z.array(z.string().min(1)).optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const BlueprintDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  meta: BlueprintMetaSchema,
  streams: z.array(StreamSchema).min(1),
  nodes: z.array(BlueprintNodeSchema),
  edges: z.array(BlueprintEdgeSchema),
});

export type BlueprintDocument = z.infer<typeof BlueprintDocumentSchema>;

/** Which band a node type must live in. */
export const NODE_BAND: Record<string, StreamBand> = {
  screen: "ui",
  trigger: "ui",
  automation: "ui",
  command: "commandView",
  dataTable: "commandView",
  event: "events",
};
