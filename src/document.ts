import { z } from "zod";
import { BlueprintEdgeSchema } from "./edges.js";
import { BlueprintNodeSchema } from "./nodes.js";
import { StreamShapeSchema } from "./streamShape.js";

/** Canvas bands; ui/commandView may have multiple swimlanes; events band holds one row per stream. */
export const SwimlaneBandSchema = z.enum(["ui", "commandView", "events", "integration"]);

export type SwimlaneBand = z.infer<typeof SwimlaneBandSchema>;

export const SwimlaneSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  band: SwimlaneBandSchema,
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
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const BlueprintDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  meta: BlueprintMetaSchema,
  swimlanes: z.array(SwimlaneSchema).min(1),
  nodes: z.array(BlueprintNodeSchema),
  edges: z.array(BlueprintEdgeSchema),
});

export type BlueprintDocument = z.infer<typeof BlueprintDocumentSchema>;

/** Which band a node type must live in. */
export const NODE_BAND: Record<string, SwimlaneBand> = {
  screen: "ui",
  command: "commandView",
  view: "commandView",
  event: "events",
  integration: "integration",
};
