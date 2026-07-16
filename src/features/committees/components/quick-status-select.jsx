"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMMITTEE_STATUSES } from "../schema";
import { setCommitteeStatusAction } from "../actions";

const LABEL = { DRAFT: "Draft", ACTIVE: "Active", COMPLETED: "Completed", CANCELLED: "Cancelled" };

// Coloured to match the Badge variants used elsewhere for the same statuses, so
// the pill doesn't change look the moment it becomes interactive.
const TONE = {
  ACTIVE: "border-transparent bg-secondary text-secondary-foreground",
  DRAFT: "border-border",
  COMPLETED: "border-transparent bg-secondary text-secondary-foreground",
  CANCELLED: "border-transparent bg-destructive text-white",
};

/**
 * One-click status change — Draft to Active, most commonly, which is what
 * actually unblocks a committee's first draw. A full edit-form round trip for a
 * single field was the friction; this is the direct fix.
 */
export function QuickStatusSelect({ committeeId, status, canEdit }) {
  const [isPending, startTransition] = useTransition();

  if (!canEdit) {
    return (
      <span
        className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE[status]}`}
      >
        {LABEL[status]}
      </span>
    );
  }

  function handleChange(next) {
    if (next === status) return;
    startTransition(async () => {
      const r = await setCommitteeStatusAction({ id: committeeId, status: next });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`Status set to ${LABEL[next]}.`);
    });
  }

  return (
    <Select value={status} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger
        size="sm"
        aria-label="Change committee status"
        className={`h-7 w-auto gap-1 rounded-full border px-2.5 text-xs font-medium ${TONE[status]}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {COMMITTEE_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
