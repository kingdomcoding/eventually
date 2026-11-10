import { z } from "zod";

/** Only these relations may exist (Event Modeling rules). */
export const EdgeRelationSchema = z.enum([
  "issues",
  "produces",
  "updates",
  "rendersOn",
  "observes",
  "redirectsTo",
  "ordersBefore",
  "loopsBack",
]);

export type EdgeRelation = z.infer<typeof EdgeRelationSchema>;

export const BlueprintEdgeSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  rel: EdgeRelationSchema,
});

export type BlueprintEdge = z.infer<typeof BlueprintEdgeSchema>;

/** Expected rel for semantic pairs (canvas + validator). */
export const ALLOWED_EDGES: Record<
  EdgeRelation,
  { fromTypes: string[]; toTypes: string[] } | null
> = {
  issues: { fromTypes: ["screen", "automation", "trigger"], toTypes: ["command"] },
  produces: { fromTypes: ["command"], toTypes: ["event"] },
  updates: { fromTypes: ["event"], toTypes: ["dataTable"] },
  rendersOn: { fromTypes: ["dataTable"], toTypes: ["screen", "trigger"] },
  /** Read model drives a processor (data table → automation). */
  observes: { fromTypes: ["dataTable"], toTypes: ["automation"] },
  /** Automatic UI handoff (e.g. in-app page → hosted checkout). */
  redirectsTo: { fromTypes: ["screen", "trigger"], toTypes: ["screen", "trigger"] },
  ordersBefore: { fromTypes: ["event"], toTypes: ["event"] },
  loopsBack: { fromTypes: ["event"], toTypes: ["event"] },
};
