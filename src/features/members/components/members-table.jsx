"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2, UserPlus, Users, KeyRound } from "lucide-react";

import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTableParams } from "@/hooks/use-table-params";
import { MemberFormDialog } from "./member-form-dialog";
import { deleteMemberAction } from "../actions";

const STATUS_VARIANT = {
  ACTIVE: "secondary",
  INACTIVE: "outline",
  SUSPENDED: "destructive",
};

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

/**
 * Members list.
 *
 * `can` is computed on the server and passed down. It only decides what to render —
 * the actions re-check permissions server-side regardless, so a user who forges
 * their way to a delete button still gets refused.
 */
export function MembersTable({ rows, total, pageSize, can }) {
  const { q } = useTableParams();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const columns = [
    {
      key: "fullName",
      header: "Member",
      sortable: true,
      cell: (row) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials(row.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate font-medium">{row.fullName}</p>
            {row.occupation && (
              <p className="text-muted-foreground truncate text-xs">{row.occupation}</p>
            )}
          </div>
          {row.hasPortalAccess && (
            <Tooltip>
              {/* Base UI composes with `render`, not Radix's `asChild`. Rendering a
                  span keeps this out of the tab order and avoids a nested button. */}
              <TooltipTrigger
                render={<span className="inline-flex shrink-0" />}
                aria-label="Has portal login"
              >
                <KeyRound className="text-muted-foreground size-3.5" />
              </TooltipTrigger>
              <TooltipContent>Can sign in to the member portal</TooltipContent>
            </Tooltip>
          )}
        </div>
      ),
    },
    {
      key: "phone",
      header: "Contact",
      cell: (row) => (
        <div className="min-w-0">
          <p className="tabular truncate text-sm">{row.phone}</p>
          {row.email && (
            <p className="text-muted-foreground truncate text-xs">{row.email}</p>
          )}
        </div>
      ),
    },
    {
      key: "committeeCount",
      header: "Committees",
      className: "tabular",
      cell: (row) => row.committeeCount || "—",
    },
    {
      key: "joiningDate",
      header: "Joined",
      sortable: true,
      cell: (row) =>
        row.joiningDate
          ? new Date(row.joiningDate).toLocaleDateString(undefined, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—",
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status] ?? "outline"}>
          {row.status.charAt(0) + row.status.slice(1).toLowerCase()}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      headClassName: "w-12",
      cell: (row) =>
        can.update || can.delete ? (
          <DropdownMenu>
            {/* `render`, not `asChild`: this shadcn style is built on Base UI, and
                the Radix idiom nests a <button> inside the trigger's own <button>,
                which fails hydration and silently kills every click on the page. */}
            <DropdownMenuTrigger
              render={<Button variant="ghost" size="icon" />}
              aria-label={`Actions for ${row.fullName}`}
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
                  Remove
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  // An empty database and an empty search result are different problems and get
  // different answers.
  const empty = q ? (
    <EmptyState
      icon={Users}
      title="No members match your search"
      description={`Nothing found for “${q}”. Try a name, phone number or National ID.`}
    />
  ) : (
    <EmptyState
      icon={Users}
      title="No members yet"
      description="Add the people who'll take part in your committees. You can assign them to a committee afterwards."
      action={
        can.create ? (
          <Button onClick={() => setCreating(true)}>
            <UserPlus className="size-4" />
            Add your first member
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
        searchPlaceholder="Search name, phone, email or NID…"
        empty={empty}
        toolbar={
          can.create ? (
            <Button className="ml-auto" onClick={() => setCreating(true)}>
              <UserPlus className="size-4" />
              Add member
            </Button>
          ) : null
        }
      />

      <MemberFormDialog open={creating} onOpenChange={setCreating} />

      <MemberFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        member={editing}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Remove member"
        description={
          deleting
            ? `${deleting.fullName} will be archived, not erased. Their payment and draw history stays intact — removing it would break the committee's books.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={() => deleteMemberAction(deleting.id)}
      />
    </>
  );
}
