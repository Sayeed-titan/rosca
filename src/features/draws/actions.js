"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withPermission } from "@/core/auth/action";
import { Permission } from "@/core/auth/permissions";
import * as service from "./service";
import { err } from "@/core/result";
import { ErrorCode } from "@/core/errors";

const runSchema = z.object({
  committeeId: z.string().min(1),
  override: z.boolean().optional().default(false),
  overrideReason: z.string().trim().max(300).optional(),
  mode: z.enum(["MANUAL", "AUTOMATIC", "SCHEDULED"]).optional().default("MANUAL"),
});

export const previewDrawAction = withPermission(
  Permission.DRAW_VIEW,
  async ({ db }, committeeId) => {
    if (typeof committeeId !== "string" || !committeeId) {
      return err(ErrorCode.VALIDATION, "Missing committee id.");
    }

    const result = await service.previewDraw(db, committeeId);
    if (!result.ok) return result;

    // The preview crosses to the client, so strip BigInt and keep only what the
    // wheel needs.
    const { committee, candidates, cycleNumber, collection, payoutDisplay } = result.data;

    return {
      ok: true,
      data: {
        committeeId: committee.id,
        committeeName: committee.name,
        cycleNumber,
        payoutDisplay,
        candidates: candidates.map((c) => ({
          id: c.id,
          name: c.member.fullName,
          position: c.position,
        })),
        collectionComplete: collection.complete,
        shortfalls: collection.shortfalls.map((s) => ({
          memberName: s.memberName,
          status: s.status,
        })),
      },
    };
  }
);

/**
 * Run the draw.
 *
 * Guarded by DRAW_RUN. Overriding the collection rule additionally requires
 * DRAW_OVERRIDE, re-checked inside the service rather than trusted from here.
 */
export const runDrawAction = withPermission(
  Permission.DRAW_RUN,
  async ({ actor, db }, input) => {
    const parsed = runSchema.safeParse(input);
    if (!parsed.success) {
      return err(ErrorCode.VALIDATION, "Invalid draw request.", {
        fields: parsed.error.flatten().fieldErrors,
      });
    }

    const result = await service.runDraw(db, actor, parsed.data);

    if (result.ok) {
      revalidatePath("/draws");
      revalidatePath("/dashboard");
      revalidatePath("/committees");
    }
    return result;
  }
);

export const verifyDrawAction = withPermission(
  Permission.DRAW_VIEW,
  async ({ db }, drawId) => {
    if (typeof drawId !== "string" || !drawId) {
      return err(ErrorCode.VALIDATION, "Missing draw id.");
    }
    return service.verifyStoredDraw(db, drawId);
  }
);
