"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Landmark, MoreHorizontal, Pencil, Plus, Trash2, Users } from "lucide-react";

import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTableParams } from "@/hooks/use-table-params";
import { CommitteeFormDialog } from "./committee-form-dialog";
import { QuickStatusSelect } from "./quick-status-select";
import { deleteCommitteeAction } from "../actions";
import { setCurrentCommitteeAction } from "../switcher/actions";

const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();

export function CommitteesTable({ rows, total, pageSize, can }) {
  const { q } = useTableParams();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const columns = [
    {
      key: "name",
      header: "Committee",
      sortable: true,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {title(row.drawFrequency)} · draw day {row.drawDay}
          </p>
        </div>
      ),
    },
    {
      key: "contributionMinor",
      header: "Per member",
      className: "tabular",
      cell: (row) => row.contributionDisplay,
    },
    {
      key: "potMinor",
      header: "Pot / cycle",
      className: "tabular font-medium",
      cell: (row) => row.potDisplay,
    },
    {
      key: "memberCount",
      header: "Members",
      cell: (row) => (
        <div className="flex items-center gap-1.5">
          <Users className="text-muted-foreground size-3.5" aria-hidden="true" />
          <span className="tabular">
            {row.memberCount}/{row.totalSeats}
          </span>
          {row.seatsOpen > 0 && (
            <span className="text-muted-foreground text-xs">
              ({row.seatsOpen} open)
            </span>
          )}
        </div>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      cell: (row) => (
        <span className="tabular text-sm">
          {row.drawsRun}/{row.cyclesTotal}
          <span className="text-muted-foreground ml-1 text-xs">draws</span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) => (
        // Stops the row's own onRowClick (navigate to detail) from firing when
        // someone's just trying to flip the status right here in the list.
        <div onClick={(e) => e.stopPropagation()}>
          <QuickStatusSelect
            committeeId={row.id}
            status={row.status}
            canEdit={can.update}
          />
        </div>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headClassName: "w-12",
      cell: (row) =>
        can.update || can.delete ? (
          <DropdownMenu>
            {/* Base UI composes via `render`; Radix's `asChild` would nest buttons. */}
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" />}
              aria-label={`Actions for ${row.name}`}
            >
              <MoreHorizontal className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {can.update && (
                <DropdownMenuItem onClick={() => setEditing(row)}>
                  <Pencil className="size-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {can.delete && (
                <DropdownMenuItem variant="destructive" onClick={() => setDeleting(row)}>
                  <Trash2 className="size-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const empty = q ? (
    <EmptyState
      icon={Landmark}
      title="No committees match your search"
      description={`Nothing found for “${q}”.`}
    />
  ) : (
    <EmptyState
      icon={Landmark}
      title="No committees yet"
      description="A committee collects a fixed amount from each member every cycle and pays the whole pot to one of them, until everyone has had a turn."
      action={
        can.create ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Create your first committee
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
        searchPlaceholder="Search committees…"
        empty={empty}
        // The row is the way into the roster — that's where seats get assigned.
        onRowClick={(row) => {
          // Opening a committee also makes it the org-wide selection, so
          // Dashboard/Payments/Draws already show it when you navigate there.
          setCurrentCommitteeAction(row.id);
          router.push(`/committees/${row.id}`);
        }}
        toolbar={
          can.create ? (
            <Button className="ml-auto" onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              New committee
            </Button>
          ) : null
        }
      />

      <CommitteeFormDialog open={creating} onOpenChange={setCreating} />

      <CommitteeFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        committee={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Delete committee"
        description={
          deleting
            ? `“${deleting.name}” will be archived and marked cancelled. Its payment history is kept. If any draws have already run, this will be refused — that history can't be erased.`
            : ""
        }
        confirmLabel="Delete"
        onConfirm={() => deleteCommitteeAction(deleting.id)}
      />
    </>
  );
}
