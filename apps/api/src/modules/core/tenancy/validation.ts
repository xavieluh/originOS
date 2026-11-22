import { INVITABLE_ROLES } from "@originos/db";
import { z } from "zod";
import { badRequest } from "../auth/errors.js";

export const OrganizationName = z.string().trim().min(2).max(80);
export const CreateOrganizationBody = z.object({ name: OrganizationName }).strict();
export const RenameOrganizationBody = z.object({ name: OrganizationName }).strict();
export const SwitchOrganizationBody = z.object({ organizationId: z.uuid() }).strict();
export const CreateInvitationBody = z
  .object({ email: z.email().max(254), role: z.enum(INVITABLE_ROLES) })
  .strict();
export const TokenBody = z.object({ token: z.string().min(20).max(200) }).strict();
export const ChangeRoleBody = z.object({ role: z.enum(INVITABLE_ROLES) }).strict();
export const TransferOwnershipBody = z.object({ userId: z.uuid() }).strict();
export const UuidParam = z.uuid();

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = result.error.issues.map((i) => i.path.join(".") || "body").join(", ");
    throw badRequest("invalid_request", `Invalid or missing: ${fields}.`);
  }
  return result.data;
}
