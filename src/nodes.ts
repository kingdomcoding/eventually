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

/**
 * How a trigger field relates to the user.
 * presented = Data Presented (displayed); collected = Data Collected (entered by the user); metadata = sourced another way.
 */
export const TriggerFieldCategorySchema = z.enum(["presented", "collected", "metadata"]);

export const TriggerFieldSchema = EventFieldSchema.extend({
  category: TriggerFieldCategorySchema,
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
  /** Shown under the name as "stream: …". */
  streamTag: z.string().min(1).optional(),
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
  /** Shown under the name as "stream: …". */
  streamTag: z.string().min(1).optional(),
});

export const DataTableNodeSchema = NodeBase.extend({
  type: z.literal("dataTable"),
  fields: z.array(FieldSpecSchema),
  /** Events that feed this projection. Empty for external/catalog tables. */
  fedBy: z.array(z.string().min(1)).default([]),
});

/** Background processor (event-modeling gear): watches a data table and issues commands. */
export const AutomationNodeSchema = NodeBase.extend({
  type: z.literal("automation"),
  /** Data table ids this processor watches. */
  observes: z.array(z.string().min(1)).default([]),
  /**
   * Outside system this processor calls. Shown as External: under the section line,
   * not as a Who.
   */
  external: z.string().min(1).optional(),
  /** Request fields shown under Data Presented. Same categories as trigger fields. */
  fields: z.array(TriggerFieldSchema).optional(),
  /** Shapes returned by that external API (success and error cases). */
  apiClientResponse: z.array(ApiClientResponseCaseSchema).optional(),
});

/** A UI control that issues a command (button, link). Lives on a ui-band stream. */
export const TriggerNodeSchema = NodeBase.extend({
  type: z.literal("trigger"),
  actor: z.string().min(1),
  /** Fields on this control, grouped as Data Presented, Data Collected, or Metadata. */
  fields: z.array(TriggerFieldSchema).optional(),
  /** Hosted outside the product (e.g. Paystack checkout). Kind label: External Web Page. */
  external: z.boolean().optional(),
  /** Paystack (or similar) auto-redirect URL. Kind label: Auto-Redirect URL. */
  autoRedirect: z.boolean().optional(),
  /**
   * Screen/page names this control sits on (display names).
   * Grouped with the sticky kind in the header band. Array so a component can belong to multiple pages later.
   */
  parents: z.array(z.string().min(1)).optional(),
});

export const ScreenNodeSchema = NodeBase.extend({
  type: z.literal("screen"),
  actor: z.string().min(1),
  /** Bind UI fields to command inputs or data-table fields. */
  bindings: z.array(
    z.object({
      uiField: z.string().min(1),
      target: z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("commandInput"), commandId: z.string(), field: z.string() }),
        z.object({ kind: z.literal("dataTableField"), dataTableId: z.string(), field: z.string() }),
      ]),
    }),
  ),
  wireframeRef: z.string().optional(),
});

export const BlueprintNodeSchema = z.discriminatedUnion("type", [
  EventNodeSchema,
  CommandNodeSchema,
  DataTableNodeSchema,
  ScreenNodeSchema,
  TriggerNodeSchema,
  AutomationNodeSchema,
]);

export type BlueprintNode = z.infer<typeof BlueprintNodeSchema>;
