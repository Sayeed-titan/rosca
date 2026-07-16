"use client";

import { useState } from "react";
import {
  Trophy,
  Wallet,
  CalendarClock,
  ReceiptText,
  TriangleAlert,
  CircleCheckBig,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ReceiptDialog } from "@/features/payments/components/receipt-dialog";
import { cn } from "@/lib/utils";

const CYCLE_TONE = {
  PAID: "bg-brand-1/15 text-brand-1",
  ADVANCE: "bg-brand-1/15 text-brand-1",
  LATE: "bg-destructive/15 text-destructive",
  DUE: "bg-warning/15 text-warning",
  PARTIAL: "bg-warning/15 text-warning",
  UPCOMING: "bg-muted text-muted-foreground",
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function CommitteeCard({ c }) {
  const [receiptFor, setReceiptFor] = useState(null);

  return (
    <>
      <Card className="glass gap-0 overflow-hidden rounded-xl border-0 p-0">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-medium">{c.committeeName}</h2>
              <Badge variant="outline" className="text-[10px]">
                Seat #{c.position}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              {c.contributionDisplay} per cycle · pot {c.potDisplay}
            </p>
          </div>

          {c.hasReceived ? (
            <Badge variant="secondary" className="gap-1">
              <Trophy className="text-warning size-3" />
              Received in cycle {c.receivedInCycle}
            </Badge>
          ) : (
            <Badge variant="outline">Awaiting your turn</Badge>
          )}
        </div>

        <div className="border-border/60 grid gap-4 border-t p-5 sm:grid-cols-4">
          <Stat
            icon={Wallet}
            label="You've paid"
            value={c.paidDisplay}
            hint={`${c.cyclesPaid} of ${c.totalCycles} cycles`}
          />
          <Stat
            icon={c.hasArrears ? TriangleAlert : CircleCheckBig}
            label="Outstanding"
            value={c.outstandingDisplay}
            hint={c.hasArrears ? "Please settle this" : "You're up to date"}
            tone={c.hasArrears ? "warning" : "success"}
          />
          <Stat
            icon={CalendarClock}
            label="Remaining"
            value={c.remainingInstallments}
            hint={`installment${c.remainingInstallments === 1 ? "" : "s"} to pay`}
          />
          <Stat
            icon={CalendarClock}
            label="Next due"
            value={formatDate(c.nextDueDate)}
            hint={`Cycle ${c.nextCycleNumber}`}
          />
        </div>

        {/* Cycle strip — the whole committee at a glance, which is the thing a
            member actually wants to know: where am I, and when's my turn? */}
        <div className="border-border/60 border-t p-5">
          <p className="text-muted-foreground mb-2 text-xs font-medium">
            Your cycles
          </p>
          <div className="flex flex-wrap gap-1.5">
            {c.cycles.map((cy) => (
              <span
                key={cy.cycleNumber}
                title={`Cycle ${cy.cycleNumber} · due ${formatDate(cy.dueDate)} · ${cy.paidDisplay} of ${cy.expectedDisplay}`}
                className={cn(
                  "tabular rounded px-2 py-1 text-xs",
                  CYCLE_TONE[cy.status] ?? "bg-muted"
                )}
              >
                {cy.cycleNumber}
              </span>
            ))}
          </div>
        </div>

        {c.payments.length > 0 && (
          <div className="border-border/60 border-t">
            <p className="text-muted-foreground p-5 pb-2 text-xs font-medium">
              Your payments
            </p>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead>Cycle</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-sm">{formatDate(p.paidAt)}</TableCell>
                      <TableCell className="tabular text-sm">#{p.cycleNumber}</TableCell>
                      <TableCell className="tabular text-right text-sm">
                        <span className={p.isReversal ? "text-destructive" : ""}>
                          {p.amountDisplay}
                        </span>
                        {p.hasLateFee && (
                          <span className="text-warning block text-xs">
                            +{p.lateFeeDisplay} late fee
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {p.method}
                        {p.referenceNumber && (
                          <span className="block font-mono">{p.referenceNumber}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {p.receiptNumber && !p.isReversal && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Receipt for cycle ${p.cycleNumber}`}
                            onClick={() => setReceiptFor(p)}
                          >
                            <ReceiptText className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      <ReceiptDialog
        paymentId={receiptFor?.id}
        open={Boolean(receiptFor)}
        onOpenChange={(o) => !o && setReceiptFor(null)}
      />
    </>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }) {
  return (
    <div>
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Icon
          className={cn(
            "size-3.5",
            tone === "warning" && "text-warning",
            tone === "success" && "text-brand-1"
          )}
          aria-hidden="true"
        />
        {label}
      </p>
      <p className="tabular mt-1 font-semibold">{value}</p>
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

export function PortalView({ committees }) {
  return (
    <div className="space-y-4">
      {committees.map((c) => (
        <CommitteeCard key={c.seatId} c={c} />
      ))}
    </div>
  );
}
