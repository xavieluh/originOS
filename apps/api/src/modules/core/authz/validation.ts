import { ACTIONS, RESOURCE_TYPES } from "@originos/authz";
import { CONSENT_PURPOSES } from "@originos/db";
import { z } from "zod";

const OptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const CreateAgentBody = z
  .object({ name: z.string().trim().min(2).max(80), description: OptionalText(280) })
  .strict();

export const CreateGrantBody = z
  .object({
    subjectType: z.enum(["user", "agent"]),
    subjectId: z.uuid(),
    effect: z.enum(["allow", "deny"]),
    resourceType: z.enum([...RESOURCE_TYPES, "*"]),
    resourceId: OptionalText(200),
    actions: z.array(z.enum(ACTIONS)).min(1).max(ACTIONS.length),
    reason: OptionalText(280),
    expiresAt: z.iso
      .datetime({ offset: true })
      .optional()
      .transform((v) => (v ? new Date(v) : null)),
  })
  .strict();

export const GiveConsentBody = z
  .object({
    purpose: z.enum(CONSENT_PURPOSES),
    scopeKey: z.string().trim().max(200).optional().default(""),
  })
  .strict();
