import {
  DAY_END,
  DAY_START,
  formatDuration,
  formatTime,
  type BuildingView,
  type Pick,
  type RoomView,
} from "./availability";
import type { Theme } from "./hooks";
import type { Building, Meeting } from "./types";

const THEMES: { value: Theme; label: string; icon: string }[] = [
  { value: "system", label: "Auto", icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 0v18" },
  {
    value: "light",
    label: "Light",
    icon: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  },
  { value: "dark", label: "Dark", icon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" },
];

export function ThemeSwitch({ theme, onChange }: { theme: Theme; onChange: (t: Theme) => void }) {
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      {THEMES.map((t) => (
        <button key={t.value} aria-pressed={theme === t.value} title={`${t.label} theme`} onClick={() => onChange(t.value)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={t.icon} />
          </svg>
          <span className="ts-label">{t.label}</span>
        </button>
      ))}
    </div>
  );
}

const SPAN = DAY_END - DAY_START;
const pct = (minute: number) => `${(Math.min(Math.max(minute - DAY_START, 0), SPAN) / SPAN) * 100}%`;

export function Star({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      className={`star ${on ? "on" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Unstar ${label}` : `Star ${label}`}
      title={on ? "Starred" : "Star"}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

function directionsUrl(b: Building) {
  const q = b.address ? `${b.address}, Toronto, ON` : `${b.name}, University of Toronto`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function statusPill(v: RoomView, minute: number): { cls: string; text: string } {
  const s = v.status;
  if (s.kind === "busy") return { cls: "busy", text: `In class until ${formatTime(s.until)}` };
  if (s.kind === "free") {
    if (s.until == null) return { cls: "ok", text: "Free rest of day" };
    return { cls: "ok", text: `Free until ${formatTime(s.until)} · ${formatDuration(s.until - minute)}` };
  }
  return { cls: "maybe", text: "Schedule unknown" };
}

export function TopPicks({ picks, minute, onOpen }: { picks: Pick[]; minute: number; onOpen: (p: Pick) => void }) {
  if (picks.length === 0) return null;
  return (
    <section className="picks" aria-labelledby="picks-h">
      <h2 id="picks-h">Best bets</h2>
      <p className="section-sub">Free the longest from {formatTime(minute)}</p>
      <ul>
        {picks.map((p) => (
          <li key={p.view.key}>
            <button className="pick" onClick={() => onOpen(p)}>
              <span className="pick-room">{p.view.key}</span>
              <span className="pick-bldg">{p.building.name}</span>
              <span className="pick-until">
                {p.until == null ? "Free rest of day" : `Free until ${formatTime(p.until)}`}
              </span>
              <span className="pick-meta">{p.view.room.capacity ? `${p.view.room.capacity} seats` : ""}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BuildingCard({
  view,
  minute,
  classes,
  open,
  openRoom,
  starred,
  onToggle,
  onToggleRoom,
  onStar,
}: {
  view: BuildingView;
  minute: number;
  classes: boolean;
  open: boolean;
  openRoom: string | null;
  starred: Set<string>;
  onToggle: () => void;
  onToggleRoom: (key: string) => void;
  onStar: (key: string) => void;
}) {
  const { building, freeCount, inUse, hourly, exact } = view;
  const total = building.rooms.length;
  const load = total ? Math.min(1, inUse / total) : 0;
  const level = !view.hasData ? "nodata" : load >= 0.85 ? "full" : load >= 0.5 ? "mid" : "quiet";
  const peak = Math.max(total, ...hourly, 1);
  const currentHour = Math.floor((minute - DAY_START) / 60);

  return (
    <li className={`card ${level}`} id={`b-${building.code}`}>
      <div className="card-head" role="button" tabIndex={0} aria-expanded={open} onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}>
        <span className="code">{building.code}</span>
        <span className="title">
          <span className="name">{building.name}</span>
          {building.address && <span className="addr">{building.address}</span>}
        </span>
        {view.hasData ? (
          <span className="free">
            <strong>
              {exact ? "" : "~"}
              {freeCount}
            </strong>
            <span className="of">{view.rooms.length < total ? `of ${view.rooms.length} matching` : `of ${total} free`}</span>
          </span>
        ) : (
          <span className="free nodata">
            <span className="of">No class data</span>
          </span>
        )}
        <Star on={starred.has(building.code)} label={building.name} onClick={() => onStar(building.code)} />
      </div>

      {classes && (
        <>
          <div className="strip" aria-hidden="true">
            {hourly.map((n, i) => (
              <span
                key={i}
                className={`bar ${i === currentHour ? "cur" : ""}`}
                style={{ height: `${Math.max(8, (n / peak) * 100)}%` }}
                title={`${formatTime(DAY_START + i * 60)}: ${n} class${n === 1 ? "" : "es"}`}
              />
            ))}
          </div>
          <div className="strip-axis" aria-hidden="true">
            <span>8 AM</span>
            <span>Classes per hour</span>
            <span>10 PM</span>
          </div>
        </>
      )}

      {open && (
        <div className="card-body">
          <div className="card-actions">
            <a className="btn ghost" href={directionsUrl(building)} target="_blank" rel="noreferrer">
              Directions ↗
            </a>
            {!view.hasData ? (
              <span className="hint">
                No classes in ACORN or Timetable Builder are held here. Rooms may be used by other faculties or for exams.
              </span>
            ) : (
              !exact && <span className="hint">Room schedules unknown here, so counts are estimates.</span>
            )}
          </div>
          {view.rooms.length === 0 ? (
            <p className="hint">No rooms here match your filters.</p>
          ) : (
            <ul className="rooms">
              {view.rooms.map((r) => (
                <RoomRow
                  key={r.key}
                  view={r}
                  minute={minute}
                  exact={exact}
                  open={openRoom === r.key}
                  starred={starred.has(r.key)}
                  onToggle={() => onToggleRoom(r.key)}
                  onStar={() => onStar(r.key)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function RoomRow({
  view,
  minute,
  exact,
  open,
  starred,
  onToggle,
  onStar,
}: {
  view: RoomView;
  minute: number;
  exact: boolean;
  open: boolean;
  starred: boolean;
  onToggle: () => void;
  onStar: () => void;
}) {
  const { room } = view;
  const pill = statusPill(view, minute);
  const meta = [room.capacity ? `${room.capacity} seats` : null, room.seating, room.writing]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={`room ${open ? "open" : ""}`} id={`r-${view.key.replace(" ", "-")}`}>
      <div className="room-head" role="button" tabIndex={0} aria-expanded={open} onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}>
        <span className="room-text">
          <span className="room-name">
            {view.key}
            {room.label && room.label !== room.room ? (
              <span className="room-label"> {room.label.replace(room.room, "").trim()}</span>
            ) : null}
          </span>
          <span className="room-meta">{meta}</span>
        </span>
        <span className={`pill ${pill.cls}`}>{pill.text}</span>
        <Star on={starred} label={view.key} onClick={onStar} />
      </div>
      {open && <Timeline meetings={view.today} minute={minute} exact={exact} />}
    </li>
  );
}

function Timeline({ meetings, minute, exact }: { meetings: Meeting[]; minute: number; exact: boolean }) {
  if (!exact) {
    return <p className="hint timeline-note">This room's schedule isn't available yet.</p>;
  }
  return (
    <div className="timeline">
      <div className="tl-track" aria-hidden="true">
        {meetings.map((m, i) => (
          <span key={i} className="tl-block" style={{ left: pct(m[3]), width: `calc(${pct(m[4])} - ${pct(m[3])})` }} />
        ))}
        {minute >= DAY_START && minute < DAY_END && <span className="tl-now" style={{ left: pct(minute) }} />}
      </div>
      <div className="tl-axis" aria-hidden="true">
        {[8, 12, 16, 20].map((hour) => (
          <span key={hour} style={{ left: pct(hour * 60) }}>
            {formatTime(hour * 60)}
          </span>
        ))}
      </div>
      {meetings.length === 0 ? (
        <p className="hint">No classes in this room today.</p>
      ) : (
        <ul className="tl-list">
          {meetings.map((m, i) => (
            <li key={i} className={m[3] <= minute && minute < m[4] ? "now" : m[4] <= minute ? "past" : ""}>
              <span className="tl-time">
                {formatTime(m[3])}–{formatTime(m[4])}
              </span>
              <span>{m[5]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
