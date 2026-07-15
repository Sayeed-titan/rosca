import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Loading placeholder for a table route.
 *
 * Mirrors the real table's shape (toolbar + header + rows) so the page doesn't
 * jump when data lands. A spinner would be less work and worse — it tells the user
 * nothing about what's coming.
 */
export function TableSkeleton({ columns = 5, rows = 8 }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      <Card className="glass rounded-xl border-0 p-4">
        <Skeleton className="mb-4 h-9 w-64" />

        <div className="space-y-3">
          <div className="flex gap-4">
            {Array.from({ length: columns }).map((_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>

          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex gap-4">
              {Array.from({ length: columns }).map((_, c) => (
                <Skeleton key={c} className="h-9 flex-1" />
              ))}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
