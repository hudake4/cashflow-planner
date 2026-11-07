"use client";

import { Bell, CircleAlert, CircleCheck } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useNotificationHistory } from "@/components/ui/toast";

const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Bell that opens the log of earlier notifications, since toasts disappear after a few seconds. */
export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const { entries, clear } = useNotificationHistory();

  return (
    <>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen(true)}
        className={cn("min-h-11 min-w-11", className)}
        aria-label="Notifications"
        data-testid="notification-bell"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        variant="drawer"
        testId="notification-history"
        title="Notifications"
        description="Messages the app has shown, newest first. Only the last 50 are kept on this computer."
        footer={
          entries.length > 0 ? (
            <Button variant="ghost" onClick={clear} data-testid="notification-clear">
              Clear all
            </Button>
          ) : undefined
        }
      >
        {entries.length === 0 ? (
          <p role="status" className="py-6 text-sm text-muted-foreground" data-testid="notification-empty">
            No notifications yet. Saves, refreshes, and errors will be listed here.
          </p>
        ) : (
          <ul className="divide-y divide-border" data-testid="notification-list">
            {entries.map((entry) => {
              const failed = entry.tone === "error";
              const Icon = failed ? CircleAlert : CircleCheck;
              return (
                <li key={entry.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0" data-testid="notification-item">
                  <Icon className={cn("mt-0.5 size-4 shrink-0", failed ? "text-rose-700" : "text-emerald-700")} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="sr-only">{failed ? "Error: " : "Saved: "}</span>
                      {entry.message}
                    </p>
                    <time dateTime={new Date(entry.at).toISOString()} className="mt-0.5 block text-xs text-muted-foreground">
                      {WHEN.format(entry.at)}
                    </time>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
    </>
  );
}
