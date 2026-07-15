import { z } from "zod";

/**
 * Seat assignment validation.
 *
 * `seatCount` is the point of this whole feature: a member may take several shares
 * in one committee, paying the contribution once per seat each cycle and being
 * eligible for the pot once per seat.
 */
export const assignSeatsSchema = z.object({
  committeeId: z.string().min(1),
  memberId: z.string().min(1, { message: "Choose a member" }),
  seatCount: z.coerce
    .number()
    .int()
    .min(1, { message: "At least one seat" })
    .max(50, { message: "50 seats is the maximum for one member" }),
});

export const removeSeatSchema = z.object({
  seatId: z.string().min(1),
});
