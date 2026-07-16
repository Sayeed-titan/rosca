"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Dices, Wallet } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  DONE: "bg-muted text-muted-foreground",
  READY: "bg-brand-1/15 text-brand-1",
  UPCOMING: "bg-muted text-foreground",
  OVERDUE: "bg-destructive/15 text-destructive",
  BLOCKED: "bg-warning/15 text-warning",
};

const STATUS_LABEL = {
  DONE: "Done",
  READY: "Ready",
  UPCOMING: "Upcoming",
  OVERDUE: "Overdue",
  BLOCKED: "Not collected",
};

/** Sunday-first grid covering the whole month, padded to full weeks. */
function buildMonthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = first.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(Date.UTC(year, month, d)));
  }
  // Pad the tail so the final row is a complete week.
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function CalendarView({ events, initialYear, initialMonth }) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const cells = useMemo(() => buildMonthGrid(year, month), [year, month]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const e of events) {
      const key = e.date.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [events]);

  const todayKey = new Date().toISOString().slice(0, 10);

  function shift(delta) {
    const next = new Date(Date.UTC(year, month + delta, 1));
    setYear(next.getUTCFullYear());
    setMonth(next.getUTCMonth());
  }

  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  // The list view is the useful one for planning; the grid is for orientation.
  const upcoming = events
    .filter((e) => new Date(e.date) >= new Date(todayKey))
    .slice(0, 8);

  return (
    <div className="space-y-4">
      <Card className="glass gap-0 rounded-xl border-0 p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-medium">{monthLabel}</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shift(-1)}
              aria-label="Previous month"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const now = new Date();
                setYear(now.getUTCFullYear());
                setMonth(now.getUTCMonth());
              }}
            >
              Today
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => shift(1)}
              aria-label="Next month"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px" role="grid">
          {WEEKDAYS.map((d) => (
            <div
              key={d}
              className="text-muted-foreground pb-2 text-center text-[10px] font-medium uppercase tracking-wide"
            >
              {d}
            </div>
          ))}

          {cells.map((date, i) => {
            if (!date) return <div key={`pad-${i}`} className="min-h-20" />;

            const key = date.toISOString().slice(0, 10);
            const dayEvents = eventsByDay.get(key) ?? [];
            const isToday = key === todayKey;

            return (
              <div
                key={key}
                className={cn(
                  "border-border/40 min-h-20 rounded-lg border p-1.5",
                  isToday && "border-brand-1/50 bg-brand-1/5"
                )}
              >
                <span
                  className={cn(
                    "tabular text-xs",
                    isToday ? "text-brand-1 font-semibold" : "text-muted-foreground"
                  )}
                >
                  {date.getUTCDate()}
                </span>

                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      title={`${e.committeeName} — ${e.title} · ${e.detail}`}
                      className={cn(
                        "flex items-center gap-1 truncate rounded px-1 py-0.5 text-[10px]",
                        STATUS_TONE[e.status]
                      )}
                    >
                      {e.type === "DRAW" ? (
                        <Dices className="size-2.5 shrink-0" aria-hidden="true" />
                      ) : (
                        <Wallet className="size-2.5 shrink-0" aria-hidden="true" />
                      )}
                      <span className="truncate">{e.title}</span>
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <p className="text-muted-foreground px-1 text-[10px]">
                      +{dayEvents.length - 2} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="glass rounded-xl border-0 p-5">
        <h2 className="mb-3 text-sm font-medium">What&apos;s next</h2>

        {upcoming.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            Nothing scheduled ahead. Add members to a committee to generate its
            payment schedule.
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {upcoming.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="bg-muted grid size-8 shrink-0 place-items-center rounded-lg">
                    {e.type === "DRAW" ? (
                      <Dices className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Wallet className="size-3.5" aria-hidden="true" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {e.committeeName} · {e.title}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">{e.detail}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">
                    {STATUS_LABEL[e.status]}
                  </Badge>
                  <span className="text-muted-foreground w-16 text-right text-xs">
                    {new Date(e.date).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
