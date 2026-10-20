import { z } from "zod";

/** Only these relations may exist (Event Modeling rules). */
export const EdgeRelationSchema = z.enum([
  "issues",
  "produces",
  "updates",
  "rendersOn",
  "ordersBefore",
  "loopsBack",
  "translatesTo",
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
  issues: { fromTypes: ["screen"], toTypes: ["command"] },
  produces: { fromTypes: ["command"], toTypes: ["event"] },
  updates: { fromTypes: ["event"], toTypes: ["view"] },
  rendersOn: { fromTypes: ["view"], toTypes: ["screen"] },
  ordersBefore: { fromTypes: ["event"], toTypes: ["event"] },
  translatesTo: { fromTypes: ["integration"], toTypes: ["event"] },
};
