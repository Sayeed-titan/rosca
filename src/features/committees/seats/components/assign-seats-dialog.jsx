"use client";

import { useMemo } from "react";
import { Users } from "lucide-react";

import { FormDialog } from "@/components/common/form-dialog";
import { Field, SelectField } from "@/components/common/form-field";
import { assignSeatsSchema } from "../schema";
import { assignSeatsAction } from "../actions";

/**
 * Assign a member one or more seats.
 *
 * The seat count is the whole point: taking two or three shares is normal, and the
 * dialog says plainly what that commits them to, because it doubles or triples what
 * they owe every cycle.
 */
export function AssignSeatsDialog({ open, onOpenChange, committee, members, seatsOpen }) {
  const options = useMemo(
    () =>
      members.map((m) => ({
        value: m.id,
        label: m.seatsHeld
          ? `${m.fullName} — holds ${m.seatsHeld} seat${m.seatsHeld === 1 ? "" : "s"}`
          : m.fullName,
      })),
    [members]
  );

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Assign seats"
      description={`${seatsOpen} of ${committee.totalSeats} seats are free. A member can hold more than one — each seat pays ${committee.contributionDisplay} every cycle and wins the pot once.`}
      schema={assignSeatsSchema}
      defaultValues={{ committeeId: committee.id, memberId: "", seatCount: "1" }}
      submitLabel="Assign"
      successMessage="Seats assigned."
      onSubmit={assignSeatsAction}
    >
      {(form) => {
        const count = Number(form.watch("seatCount") || 0);
        const memberId = form.watch("memberId");
        const member = members.find((m) => m.id === memberId);

        return (
          <div className="grid gap-4">
            <SelectField
              form={form}
              name="memberId"
              label="Member"
              placeholder={options.length ? "Choose a member" : "No members yet"}
              options={options}
              required
            />

            <Field
              form={form}
              name="seatCount"
              label="Number of seats"
              type="number"
              min={1}
              max={Math.max(1, seatsOpen)}
              required
              hint={`${seatsOpen} free`}
            />

            {/* Spell out the commitment. Doubling someone's monthly obligation
                should never be an accident. */}
            {count > 0 && member && (
              <div className="glass rounded-lg p-3 text-sm">
                <p className="flex items-center gap-1.5 font-medium">
                  <Users className="size-3.5" aria-hidden="true" />
                  What this commits {member.fullName.split(" ")[0]} to
                </p>
                <ul className="text-muted-foreground mt-2 space-y-1 text-xs">
                  <li>
                    Pays{" "}
                    <span className="text-foreground tabular font-medium">
                      {committee.contributionDisplay}
                    </span>{" "}
                    × {count} = <span className="text-foreground font-medium">{count}</span>{" "}
                    contribution{count === 1 ? "" : "s"} every cycle
                  </li>
                  <li>
                    Receives the{" "}
                    <span className="text-foreground tabular font-medium">
                      {committee.potDisplay}
                    </span>{" "}
                    pot on {count} of the {committee.totalSeats} cycles
                  </li>
                  {member.seatsHeld > 0 && (
                    <li className="text-warning">
                      Already holds {member.seatsHeld} — this makes{" "}
                      {member.seatsHeld + count} in total
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        );
      }}
    </FormDialog>
  );
}
