import { z } from "zod";

import { CURRENCIES } from "@/features/committees/schema";

/** IANA zones relevant to this app's users. Not the full 400+ list. */
export const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
];

/**
 * Organization settings.
 *
 * VALIDATES ONLY — no `.transform()`. Runs on the client via zodResolver and
 * again in the Server Action, so it must parse its own output.
 */
export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2, { message: "Enter a name" }).max(120),
  currency: z.enum(CURRENCIES),
  timezone: z.enum(TIMEZONES),
});

export const ORG_ROLES = ["ORG_OWNER", "MANAGER", "MEMBER"];

export const changeRoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(ORG_ROLES),
});
