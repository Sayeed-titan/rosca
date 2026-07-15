"use client";

import { FormDialog } from "@/components/common/form-dialog";
import { Field, SelectField } from "@/components/common/form-field";
import {
  committeeSchema,
  committeeUpdateSchema,
  CURRENCIES,
  COMMITTEE_STATUSES,
  DRAW_FREQUENCIES,
  LATE_FEE_TYPES,
} from "../schema";
import { toCommitteeFormValues } from "../dto";
import { createCommitteeAction, updateCommitteeAction } from "../actions";

const title = (s) => s.charAt(0) + s.slice(1).toLowerCase();

const BLANK = {
  name: "",
  description: "",
  contribution: "",
  currency: "BDT",
  totalMembers: "10",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  drawFrequency: "MONTHLY",
  drawDay: "1",
  gracePeriodDays: "3",
  lateFeeType: "NONE",
  lateFeeFlat: "",
  lateFeePercent: "",
  status: "DRAFT",
};

export function CommitteeFormDialog({ open, onOpenChange, committee }) {
  const isEdit = Boolean(committee);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit committee" : "New committee"}
      description={
        isEdit
          ? "Update this committee's terms."
          : "Set the contribution, the roster size and how often you draw. Everyone contributes each cycle; one member takes the pot."
      }
      schema={isEdit ? committeeUpdateSchema : committeeSchema}
      defaultValues={
        isEdit ? { ...toCommitteeFormValues(committee), id: committee.id } : BLANK
      }
      submitLabel={isEdit ? "Save changes" : "Create committee"}
      successMessage={isEdit ? "Committee updated." : "Committee created."}
      onSubmit={isEdit ? updateCommitteeAction : createCommitteeAction}
      className="sm:max-w-2xl"
    >
      {(form) => {
        const lateFeeType = form.watch("lateFeeType");
        const frequency = form.watch("drawFrequency");

        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              form={form}
              name="name"
              label="Committee name"
              placeholder="Mirpur Monthly Committee"
              required
              className="sm:col-span-2"
            />

            <Field
              form={form}
              name="description"
              label="Description"
              placeholder="Eight neighbours, one payout a month."
              multiline
              rows={2}
              className="sm:col-span-2"
            />

            <Field
              form={form}
              name="contribution"
              label="Amount per member, per cycle"
              placeholder="5000"
              required
              hint="Exact amount — e.g. 5000 or 5000.50"
              inputMode="decimal"
            />

            <SelectField
              form={form}
              name="currency"
              label="Currency"
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
              required
            />

            <Field
              form={form}
              name="totalMembers"
              label="Total members"
              type="number"
              min={2}
              max={200}
              required
              hint="Also the number of cycles — each member wins once"
            />

            <SelectField
              form={form}
              name="status"
              label="Status"
              options={COMMITTEE_STATUSES.map((s) => ({ value: s, label: title(s) }))}
              required
            />

            <Field form={form} name="startDate" label="Start date" type="date" required />
            <Field
              form={form}
              name="endDate"
              label="End date"
              type="date"
              hint="Optional"
            />

            <SelectField
              form={form}
              name="drawFrequency"
              label="Draw frequency"
              options={DRAW_FREQUENCIES.map((f) => ({ value: f, label: title(f) }))}
              required
            />

            <Field
              form={form}
              name="drawDay"
              label={frequency === "WEEKLY" ? "Draw day (1=Mon … 7=Sun)" : "Draw day of month"}
              type="number"
              min={1}
              max={frequency === "WEEKLY" ? 7 : 31}
              required
            />

            <Field
              form={form}
              name="gracePeriodDays"
              label="Grace period (days)"
              type="number"
              min={0}
              max={60}
              hint="Days after the due date before a payment counts as late"
            />

            <SelectField
              form={form}
              name="lateFeeType"
              label="Late fee"
              options={LATE_FEE_TYPES.map((t) => ({
                value: t,
                label: t === "NONE" ? "None" : t === "FLAT" ? "Flat amount" : "Percentage",
              }))}
            />

            {/* Only ask for the figure that's actually in play. */}
            {lateFeeType === "FLAT" && (
              <Field
                form={form}
                name="lateFeeFlat"
                label="Flat late fee"
                placeholder="100"
                inputMode="decimal"
                required
              />
            )}

            {lateFeeType === "PERCENT" && (
              <Field
                form={form}
                name="lateFeePercent"
                label="Late fee %"
                placeholder="2.5"
                inputMode="decimal"
                hint="Percent of the contribution"
                required
              />
            )}
          </div>
        );
      }}
    </FormDialog>
  );
}
