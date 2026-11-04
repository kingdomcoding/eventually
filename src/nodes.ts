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
  streamId: z.string().min(1),
  sliceId: z.string().min(1).optional(),
  layout: LayoutSchema,
  notes: z.string().optional(),
});

/** Prototype field list (name/type/description). Separate from FieldSpec, which traces where a value comes from. */
export const EventFieldSchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().min(1),
});

/** One outcome shape returned by an API client (e.g. Paystack success vs error). */
export const ApiClientResponseCaseSchema = z.object({
  label: z.string().min(1),
  fields: z.array(EventFieldSchema).min(1),
});

export const EventNodeSchema = NodeBase.extend({
  type: z.literal("event"),
  /** Horizontal order on the timeline (0, 1, 2, …). Canvas uses this for default X. */
  timelineIndex: z.number().int().nonnegative(),
  payload: z.array(FieldSpecSchema),
  fields: z.array(EventFieldSchema).optional(),
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
  /** Prototype fields the UI supplies to this command (shown under Fields). */
  fields: z.array(EventFieldSchema).optional(),
  /** Shapes the internal API client returns (success and error cases). */
  apiClientResponse: z.array(ApiClientResponseCaseSchema).optional(),
});

export const ViewNodeSchema = NodeBase.extend({
  type: z.literal("view"),
  fields: z.array(FieldSpecSchema),
  /** Events that feed this projection. */
  fedBy: z.array(z.string().min(1)).min(1),
});

/** Background processor (event-modeling gear): watches a view and issues commands. */
export const AutomationNodeSchema = NodeBase.extend({
  type: z.literal("automation"),
  /** View ids this processor watches. */
  observes: z.array(z.string().min(1)).default([]),
});

/** A UI control that issues a command (button, link). Lives on a ui-band stream. */
export const TriggerNodeSchema = NodeBase.extend({
  type: z.literal("trigger"),
  actor: z.string().min(1),
  /** Prototype field list for the control (e.g. button inputs). Same shape as event fields. */
  fields: z.array(EventFieldSchema).optional(),
  /** Hosted outside the product (e.g. Paystack checkout). Shown with an External badge. */
  external: z.boolean().optional(),
  /**
   * Screen/page names this control sits on (display names).
   * Array so a component can belong to multiple pages later.
   */
  parents: z.array(z.string().min(1)).optional(),
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
  TriggerNodeSchema,
  AutomationNodeSchema,
]);

export type BlueprintNode = z.infer<typeof BlueprintNodeSchema>;
