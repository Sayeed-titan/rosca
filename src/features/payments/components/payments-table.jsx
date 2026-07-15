"use client";

import { useState } from "react";
import {
  MoreHorizontal,
  Plus,
  Receipt as ReceiptIcon,
  Undo2,
  Wallet,
} from "lucide-react";

import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTableParams } from "@/hooks/use-table-params";
import { PaymentFormDialog } from "./payment-form-dialog";
import { ReceiptDialog } from "./receipt-dialog";
import { ReversalDialog } from "./reversal-dialog";

const METHOD_LABEL = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  CARD: "Card",
  OTHER: "Other",
};

export function PaymentsTable({ rows, total, pageSize, committees, can }) {
  const { q } = useTableParams();
  const [creating, setCreating] = useState(false);
  const [receiptFor, setReceiptFor] = useState(null);
  const [reversing, setReversing] = useState(null);

  const columns = [
    {
      key: "memberName",
      header: "Member",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.memberName}</p>
          <p className="text-muted-foreground truncate text-xs">{row.committeeName}</p>
        </div>
      ),
    },
    {
      key: "cycleNumber",
      header: "Cycle",
      sortable: true,
      className: "tabular",
      cell: (row) => `#${row.cycleNumber}`,
    },
    {
      key: "amountMinor",
      header: "Amount",
      sortable: true,
      className: "tabular",
      cell: (row) => (
        <div>
          {/* Reversals are shown as the negative they are, not hidden or greyed
              out — the ledger's arithmetic should be legible on the page. */}
          <span className={row.isReversal ? "text-destructive" : ""}>
            {row.amountDisplay}
          </span>
          {row.hasLateFee && (
            <p className="text-warning text-xs">+{row.lateFeeDisplay} late fee</p>
          )}
        </div>
      ),
    },
    {
      key: "method",
      header: "Method",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm">{METHOD_LABEL[row.method] ?? row.method}</p>
          {row.referenceNumber && (
            <p className="text-muted-foreground truncate font-mono text-xs">
              {row.referenceNumber}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "paidAt",
      header: "Paid",
      sortable: true,
      cell: (row) =>
        new Date(row.paidAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) =>
        row.isReversal ? (
          <Badge variant="destructive">Reversal</Badge>
        ) : row.isReversed ? (
          <Badge variant="outline">Reversed</Badge>
        ) : (
          <Badge variant="secondary">Recorded</Badge>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headClassName: "w-12",
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" />}
            aria-label={`Actions for ${row.memberName}'s payment`}
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.receiptNumber && (
              <DropdownMenuItem onClick={() => setReceiptFor(row)}>
                <ReceiptIcon className="size-4" />
                View receipt
              </DropdownMenuItem>
            )}
            {/* Reversal is offered only where it's actually possible: not on a
                reversal row, and not on something already reversed. */}
            {can.reverse && !row.isReversal && !row.isReversed && (
              <DropdownMenuItem variant="destructive" onClick={() => setReversing(row)}>
                <Undo2 className="size-4" />
                Reverse payment
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const empty = q ? (
    <EmptyState
      icon={Wallet}
      title="No payments match your search"
      description={`Nothing found for “${q}”.`}
    />
  ) : (
    <EmptyState
      icon={Wallet}
      title="No payments recorded yet"
      description="Record what members contribute each cycle. Every entry is permanent — corrections are made by reversal, so the history always tells the truth."
      action={
        can.create ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Record the first payment
          </Button>
        ) : null
      }
    />
  );

  return (
    <>
      <DataTable
        columns={columns}
        rows={rows}
        total={total}
        pageSize={pageSize}
        searchPlaceholder="Search member, committee or reference…"
        empty={empty}
        toolbar={
          can.create && committees.length > 0 ? (
            <Button className="ml-auto" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              Record payment
            </Button>
          ) : null
        }
      />

      <PaymentFormDialog
        open={creating}
        onOpenChange={setCreating}
        committees={committees}
      />

      <ReceiptDialog
        paymentId={receiptFor?.id}
        open={Boolean(receiptFor)}
        onOpenChange={(o) => !o && setReceiptFor(null)}
      />

      <ReversalDialog
        payment={reversing}
        open={Boolean(reversing)}
        onOpenChange={(o) => !o && setReversing(null)}
      />
    </>
  );
}
