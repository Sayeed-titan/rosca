import { cn } from "@/lib/utils";

/**
 * The empty state.
 *
 * Two genuinely different situations, and conflating them is a classic UX bug:
 *  - nothing exists yet  -> offer the action that creates the first one
 *  - a filter matched nothing -> offer to clear the filter
 * "No results" for an empty database is confusing; "Add your first member" when a
 * search matched nothing is worse. Callers pass whichever applies.
 */
export function EmptyState({ icon: Icon, title, description, action, className }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className
      )}
    >
      {Icon && (
        <div className="bg-muted mb-4 grid size-12 place-items-center rounded-xl">
          <Icon className="text-muted-foreground size-5" aria-hidden="true" />
        </div>
      )}
      <p className="font-medium">{title}</p>
      {description && (
        <p className="text-muted-foreground mt-1 max-w-sm text-sm text-pretty">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
