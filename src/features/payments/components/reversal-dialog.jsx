"use client";

import { FormDialog } from "@/components/common/form-dialog";
import { Field } from "@/components/common/form-field";
import { reversalSchema } from "../schema";
import { reversePaymentAction } from "../actions";

/**
 * Reverse a payment.
 *
 * A reason is mandatory, not politeness: reversing money needs a why that outlives
 * whoever did it. It goes into the audit trail and onto the reversal row itself.
 */
export function ReversalDialog({ payment, open, onOpenChange }) {
  if (!payment) return null;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reverse payment"
      description={`This appends an equal-and-opposite entry of ${payment.amountDisplay} for ${payment.memberName}, cycle #${payment.cycleNumber}. The original stays on record — nothing is deleted.`}
      schema={reversalSchema}
      defaultValues={{ paymentId: payment.id, reason: "" }}
      submitLabel="Reverse payment"
      successMessage="Payment reversed."
      onSubmit={reversePaymentAction}
    >
      {(form) => (
        <Field
          form={form}
          name="reason"
          label="Reason"
          placeholder="Cheque bounced / recorded against the wrong member / duplicate entry"
          multiline
          rows={3}
          required
          hint="Recorded permanently in the audit trail."
        />
      )}
    </FormDialog>
  );
}
