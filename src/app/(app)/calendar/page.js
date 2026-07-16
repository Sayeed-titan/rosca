import { requireOrgActor } from "@/core/auth/session";
import { can } from "@/core/auth/rbac";
import { Permission } from "@/core/auth/permissions";
import { forOrganization } from "@/core/db/tenant";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/forbidden-state";
import { getCalendarEvents } from "@/features/calendar/service";
import { CalendarView } from "@/features/calendar/components/calendar-view";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const actor = await requireOrgActor();

  if (!can(actor, Permission.COMMITTEE_VIEW)) {
    return <ForbiddenState />;
  }

  const db = forOrganization(actor.organizationId);

  // A generous window either side of today: enough to page back through recent
  // history and forward through the rest of every committee's life, without
  // computing events for years nobody will look at.
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear() + 3, 11, 31));

  const events = await getCalendarEvents(db, { from, to });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Payment due dates and draw days across your committees — computed from each committee's schedule, so changing a draw day moves every future date with it."
      />

      <CalendarView
        events={events}
        initialYear={now.getUTCFullYear()}
        initialMonth={now.getUTCMonth()}
      />
    </div>
  );
}
