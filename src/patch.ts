import { z } from "zod";
import { BlueprintEdgeSchema } from "./edges.js";
import { BlueprintNodeSchema } from "./nodes.js";

/** Future AI/human review: apply patches, then re-validate. */
export const PatchOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("addNode"), node: BlueprintNodeSchema }),
  z.object({ op: z.literal("removeNode"), nodeId: z.string().min(1) }),
  z.object({ op: z.literal("updateNode"), nodeId: z.string().min(1), node: BlueprintNodeSchema }),
  z.object({ op: z.literal("addEdge"), edge: BlueprintEdgeSchema }),
  z.object({ op: z.literal("removeEdge"), edgeId: z.string().min(1) }),
]);

export const PatchProposalSchema = z.object({
  intent: z.enum(["propose", "apply"]),
  modelVersion: z.number().int().positive(),
  patches: z.array(PatchOpSchema),
  openQuestions: z.array(z.string()).default([]),
});

export type PatchProposal = z.infer<typeof PatchProposalSchema>;
