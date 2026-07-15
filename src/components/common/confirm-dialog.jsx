"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Confirmation for a destructive action.
 *
 * `onConfirm` returns our Result shape, so this handles the failure path itself
 * rather than every caller re-implementing "show the error, keep the dialog open".
 * The dialog stays open on failure — closing it would hide the reason.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  onSuccess,
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState(null);

  function handleConfirm(event) {
    // Prevent the default close-on-click: we close only once we know it worked.
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await onConfirm();

      if (result && result.ok === false) {
        setError(result.error.message);
        return;
      }

      toast.success(`${title} — done.`);
      onOpenChange(false);
      onSuccess?.(result?.data);
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-pretty">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {error && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className={cn(
              destructive &&
                buttonVariants({ variant: "destructive" })
            )}
          >
            {isPending && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
