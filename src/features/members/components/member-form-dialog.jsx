"use client";

import { FormDialog } from "@/components/common/form-dialog";
import { Field, SelectField } from "@/components/common/form-field";
import { memberSchema, memberUpdateSchema } from "../schema";
import { toMemberFormValues } from "../dto";
import { createMemberAction, updateMemberAction } from "../actions";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "SUSPENDED", label: "Suspended" },
];

const BLANK = {
  fullName: "",
  phone: "",
  email: "",
  nationalId: "",
  address: "",
  occupation: "",
  emergencyContact: "",
  photoUrl: "",
  notes: "",
  status: "ACTIVE",
  joiningDate: new Date().toISOString().slice(0, 10),
};

/**
 * Create/edit member.
 *
 * One dialog for both: the fields and rules are identical, and two nearly-identical
 * components would drift apart the first time a field is added to only one of them.
 */
export function MemberFormDialog({ open, onOpenChange, member, onSuccess }) {
  const isEdit = Boolean(member);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit member" : "Add member"}
      description={
        isEdit
          ? "Update this member's details."
          : "Add someone to your organization. They can join committees afterwards."
      }
      schema={isEdit ? memberUpdateSchema : memberSchema}
      defaultValues={isEdit ? { ...toMemberFormValues(member), id: member.id } : BLANK}
      submitLabel={isEdit ? "Save changes" : "Add member"}
      successMessage={isEdit ? "Member updated." : "Member added."}
      onSubmit={isEdit ? updateMemberAction : createMemberAction}
      onSuccess={onSuccess}
      className="sm:max-w-lg"
    >
      {(form) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              form={form}
              name="fullName"
              label="Full name"
              placeholder="Rahima Akter"
              required
              className="sm:col-span-2"
            />
            <Field
              form={form}
              name="phone"
              label="Phone"
              type="tel"
              placeholder="+8801711000000"
              required
            />
            <Field
              form={form}
              name="email"
              label="Email"
              type="email"
              placeholder="rahima@example.com"
            />
            <Field
              form={form}
              name="nationalId"
              label="National ID"
              placeholder="1990111000001"
              hint="Must be unique within your organization"
            />
            <Field
              form={form}
              name="occupation"
              label="Occupation"
              placeholder="Tailor"
            />
            <Field
              form={form}
              name="emergencyContact"
              label="Emergency contact"
              placeholder="+8801711000099"
            />
            <Field form={form} name="joiningDate" label="Joining date" type="date" />
            <SelectField
              form={form}
              name="status"
              label="Status"
              options={STATUS_OPTIONS}
              required
            />
            <Field
              form={form}
              name="address"
              label="Address"
              placeholder="Mirpur, Dhaka"
              multiline
              rows={2}
              className="sm:col-span-2"
            />
          </div>
        </>
      )}
    </FormDialog>
  );
}
