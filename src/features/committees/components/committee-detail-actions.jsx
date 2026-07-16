"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { CommitteeFormDialog } from "./committee-form-dialog";
import { deleteCommitteeAction } from "../actions";

/**
 * Edit / Delete for the committee detail page.
 *
 * Takes the FULL committee DTO (from committees/service.getCommittee), not the
 * trimmed shape the Seats panel uses — the edit form needs every field
 * toCommitteeFormValues reads, and a partial object would just render as a form
 * full of blanks.
 */
export function CommitteeDetailActions({ committee, canDelete }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
          Edit
        </Button>
        {canDelete && (
          <Button variant="outline" size="sm" onClick={() => setDeleting(true)}>
            <Trash2 className="size-4" />
            Delete
          </Button>
        )}
      </div>

      <CommitteeFormDialog open={editing} onOpenChange={setEditing} committee={committee} />

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete committee"
        description={`“${committee.name}” will be archived and marked cancelled. This is refused if any draws have already run — that history can't be erased.`}
        confirmLabel="Delete"
        onConfirm={() => deleteCommitteeAction(committee.id)}
        onSuccess={() => router.push("/committees")}
      />
    </>
  );
}
