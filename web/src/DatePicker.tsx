import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { MONTH_NAMES, addDays, addMonths, dayOfWeek, formatDate, monthGrid } from "./availability";
import type { Calendar } from "./types";

const STEPS: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

const Icon = ({ d, size = 16 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const CALENDAR = "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z";

/** The no-class label (e.g. "Fall Reading Week") for a date, if any. */
function noClassLabel(calendar: Calendar | null | undefined, date: string) {
  return calendar?.noClasses.find((n) => n.start <= date && date <= n.end)?.label ?? null;
}

export function DatePicker({
  value,
  today,
  min,
  max,
  calendar,
  onChange,
}: {
  value: string;
  today: string;
  min: string;
  max: string;
  calendar: Calendar | null | undefined;
  onChange: (date: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [focusDate, setFocusDate] = useState(value);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popId = useId();

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Keep keyboard focus on the active day, including after moving into another month.
  useEffect(() => {
    if (open) root.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDate}"]`)?.focus();
  }, [open, focusDate, month]);

  const enabled = (d: string) => d === today || (d >= min && d <= max);
  const pick = (d: string) => {
    onChange(d);
    close();
  };

  const onGridKey = (e: KeyboardEvent) => {
    const step = STEPS[e.key];
    if (!step) return;
    e.preventDefault();
    const next = addDays(focusDate, step);
    if (!enabled(next)) return;
    setFocusDate(next);
    if (next.slice(0, 7) !== month) setMonth(next.slice(0, 7));
  };

  const weeks = monthGrid(month);
  const days = weeks.flat().filter((d): d is string => d != null);
  // One day in the grid is tabbable: the focused day if it's in view, else the first enabled one.
  const tabbable = days.includes(focusDate) ? focusDate : days.find(enabled);
  const [y, m] = month.split("-").map(Number);
  const hasBreaks = days.some((d) => noClassLabel(calendar, d));

  return (
    <div className="datepicker" ref={root}>
      <button
        ref={trigger}
        className="date-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={`Date: ${formatDate(value, "long")}`}
        onClick={() => {
          if (open) return close(false);
          setMonth(value.slice(0, 7));
          setFocusDate(value);
          setOpen(true);
        }}
      >
        <Icon d={CALENDAR} />
        <span>{value === today ? `Today, ${formatDate(value).slice(5)}` : formatDate(value)}</span>
        <Icon d="m6 9 6 6 6-6" size={14} />
      </button>

      {open && (
        <div className="dp-pop" id={popId} role="dialog" aria-label="Choose a date">
          <div className="dp-head">
            <button className="dp-nav" aria-label="Previous month" disabled={month <= min.slice(0, 7)}
              onClick={() => setMonth(addMonths(month, -1))}>
              <Icon d="m15 18-6-6 6-6" />
            </button>
            <span className="dp-title" aria-live="polite">
              {MONTH_NAMES[m - 1]} {y}
            </span>
            <button className="dp-nav" aria-label="Next month" disabled={month >= max.slice(0, 7)}
              onClick={() => setMonth(addMonths(month, 1))}>
              <Icon d="m9 18 6-6-6-6" />
            </button>
          </div>

          <div className="dp-week" aria-hidden="true">
            {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="dp-days" onKeyDown={onGridKey}>
            {weeks.flat().map((d, i) => {
              if (!d) return <span key={i} />;
              const off = noClassLabel(calendar, d);
              const cls = [
                "dp-day",
                d === value && "selected",
                d === today && "today",
                off && "off",
                dayOfWeek(d) > 5 && "weekend",
              ].filter(Boolean).join(" ");
              return (
                <button
                  key={d}
                  data-date={d}
                  className={cls}
                  disabled={!enabled(d)}
                  tabIndex={d === tabbable ? 0 : -1}
                  aria-pressed={d === value}
                  aria-current={d === today ? "date" : undefined}
                  aria-label={`${formatDate(d, "long")}${off ? `, ${off}, no classes` : ""}`}
                  title={off ?? undefined}
                  onFocus={() => setFocusDate(d)}
                  onClick={() => pick(d)}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>

          <div className="dp-foot">
            <span className="dp-legend">{hasBreaks ? "No classes, all rooms free" : ""}</span>
            <button className="dp-today" onClick={() => pick(today)}>
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
