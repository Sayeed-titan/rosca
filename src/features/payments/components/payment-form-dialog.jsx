"use client";

import { useEffect, useMemo } from "react";
import { TriangleAlert } from "lucide-react";

import { FormDialog } from "@/components/common/form-dialog";
import { Field, SelectField } from "@/components/common/form-field";
import { paymentSchema, PAYMENT_METHODS } from "../schema";
import { recordPaymentAction } from "../actions";

const METHOD_LABEL = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  CARD: "Card",
  OTHER: "Other",
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Record a payment.
 *
 * `committees` carries each committee's seats and suggested cycle, so the member
 * dropdown can cascade off the committee without a round trip.
 */
export function PaymentFormDialog({ open, onOpenChange, committees }) {
  const blank = {
    committeeId: committees[0]?.id ?? "",
    committeeMemberId: "",
    cycleNumber: String(committees[0]?.suggestedCycle ?? 1),
    amount: committees[0]?.contribution ?? "",
    paidAt: today(),
    method: "CASH",
    referenceNumber: "",
    notes: "",
    lateFeeOverride: "",
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record payment"
      description="Payments are append-only. A mistake is corrected with a reversal, never an edit — so take a moment."
      schema={paymentSchema}
      defaultValues={blank}
      submitLabel="Record payment"
      successMessage="Payment recorded."
      onSubmit={recordPaymentAction}
      className="sm:max-w-lg"
    >
      {(form) => <PaymentFields form={form} committees={committees} />}
    </FormDialog>
  );
}

function PaymentFields({ form, committees }) {
  const committeeId = form.watch("committeeId");

  const committee = useMemo(
    () => committees.find((c) => c.id === committeeId),
    [committees, committeeId]
  );

  // Switching committee must reset the member: a seat from the old committee would
  // be rejected server-side anyway, but silently keeping it is a confusing way to
  // find that out.
  useEffect(() => {
    if (!committee) return;
    const current = form.getValues("committeeMemberId");
    const stillValid = committee.seats.some((s) => s.id === current);
    if (!stillValid) form.setValue("committeeMemberId", "");
    form.setValue("amount", committee.contribution);
    form.setValue("cycleNumber", String(committee.suggestedCycle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [committeeId]);

  const seats = committee?.seats ?? [];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField
        form={form}
        name="committeeId"
        label="Committee"
        options={committees.map((c) => ({ value: c.id, label: c.name }))}
        required
        className="sm:col-span-2"
      />

      <SelectField
        form={form}
        name="committeeMemberId"
        label="Member"
        placeholder={seats.length ? "Choose a member" : "No members assigned"}
        options={seats.map((s) => ({
          value: s.id,
          label: `#${s.position} · ${s.memberName}`,
        }))}
        required
        className="sm:col-span-2"
      />

      {seats.length === 0 && committee && (
        <p className="text-muted-foreground -mt-2 flex items-start gap-1.5 text-xs sm:col-span-2">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          No members are assigned to “{committee.name}” yet. Assign some from the
          committee first.
        </p>
      )}

      <Field
        form={form}
        name="cycleNumber"
        label="Cycle"
        type="number"
        min={1}
        max={committee?.totalSeats ?? 200}
        required
        hint={committee ? `1–${committee.totalSeats}` : undefined}
      />

      <Field
        form={form}
        name="amount"
        label="Amount"
        inputMode="decimal"
        required
        hint={committee ? `Expected ${committee.contributionDisplay}` : undefined}
      />

      <Field form={form} name="paidAt" label="Payment date" type="date" required />

      <SelectField
        form={form}
        name="method"
        label="Method"
        options={PAYMENT_METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))}
        required
      />

      <Field
        form={form}
        name="referenceNumber"
        label="Reference"
        placeholder="bKash TrxID, cheque no…"
        className="sm:col-span-2"
      />

      <Field
        form={form}
        name="lateFeeOverride"
        label="Late fee override"
        inputMode="decimal"
        placeholder="Leave blank to use the committee's rule"
        hint="Only fill this in to waive or adjust the calculated fee. It's audited."
        className="sm:col-span-2"
      />

      <Field
        form={form}
        name="notes"
        label="Notes"
        multiline
        rows={2}
        className="sm:col-span-2"
      />
    </div>
  );
}
