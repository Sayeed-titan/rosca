"use client";

import { useState } from "react";
import { ScrollText, Eye } from "lucide-react";

import { DataTable } from "@/components/common/data-table";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTableParams } from "@/hooks/use-table-params";

/** Verb-object codes are precise but unreadable; these are for humans. */
const ACTION_LABEL = {
  "auth.login": "Signed in",
  "auth.login_failed": "Failed sign-in",
  "auth.logout": "Signed out",
  "auth.signup": "Created organization",
  "member.create": "Added member",
  "member.update": "Updated member",
  "member.delete": "Removed member",
  "member.payment_account_save": "Saved payment account",
  "member.payment_account_remove": "Removed payment account",
  "committee.create": "Created committee",
  "committee.update": "Updated committee",
  "committee.delete": "Deleted committee",
  "committee.assign_member": "Changed seats",
  "payment.create": "Recorded payment",
  "payment.bulk_create": "Recorded payment batch",
  "payment.reverse": "Reversed payment",
  "draw.run": "Ran draw",
  "draw.override": "Overrode draw",
  "settings.update": "Updated settings",
  "org.update": "Updated organization",
  "org.member_role_change": "Changed a role",
};

/** The events worth calling out — money moved, or a rule was waived. */
const TONE = {
  "draw.override": "destructive",
  "payment.reverse": "destructive",
  "auth.login_failed": "destructive",
  "payment.create": "secondary",
  "payment.bulk_create": "secondary",
  "draw.run": "secondary",
};

const FILTERS = [
  { value: "ALL", label: "All activity" },
  { value: "payment", label: "Payments" },
  { value: "draw", label: "Draws" },
  { value: "committee", label: "Committees" },
  { value: "member", label: "Members" },
  { value: "auth", label: "Sign-ins" },
  { value: "org", label: "Organization" },
  { value: "settings", label: "Settings" },
];

function formatWhen(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditTable({ rows, total, pageSize, actors, filters }) {
  const { q, push } = useTableParams();
  const [detail, setDetail] = useState(null);

  const columns = [
    {
      key: "createdAt",
      header: "When",
      cell: (row) => (
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          {formatWhen(row.createdAt)}
        </span>
      ),
    },
    {
      key: "actorName",
      header: "Who",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.actorName}</p>
          {row.actorEmail && row.actorEmail !== row.actorName && (
            <p className="text-muted-foreground truncate text-xs">{row.actorEmail}</p>
          )}
        </div>
      ),
    },
    {
      key: "action",
      header: "What",
      cell: (row) => (
        <Badge variant={TONE[row.action] ?? "outline"}>
          {ACTION_LABEL[row.action] ?? row.action}
        </Badge>
      ),
    },
    {
      key: "entityType",
      header: "Record",
      cell: (row) =>
        row.entityType ? (
          <span className="text-muted-foreground text-xs">
            {row.entityType}
            {row.entityId && (
              <span className="ml-1 font-mono opacity-60">
                {row.entityId.slice(0, 8)}…
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: "detail",
      header: <span className="sr-only">Detail</span>,
      headClassName: "w-12",
      cell: (row) =>
        row.before || row.after ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="View change detail"
            onClick={() => setDetail(row)}
          >
            <Eye className="size-4" />
          </Button>
        ) : null,
    },
  ];

  const empty = (
    <EmptyState
      icon={ScrollText}
      title={q ? "Nothing matches that search" : "No activity recorded yet"}
      description={
        q
          ? `Nothing found for “${q}”.`
          : "Every sign-in, payment, committee change and draw is recorded here automatically."
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
        searchPlaceholder="Search action, record or person…"
        empty={empty}
        toolbar={
          <div className="ml-auto flex items-center gap-2">
            <Select
              value={filters.action}
              onValueChange={(v) => push({ action: v === "ALL" ? "" : v, page: 1 })}
            >
              <SelectTrigger className="w-40" aria-label="Filter by activity type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {actors.length > 0 && (
              <Select
                value={filters.actorUserId}
                onValueChange={(v) => push({ actor: v === "ALL" ? "" : v, page: 1 })}
              >
                <SelectTrigger className="w-44" aria-label="Filter by person">
                  <SelectValue placeholder="Anyone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Anyone</SelectItem>
                  {actors.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        }
      />

      <Dialog open={Boolean(detail)} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail ? (ACTION_LABEL[detail.action] ?? detail.action) : ""}
            </DialogTitle>
            <DialogDescription>
              {detail && (
                <>
                  {detail.actorName} · {formatWhen(detail.createdAt)}
                  {detail.ipAddress && ` · ${detail.ipAddress}`}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ChangePanel title="Before" value={detail.before} />
              <ChangePanel title="After" value={detail.after} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChangePanel({ title, value }) {
  return (
    <div className="space-y-1.5">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {title}
      </p>
      {value ? (
        <pre className="bg-muted max-h-64 overflow-auto rounded-lg p-3 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <p className="text-muted-foreground bg-muted rounded-lg p-3 text-xs">—</p>
      )}
    </div>
  );
}
