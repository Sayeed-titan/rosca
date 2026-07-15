"use client";

import { useState } from "react";
import { Dices, ShieldCheck, ShieldAlert, Trophy, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DrawDialog } from "./draw-dialog";
import { verifyDrawAction } from "../actions";

export function DrawsTable({ rows, total, pageSize, committees, can }) {
  const [drawing, setDrawing] = useState(null);
  const [verifying, setVerifying] = useState(null);
  const [selectedCommittee, setSelectedCommittee] = useState(committees[0]?.id ?? "");

  async function handleVerify(row) {
    setVerifying(row.id);
    const r = await verifyDrawAction(row.id);
    setVerifying(null);

    if (!r.ok) return toast.error(r.error.message);

    if (r.data.valid && r.data.winnerMatches) {
      toast.success(
        `Cycle ${row.cycleNumber} verified — ${r.data.recordedWinner} was drawn honestly.`,
        { description: "Seed matches its commitment and re-derives the same winner." }
      );
    } else {
      // If this ever fires on real data, it means the record was tampered with.
      toast.error(`Cycle ${row.cycleNumber} FAILED verification`, {
        description: r.data.reason,
      });
    }
  }

  const columns = [
    {
      key: "cycleNumber",
      header: "Cycle",
      className: "tabular",
      cell: (row) => `#${row.cycleNumber}`,
    },
    {
      key: "winnerName",
      header: "Winner",
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Trophy className="text-warning size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.winnerName}</p>
            <p className="text-muted-foreground truncate text-xs">{row.committeeName}</p>
          </div>
        </div>
      ),
    },
    {
      key: "payoutMinor",
      header: "Payout",
      className: "tabular font-medium",
      cell: (row) => row.payoutDisplay,
    },
    {
      key: "drawnAt",
      header: "Drawn",
      cell: (row) =>
        new Date(row.drawnAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
    },
    {
      key: "mode",
      header: "How",
      cell: (row) =>
        row.isOverride ? (
          <Badge variant="destructive" title={row.overrideReason ?? ""}>
            Override
          </Badge>
        ) : (
          <Badge variant="secondary">{row.mode.toLowerCase()}</Badge>
        ),
    },
    {
      key: "verify",
      header: "Proof",
      headClassName: "w-28",
      cell: (row) => (
        // Verification is offered to everyone who can see the draw, not buried in an
        // admin menu. A member who suspects a fix should be one click from checking.
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleVerify(row)}
          disabled={verifying === row.id}
        >
          {verifying === row.id ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          Verify
        </Button>
      ),
    },
  ];

  const empty = (
    <EmptyState
      icon={Dices}
      title="No draws yet"
      description="When a cycle is fully collected, draw a winner. Every draw commits to a hashed seed beforehand and reveals it after, so anyone can check it was fair."
      action={
        can.run && committees.length > 0 ? (
          <Button
            onClick={() => setDrawing(committees.find((c) => c.id === selectedCommittee))}
          >
            <Dices className="size-4" />
            Run the first draw
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
        searchable={false}
        empty={empty}
        toolbar={
          can.run && committees.length > 0 ? (
            <div className="ml-auto flex items-center gap-2">
              <Select value={selectedCommittee} onValueChange={setSelectedCommittee}>
                <SelectTrigger className="w-52" aria-label="Committee to draw">
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

              <Button
                onClick={() => setDrawing(committees.find((c) => c.id === selectedCommittee))}
                disabled={!selectedCommittee}
              >
                <Dices className="size-4" />
                Run draw
              </Button>
            </div>
          ) : null
        }
      />

      <DrawDialog
        committee={drawing}
        open={Boolean(drawing)}
        onOpenChange={(o) => !o && setDrawing(null)}
        canOverride={can.override}
      />
    </>
  );
}
