"use client";

import { FormDialog } from "@/components/common/form-dialog";
import { Field } from "@/components/common/form-field";
import { renameOrganizationSchema } from "../schema";
import { renameOrganizationAction } from "../actions";

export function OrganizationNameDialog({ open, onOpenChange, currentName }) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Rename organization"
      description="This is the name shown across the whole app, for everyone in it."
      schema={renameOrganizationSchema}
      defaultValues={{ name: currentName ?? "" }}
      submitLabel="Save"
      successMessage="Organization renamed."
      onSubmit={renameOrganizationAction}
    >
      {(form) => (
        <Field
          form={form}
          name="name"
          label="Organization name"
          placeholder="Your organization's name"
          required
        />
      )}
    </FormDialog>
  );
}
