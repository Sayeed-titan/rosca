"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "../actions";

const TYPE_DOT = {
  PAYMENT_DUE: "bg-warning",
  PAYMENT_LATE: "bg-destructive",
  WINNER_ANNOUNCED: "bg-brand-1",
  COMMITTEE_COMPLETED: "bg-brand-1",
  GENERIC: "bg-muted-foreground",
};

function formatWhen(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function NotificationBell({ notifications, unreadCount }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  function handleRead(id) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function handleReadAll() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon" />}
        aria-label={
          unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"
        }
        className="relative"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span
            className="bg-destructive absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] font-medium text-white"
            aria-hidden="true"
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-border/60 flex items-center justify-between border-b p-3">
          <p className="text-sm font-medium">Notifications</p>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={handleReadAll}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
            >
              <CheckCheck className="size-3" />
              Mark all read
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="p-8 text-center">
            <Bell className="text-muted-foreground/40 mx-auto size-6" aria-hidden="true" />
            <p className="text-muted-foreground mt-2 text-sm">Nothing yet</p>
            <p className="text-muted-foreground/70 mt-0.5 text-xs">
              Payment reminders and draw results will appear here.
            </p>
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => !n.isRead && handleRead(n.id)}
                  className={cn(
                    "hover:bg-muted/60 border-border/60 flex w-full gap-2.5 border-b p-3 text-left transition-colors last:border-0",
                    !n.isRead && "bg-primary/5"
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 size-1.5 shrink-0 rounded-full",
                      n.isRead ? "bg-transparent" : (TYPE_DOT[n.type] ?? "bg-muted-foreground")
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    <span className="text-muted-foreground mt-0.5 block text-xs text-pretty">
                      {n.body}
                    </span>
                    <span className="text-muted-foreground/70 mt-1 block text-[10px]">
                      {formatWhen(n.createdAt)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
