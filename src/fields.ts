import { z } from "zod";

/** How a field value is obtained (traceability for completeness checks). */
export const FieldSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user") }),
  z.object({ kind: z.literal("generated") }),
  z.object({ kind: z.literal("derived"), note: z.string().optional() }),
  z.object({
    kind: z.literal("fromEvent"),
    eventId: z.string().min(1),
    field: z.string().min(1),
  }),
  z.object({ kind: z.literal("external"), note: z.string().optional() }),
]);

export type FieldSource = z.infer<typeof FieldSourceSchema>;

export const FieldSpecSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  optional: z.boolean().default(false),
  source: FieldSourceSchema,
});

export type FieldSpec = z.infer<typeof FieldSpecSchema>;
