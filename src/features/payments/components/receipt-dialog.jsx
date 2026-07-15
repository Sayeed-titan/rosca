"use client";

import { useEffect, useState } from "react";
import { Printer, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getReceiptAction } from "../actions";

/**
 * Printable receipt.
 *
 * Renders the stored snapshot, not a fresh computation. If the committee's late fee
 * changes next year, a reprint of this receipt must still show what was actually
 * charged at the time — a receipt that changes retroactively isn't a receipt.
 */
export function ReceiptDialog({ paymentId, open, onOpenChange }) {
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open || !paymentId) return;
    setReceipt(null);
    setError(null);

    getReceiptAction(paymentId).then((r) => {
      if (r.ok) setReceipt(r.data);
      else setError(r.error.message);
    });
  }, [open, paymentId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
          <DialogDescription>
            {receipt ? `No. ${receipt.receiptNumber}` : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}

        {!receipt && !error && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {receipt && (
          // print:* classes strip the dialog chrome so a Ctrl+P gives a clean slip.
          <div
            id="receipt-print-area"
            className="border-border/60 space-y-4 rounded-lg border p-5 print:border-0"
          >
            <div className="text-center">
              <p className="brand-text-gradient text-lg font-semibold">CircleFund</p>
              <p className="text-muted-foreground text-xs">Payment receipt</p>
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Row label="Receipt no." value={receipt.receiptNumber} mono />
              <Row label="Committee" value={receipt.committeeName} />
              <Row label="Member" value={receipt.memberName} />
              <Row label="Cycle" value={`#${receipt.cycleNumber}`} />
              <Row
                label="Paid on"
                value={new Date(receipt.paidAt).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              />
              <Row label="Method" value={receipt.method} />
              {receipt.referenceNumber && (
                <Row label="Reference" value={receipt.referenceNumber} mono />
              )}
            </dl>

            <div className="border-border/60 space-y-2 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contribution</span>
                <span className="tabular">{receipt.amount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Late fee</span>
                <span className="tabular">{receipt.lateFee}</span>
              </div>
              <div className="border-border/60 flex justify-between border-t pt-2 font-medium">
                <span>Total</span>
                <span className="tabular">{receipt.total}</span>
              </div>
            </div>

            <p className="text-muted-foreground text-center text-[10px]">
              Recorded by {receipt.recordedBy} · This receipt is a permanent record.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => window.print()} disabled={!receipt}>
            <Printer className="size-4" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, mono }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{value}</dd>
    </>
  );
}
