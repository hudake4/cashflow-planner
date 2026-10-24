"use client";

import { clsx } from "clsx";
import { CalendarSearch, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { CalendarView } from "@/contracts/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const VIEW_ITEM_CLASS = "h-11 min-w-16 rounded-chip px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";

/**
 * Calendar toolbar. On phones it is two rows (previous/next + title, then Today,
 * the view toggle and a jump-to-date button that reveals the date form); from
 * `lg` the date form is always shown inline.
 */
export function CalendarToolbar({
  view,
  title,
  refreshing,
  onViewChange,
  onStep,
  onToday,
  onJump,
}: {
  view: CalendarView;
  title: string;
  refreshing: boolean;
  onViewChange: (view: CalendarView) => void;
  onStep: (dir: -1 | 1) => void;
  onToday: () => void;
  onJump: (date: string) => void;
}) {
  const [jump, setJump] = useState("");
  const [jumpOpen, setJumpOpen] = useState(false);

  // Moving the calendar makes a typed jump date stale, so clear the field to keep it in line with the title.
  const moveCalendar = (move: () => void) => {
    setJump("");
    move();
  };

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 basis-full items-center gap-1 xl:basis-0 xl:flex-1">
          <Button size="icon" variant="ghost" className="size-11" onClick={() => moveCalendar(() => onStep(-1))} aria-label={view === "month" ? "Previous month" : "Previous week"} data-testid="calendar-prev">
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Button size="icon" variant="ghost" className="size-11" onClick={() => moveCalendar(() => onStep(1))} aria-label={view === "month" ? "Next month" : "Next week"} data-testid="calendar-next">
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Button>
          <h2 className="font-semiwide min-w-0 flex-1 truncate pl-1 text-lg sm:text-xl font-bold text-foreground" aria-live="polite" data-testid="calendar-title">
            {title}
          </h2>
          {refreshing && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground" role="status" data-testid="calendar-refreshing">
              <LoaderCircle className="h-4 w-4" aria-hidden="true" /> Updating
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" className="min-h-11" onClick={() => moveCalendar(onToday)} data-testid="calendar-today">
            Today
          </Button>
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(value) => {
              if (value === "month" || value === "week") onViewChange(value);
            }}
            aria-label="Calendar view"
            variant="outline"
            spacing={0}
            className="rounded-control border border-border bg-card p-0.5"
          >
            <ToggleGroupItem value="month" aria-label="Month view" data-testid="calendar-view-month" className={VIEW_ITEM_CLASS}>
              Month
            </ToggleGroupItem>
            <ToggleGroupItem value="week" aria-label="Week view" data-testid="calendar-view-week" className={VIEW_ITEM_CLASS}>
              Week
            </ToggleGroupItem>
          </ToggleGroup>
          <Button
            size="icon"
            variant="ghost"
            className="size-11 lg:hidden"
            aria-label="Jump to date"
            aria-expanded={jumpOpen}
            aria-controls="calendar-jump-form"
            onClick={() => setJumpOpen((open) => !open)}
            data-testid="calendar-jump-toggle"
          >
            <CalendarSearch className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <form
          id="calendar-jump-form"
          className={clsx("basis-full items-center gap-1.5 sm:max-w-md lg:flex lg:basis-auto", jumpOpen ? "flex" : "hidden")}
          onSubmit={(e) => {
            e.preventDefault();
            if (ISO_DATE.test(jump)) onJump(jump);
          }}
        >
          <label htmlFor="calendar-jump" className="sr-only">
            Jump to date
          </label>
          <Input
            id="calendar-jump"
            type="date"
            value={jump}
            onChange={(e) => {
              setJump(e.target.value);
              if (ISO_DATE.test(e.target.value)) onJump(e.target.value);
            }}
            className="h-11 min-w-0 flex-1 lg:w-[9.5rem] lg:flex-none"
            data-testid="calendar-jump"
          />
          <Button type="submit" size="sm" variant="ghost" className="min-h-11" data-testid="calendar-jump-go">
            Go
          </Button>
        </form>
      </div>
    </Card>
  );
}
