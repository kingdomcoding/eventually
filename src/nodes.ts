import { z } from "zod";
import { FieldSpecSchema } from "./fields.js";

/** Canvas may read/write layout; semantics ignore it. */
export const LayoutSchema = z
  .object({
    x: z.number(),
    y: z.number(),
  })
  .optional();

const NodeBase = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  swimlaneId: z.string().min(1),
  sliceId: z.string().min(1).optional(),
  layout: LayoutSchema,
  notes: z.string().optional(),
});

export const EventNodeSchema = NodeBase.extend({
  type: z.literal("event"),
  /** Horizontal order on the timeline (0, 1, 2, …). Canvas uses this for default X. */
  timelineIndex: z.number().int().nonnegative(),
  payload: z.array(FieldSpecSchema),
});

export const CommandNodeSchema = NodeBase.extend({
  type: z.literal("command"),
  input: z.array(FieldSpecSchema),
  /** Event ids produced on success. */
  produces: z.array(z.string().min(1)).min(1),
  /** Named rejection outcomes (no event stored). */
  rejections: z
    .array(
      z.object({
        code: z.string().min(1),
        when: z.string().min(1),
      }),
    )
    .default([]),
});

export const ViewNodeSchema = NodeBase.extend({
  type: z.literal("view"),
  fields: z.array(FieldSpecSchema),
  /** Events that feed this projection. */
  fedBy: z.array(z.string().min(1)).min(1),
});

export const ScreenNodeSchema = NodeBase.extend({
  type: z.literal("screen"),
  actor: z.string().min(1),
  /** Bind UI fields to command inputs or view fields. */
  bindings: z.array(
    z.object({
      uiField: z.string().min(1),
      target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("commandInput"), commandId: z.string(), field: z.string() }),
        z.object({ kind: z.literal("viewField"), viewId: z.string(), field: z.string() }),
      ]),
    }),
  ),
  wireframeRef: z.string().optional(),
});

export const BlueprintNodeSchema = z.discriminatedUnion("type", [
  EventNodeSchema,
  CommandNodeSchema,
  ViewNodeSchema,
  ScreenNodeSchema,
]);

export type BlueprintNode = z.infer<typeof BlueprintNodeSchema>;
