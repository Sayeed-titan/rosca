import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import {
  getOrganizationSettings,
  listTeam,
} from "@/features/organization/settings-service";
import { SettingsView } from "@/features/organization/components/settings-view";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.SETTINGS_VIEW)) {
    return <ForbiddenState />;
  }

  const db = forOrganization(actor.organizationId);
  const [settings, team] = await Promise.all([
    getOrganizationSettings(db, actor.organizationId),
    listTeam(db),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Your organization's details, who can sign in, and how the app looks."
      />

      <SettingsView
        settings={settings}
        team={team}
        currentUserId={actor.userId}
        can={{
          updateOrg: can(actor, Permission.ORG_UPDATE),
          manageMembers: can(actor, Permission.ORG_MANAGE_MEMBERS),
        }}
      />
    </div>
  );
}
