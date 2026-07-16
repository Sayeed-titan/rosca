"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarCheck, CheckCheck, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PAYMENT_METHODS } from "../schema";
import { recordBulkPaymentsAction } from "../actions";

const METHOD_LABEL = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  CARD: "Card",
  OTHER: "Other",
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Collect payments for a whole committee at once.
 *
 * One row per SEAT (not per member — a 3-seat member shows 3 rows, each its own
 * amount and cycle count), pre-filled with the committee's contribution. Check
 * the rows that are actually being paid, adjust "cycles" for anyone paying
 * several months ahead, and submit once.
 */
export function BulkPaymentTable({ committees }) {
  const [committeeId, setCommitteeId] = useState(committees[0]?.id ?? "");
  const committee = useMemo(
    () => committees.find((c) => c.id === committeeId),
    [committees, committeeId]
  );

  const [paidAt, setPaidAt] = useState(today());
  const [method, setMethod] = useState("CASH");
  const [rowState, setRowState] = useState({}); // seatId -> {included, cycles, reference}
  const [isPending, startTransition] = useTransition();

  function row(seat) {
    return (
      rowState[seat.id] ?? {
        included: !seat.isPaidForNextCycle,
        cycles: 1,
        reference: seat.savedAccounts.find((a) => a.method === method && a.isDefault)
          ?.accountNumber ?? "",
      }
    );
  }

  function updateRow(seatId, patch) {
    setRowState((prev) => {
      const seat = committee?.seats.find((s) => s.id === seatId);
      const base = seat ? row(seat) : { included: false, cycles: 1, reference: "" };
      return { ...prev, [seatId]: { ...base, ...prev[seatId], ...patch } };
    });
  }

  // Switching method re-suggests each included row's saved account for that
  // method, without clobbering anything the user already typed by hand.
  function handleMethodChange(nextMethod) {
    setMethod(nextMethod);
    setRowState((prev) => {
      const next = { ...prev };
      for (const seat of committee?.seats ?? []) {
        const existing = next[seat.id];
        if (existing?.referenceTouched) continue; // user already typed something
        const saved = seat.savedAccounts.find((a) => a.method === nextMethod)?.accountNumber ?? "";
        next[seat.id] = { ...row(seat), ...existing, reference: saved };
      }
      return next;
    });
  }

  const includedCount = (committee?.seats ?? []).filter((s) => row(s).included).length;

  function handleSubmit() {
    if (!committee) return;
    const entries = committee.seats
      .filter((s) => row(s).included)
      .map((s) => ({
        committeeMemberId: s.id,
        startCycle: committee.nextDrawCycle,
        cycleCount: Math.max(1, Number(row(s).cycles) || 1),
        amountPerCycle: committee.contribution,
        referenceNumber: row(s).reference || undefined,
      }));

    if (entries.length === 0) {
      toast.error("Select at least one seat.");
      return;
    }

    startTransition(async () => {
      const result = await recordBulkPaymentsAction({
        committeeId: committee.id,
        paidAt,
        method,
        entries,
      });

      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }

      toast.success(
        `Recorded ${result.data.count} payment${result.data.count === 1 ? "" : "s"} — ${result.data.totalDisplay}`
      );
      setRowState({});
    });
  }

  if (committees.length === 0) {
    return null;
  }

  return (
    <Card className="glass gap-0 overflow-hidden rounded-xl border-0 p-0">
      <div className="flex flex-wrap items-center gap-3 p-4">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Wallet className="size-4" aria-hidden="true" />
          Collect payments
        </h2>

        <Select value={committeeId} onValueChange={(v) => { setCommitteeId(v); setRowState({}); }}>
          <SelectTrigger className="w-56" aria-label="Committee">
            <SelectValue placeholder="Choose a committee" />
          </SelectTrigger>
          <SelectContent>
            {committees.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={paidAt}
          onChange={(e) => setPaidAt(e.target.value)}
          className="w-40"
          aria-label="Payment date"
        />

        <Select value={method} onValueChange={handleMethodChange}>
          <SelectTrigger className="w-40" aria-label="Payment method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {METHOD_LABEL[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <CalendarCheck className="size-3" />
            Cycle {committee?.nextDrawCycle}
          </Badge>
          <Button onClick={handleSubmit} disabled={isPending || includedCount === 0}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            <CheckCheck className="size-4" />
            Record {includedCount} payment{includedCount === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      {committee && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10" />
                <TableHead>Member</TableHead>
                <TableHead className="w-24">Cycles</TableHead>
                <TableHead className="w-32">Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="w-24">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {committee.seats.map((seat) => {
                const r = row(seat);
                return (
                  <TableRow key={seat.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={r.included}
                        onChange={(e) => updateRow(seat.id, { included: e.target.checked })}
                        className="size-4 rounded"
                        aria-label={`Include ${seat.memberName}`}
                      />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">
                        #{seat.position} {seat.memberName}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        max={24}
                        value={r.cycles}
                        onChange={(e) => updateRow(seat.id, { cycles: e.target.value })}
                        disabled={!r.included}
                        className="h-8 w-20"
                        aria-label={`Cycles for ${seat.memberName}`}
                      />
                    </TableCell>
                    <TableCell className="tabular text-sm">
                      {committee.contributionDisplay}
                      {Number(r.cycles) > 1 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          × {r.cycles}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.reference}
                        onChange={(e) =>
                          updateRow(seat.id, { reference: e.target.value, referenceTouched: true })
                        }
                        disabled={!r.included}
                        placeholder={METHOD_LABEL[method] === "Cash" ? "—" : "Number / id"}
                        className="h-8"
                        aria-label={`Reference for ${seat.memberName}`}
                      />
                    </TableCell>
                    <TableCell>
                      {seat.isPaidForNextCycle ? (
                        <Badge variant="secondary">Paid</Badge>
                      ) : (
                        <Badge variant="outline">Due</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Card>
  );
}
