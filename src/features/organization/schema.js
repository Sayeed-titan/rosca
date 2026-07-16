import { z } from "zod";

export const renameOrganizationSchema = z.object({
  name: z.string().trim().min(2, { message: "Name must be at least 2 characters" }).max(120),
});
