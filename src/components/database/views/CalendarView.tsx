"use client";

import * as React from "react";
import Link from "next/link";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { getCellKey } from "@/lib/database/engine";
import type {
  DatabaseCellValue,
  DatabaseProperty,
  DocumentRecord,
} from "@/types/database";
import { Button } from "@/components/ui/button";

interface CalendarViewProps {
  rows: DocumentRecord[];
  dateProperty?: DatabaseProperty;
  cellMap: Map<string, DatabaseCellValue>;
  onAddForDate: (isoDate: string) => void;
}

export function CalendarView({
  rows,
  dateProperty,
  cellMap,
  onAddForDate,
}: CalendarViewProps) {
  const [cursorMonth, setCursorMonth] = React.useState(() => new Date());

  const days = React.useMemo(() => {
    const start = startOfWeek(startOfMonth(cursorMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursorMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursorMonth]);

  if (!dateProperty) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Add a <strong>Date</strong> property to display items on the calendar.
      </div>
    );
  }

  const rowsByDay = new Map<string, DocumentRecord[]>();
  for (const row of rows) {
    const cell = cellMap.get(getCellKey(row.id, dateProperty.id));
    if (!cell?.value_date_start) continue;
    const dayKey = cell.value_date_start.slice(0, 10);
    const list = rowsByDay.get(dayKey) || [];
    list.push(row);
    rowsByDay.set(dayKey, list);
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">
          {format(cursorMonth, "MMMM yyyy")}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCursorMonth(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursorMonth((m) => subMonths(m, 1))}
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCursorMonth((m) => addMonths(m, 1))}
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-border bg-secondary/40 text-center text-[11px] font-medium text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 divide-x divide-y divide-border">
        {days.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayRows = rowsByDay.get(dayKey) || [];
          const inMonth = isSameMonth(day, cursorMonth);
          const today = isToday(day);

          return (
            <div
              key={dayKey}
              className={`group min-h-[108px] p-1.5 ${
                inMonth ? "bg-card" : "bg-secondary/20 text-muted-foreground"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                    today
                      ? "bg-primary text-primary-foreground font-semibold"
                      : ""
                  }`}
                >
                  {format(day, "d")}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onAddForDate(new Date(`${dayKey}T00:00:00.000Z`).toISOString())
                  }
                  aria-label={`Add item on ${dayKey}`}
                  className="rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-accent"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-1">
                {dayRows.map((row) => (
                  <Link
                    key={row.id}
                    href={`/${row.id}`}
                    className="block truncate rounded border border-border bg-secondary/60 px-1.5 py-0.5 text-[11px] font-medium hover:bg-accent"
                  >
                    {row.icon ? `${row.icon} ` : ""}
                    {row.title}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
