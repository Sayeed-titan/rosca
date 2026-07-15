import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * One dashboard metric.
 *
 * Server Component — it renders a value the server already computed, so there's no
 * reason to ship it to the browser.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "default",
  className,
}) {
  const toneStyles = {
    default: "text-foreground",
    brand: "text-brand-1",
    success: "text-success",
    warning: "text-warning",
    muted: "text-muted-foreground",
  };

  return (
    <Card className={cn("glass gap-0 rounded-xl border-0 p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
          {label}
        </p>
        {Icon && (
          <Icon
            className="text-muted-foreground/70 size-4 shrink-0"
            aria-hidden="true"
          />
        )}
      </div>

      {/* tabular = tabular-nums, so money columns line up and digits don't jitter. */}
      <p
        className={cn(
          "tabular mt-2 text-2xl font-semibold tracking-tight",
          toneStyles[tone]
        )}
      >
        {value}
      </p>

      {hint && (
        <p className="text-muted-foreground mt-1 text-xs text-pretty">{hint}</p>
      )}
    </Card>
  );
}
