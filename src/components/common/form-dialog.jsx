"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Create/edit dialog.
 *
 * Owns the parts every form otherwise re-implements: Zod validation, pending
 * state, mapping server-side field errors back onto inputs, toasts, and resetting
 * on close.
 *
 * Children is a render prop receiving the react-hook-form instance, so each
 * feature only writes its own fields.
 *
 * `onSubmit` returns our Result shape. Field-level errors from the server land on
 * the right input; anything else shows as a form-level message. The server is the
 * authority — client validation is only there to fail faster.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  schema,
  defaultValues,
  onSubmit,
  onSuccess,
  submitLabel = "Save",
  successMessage,
  children,
  className,
}) {
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // Re-seed when the dialog opens: reusing one dialog for "edit A" then "edit B"
  // would otherwise show A's values.
  useEffect(() => {
    if (open) {
      form.reset(defaultValues);
      setFormError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleSubmit(values) {
    setFormError(null);

    startTransition(async () => {
      const result = await onSubmit(values);

      if (!result.ok) {
        const fields = result.error.details?.fields;

        if (fields) {
          // Put each server error on its own input rather than dumping a wall of
          // text at the top of the form.
          for (const [name, messages] of Object.entries(fields)) {
            form.setError(name, {
              type: "server",
              message: Array.isArray(messages) ? messages[0] : String(messages),
            });
          }
          setFormError("Please fix the highlighted fields.");
        } else {
          setFormError(result.error.message);
        }
        return;
      }

      toast.success(successMessage ?? `${title} — saved.`);
      onOpenChange(false);
      onSuccess?.(result.data);
    });
  }

  return (
    <Dialog open={open} onOpenChange={isPending ? undefined : onOpenChange}>
      <DialogContent className={className}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-pretty">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4" noValidate>
          {formError && (
            <div
              role="alert"
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid gap-4">{children(form)}</div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="size-4 animate-spin" />}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
