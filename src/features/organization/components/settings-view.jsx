"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Building2, Users, Loader2, Palette, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, SelectField } from "@/components/common/form-field";
import { CURRENCIES } from "@/features/committees/schema";
import {
  organizationSettingsSchema,
  TIMEZONES,
  ORG_ROLES,
} from "../settings-schema";
import {
  updateOrganizationSettingsAction,
  changeMemberRoleAction,
} from "../settings-actions";

const ROLE_LABEL = { ORG_OWNER: "Owner", MANAGER: "Manager", MEMBER: "Member" };
const ROLE_HINT = {
  ORG_OWNER: "Full control, including overrides and roles",
  MANAGER: "Day-to-day operations; cannot override draws or change roles",
  MEMBER: "Read-only access to their own data",
};

function SectionCard({ icon: Icon, title, description, children }) {
  return (
    <Card className="glass rounded-xl border-0 p-5">
      <div className="mb-4 flex items-start gap-2.5">
        <div className="bg-muted mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg">
          <Icon className="size-4" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {description && (
            <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
              {description}
            </p>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
}

function OrganizationSection({ settings, canEdit }) {
  const [isPending, startTransition] = useTransition();

  const form = useForm({
    resolver: zodResolver(organizationSettingsSchema),
    defaultValues: {
      name: settings.name,
      currency: settings.currency,
      timezone: settings.timezone,
    },
  });

  function onSubmit(values) {
    startTransition(async () => {
      const r = await updateOrganizationSettingsAction(values);
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Settings saved.");
    });
  }

  return (
    <SectionCard
      icon={Building2}
      title="Organization"
      description="Shown across the app, for everyone in it."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            form={form}
            name="name"
            label="Name"
            required
            disabled={!canEdit}
            className="sm:col-span-2"
          />
          <SelectField
            form={form}
            name="currency"
            label="Default currency"
            options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            hint="New committees start with this; each can override it."
          />
          <SelectField
            form={form}
            name="timezone"
            label="Timezone"
            options={TIMEZONES.map((t) => ({ value: t, label: t.replace("_", " ") }))}
            hint="Used for due dates and draw days."
          />
        </div>

        {canEdit && (
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            Save changes
          </Button>
        )}
      </form>
    </SectionCard>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <SectionCard
      icon={Palette}
      title="Appearance"
      description="Applies to your account on this device."
    >
      <div className="max-w-xs space-y-2">
        <label htmlFor="theme" className="text-sm font-medium">
          Theme
        </label>
        <Select value={theme ?? "system"} onValueChange={setTheme}>
          <SelectTrigger id="theme" className="w-full" aria-label="Theme">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="system">Match my system</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </SectionCard>
  );
}

function TeamSection({ team, canManage, currentUserId }) {
  const [savingId, setSavingId] = useState(null);

  async function handleRoleChange(membershipId, role) {
    setSavingId(membershipId);
    const r = await changeMemberRoleAction({ membershipId, role });
    setSavingId(null);

    if (!r.ok) {
      toast.error(r.error.message);
      return;
    }
    toast.success("Role updated.");
  }

  return (
    <SectionCard
      icon={Users}
      title="Team"
      description="People who can sign in to this organization. Not the same as committee members — most of those never log in."
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Person</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Can do</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {team.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {m.name}
                      {m.userId === currentUserId && (
                        <Badge variant="outline" className="text-[10px]">
                          You
                        </Badge>
                      )}
                      {m.isSuperAdmin && (
                        <Badge variant="secondary" className="gap-1 text-[10px]">
                          <ShieldCheck className="size-2.5" />
                          Super admin
                        </Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{m.email}</p>
                  </div>
                </TableCell>

                <TableCell>
                  {canManage && m.userId !== currentUserId ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) => handleRoleChange(m.id, v)}
                      disabled={savingId === m.id}
                    >
                      <SelectTrigger
                        size="sm"
                        className="w-32"
                        aria-label={`Role for ${m.name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ORG_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant={m.role === "ORG_OWNER" ? "secondary" : "outline"}>
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  )}
                </TableCell>

                <TableCell>
                  <span className="text-muted-foreground text-xs">
                    {ROLE_HINT[m.role]}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canManage && (
        <p className="text-muted-foreground mt-3 text-xs">
          You can&apos;t change your own role — ask another owner. The last owner
          can&apos;t be demoted, or nobody could manage the organization.
        </p>
      )}
    </SectionCard>
  );
}

export function SettingsView({ settings, team, can, currentUserId }) {
  return (
    <div className="space-y-4">
      <OrganizationSection settings={settings} canEdit={can.updateOrg} />
      <TeamSection team={team} canManage={can.manageMembers} currentUserId={currentUserId} />
      <AppearanceSection />
    </div>
  );
}
