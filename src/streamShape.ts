import { z } from "zod";

/** Partial-order semantics for one EventStore stream kind (swimlane row). */
export const StreamShapeSchema = z.object({
  /** First append may be any one of these (mutually exclusive). */
  entryOneOf: z.array(z.string().min(1)).optional(),
  /** Stream may end with any one of these (mutually exclusive terminals). */
  exitOneOf: z.array(z.string().min(1)).optional(),
  /** After `afterEventId`, these may appear in any order and may repeat. */
  unorderedPool: z
    .object({
      afterEventId: z.string().min(1),
      eventIds: z.array(z.string().min(1)).min(1),
      label: z.string().optional(),
    })
    .optional(),
  /** Canvas columns left-to-right; multiple ids in one column are stacked (oneOf or pool). */
  layoutColumns: z.array(z.array(z.string().min(1)).min(1)).optional(),
});

export type StreamShape = z.infer<typeof StreamShapeSchema>;
