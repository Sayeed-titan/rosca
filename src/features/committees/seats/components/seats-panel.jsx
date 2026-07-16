"use client";

import { useState } from "react";
import { Trophy, UserPlus, Users, X, Layers } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AssignSeatsDialog } from "./assign-seats-dialog";
import { removeSeatAction } from "../actions";

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/**
 * The committee roster.
 *
 * One row per SEAT, not per member — so a member holding three shares appears three
 * times, each with its own payment position and its own shot at the pot. That's the
 * truth of how the money works, and flattening it to one row per person would hide
 * that they owe triple.
 */
export function SeatsPanel({ data, members, can }) {
  const [assigning, setAssigning] = useState(false);
  const [removing, setRemoving] = useState(null);

  const { committee, seats, seatsTaken, uniqueMembers, drawsRun } = data;
  // The roster is flexible right up until the first draw — there is no "full"
  // state to gate on any more. It locks only once drawing starts, because the pot
  // size and cycle count are fixed at that point.
  const rosterLocked = drawsRun > 0;

  return (
    <>
      <Card className="glass gap-0 overflow-hidden rounded-xl border-0 p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-medium">
              <Layers className="size-4" aria-hidden="true" />
              Seats
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              <span className="tabular">{seatsTaken}</span> seat
              {seatsTaken === 1 ? "" : "s"} held by{" "}
              <span className="tabular">{uniqueMembers}</span>{" "}
              {uniqueMembers === 1 ? "person" : "people"}
              {!rosterLocked && " · flexible until the first draw"}
            </p>
          </div>

          {can.assign && !rosterLocked && (
            <Button onClick={() => setAssigning(true)}>
              <UserPlus className="size-4" />
              Assign seats
            </Button>
          )}
        </div>

        {rosterLocked && (
          <p className="border-border/60 text-muted-foreground border-y px-4 py-2 text-xs">
            Draws have started, so the roster is locked at {committee.totalSeats}{" "}
            seat{committee.totalSeats === 1 ? "" : "s"}. Changing it now would alter
            the pot everyone already paid into.
          </p>
        )}

        {seats.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No seats assigned"
            description={`This committee has ${committee.totalSeats} seats to fill. A member can take more than one — each seat pays ${committee.contributionDisplay} per cycle and wins the pot once.`}
            action={
              can.assign ? (
                <Button onClick={() => setAssigning(true)}>
                  <UserPlus className="size-4" />
                  Assign the first seat
                </Button>
              ) : null
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-16">Seat</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Received pot?</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Outstanding</TableHead>
                  <TableHead>Remaining</TableHead>
                  {can.assign && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>

              <TableBody>
                {seats.map((seat) => (
                  <TableRow key={seat.id}>
                    <TableCell className="tabular font-medium">#{seat.position}</TableCell>

                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-7">
                          <AvatarFallback className="text-[10px]">
                            {initials(seat.memberName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{seat.memberName}</p>
                          <p className="text-muted-foreground truncate text-xs">
                            {seat.memberPhone}
                          </p>
                        </div>
                        {/* Make multi-seat holders obvious — otherwise the same
                            name appearing twice looks like a duplicate bug. */}
                        {seat.seatsHeldByMember > 1 && (
                          <Tooltip>
                            <TooltipTrigger render={<span className="inline-flex" />}>
                              <Badge variant="outline" className="gap-1 text-[10px]">
                                <Layers className="size-2.5" />
                                {seat.seatsHeldByMember}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              Holds {seat.seatsHeldByMember} seats in this committee
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      {seat.hasReceived ? (
                        <Badge variant="secondary" className="gap-1">
                          <Trophy className="text-warning size-3" />
                          Cycle {seat.receivedInCycle}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Not yet</span>
                      )}
                    </TableCell>

                    <TableCell className="tabular text-sm">{seat.paidDisplay}</TableCell>

                    <TableCell className="tabular text-sm">
                      <span className={seat.hasArrears ? "text-warning font-medium" : "text-muted-foreground"}>
                        {seat.outstandingDisplay}
                      </span>
                    </TableCell>

                    <TableCell className="tabular text-sm">
                      {seat.remainingInstallments}
                      <span className="text-muted-foreground ml-1 text-xs">
                        of {committee.totalSeats}
                      </span>
                    </TableCell>

                    {can.assign && (
                      <TableCell>
                        {!rosterLocked && !seat.hasReceived && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove seat ${seat.position}`}
                            onClick={() => setRemoving(seat)}
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <AssignSeatsDialog
        open={assigning}
        onOpenChange={setAssigning}
        committee={committee}
        members={members}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove seat"
        description={
          removing
            ? `Seat #${removing.position} (${removing.memberName}) will be removed from this committee. This is refused if any payments are recorded against it.`
            : ""
        }
        confirmLabel="Remove seat"
        onConfirm={() => removeSeatAction({ seatId: removing.id })}
      />
    </>
  );
}
