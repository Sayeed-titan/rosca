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
 * There is no capacity limit here on purpose — the roster is flexible until the
 * first draw runs (see seats/service.js). Add whoever, whenever; the committee's
 * seat count and pot simply grow to match. The seat count is still worth spelling
 * out plainly, since taking two or three shares doubles or triples what someone
 * owes every cycle, and that should never be an accident.
 */
export function AssignSeatsDialog({ open, onOpenChange, committee, members }) {
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
      description={`Currently ${committee.totalSeats} seat${committee.totalSeats === 1 ? "" : "s"} — adding more grows the committee and the pot automatically. A member can hold several; each seat pays ${committee.contributionDisplay} every cycle and wins the pot once.`}
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
              max={50}
              required
              hint="No cap — add as many as this member is taking"
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
