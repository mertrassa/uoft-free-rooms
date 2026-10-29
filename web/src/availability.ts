import type { Building, Calendar, CampusData, Meeting, Room } from "./types";

/** Share of a building's meetings that must carry a room before we trust per-room status. */
export const ROOM_COVERAGE_THRESHOLD = 0.9;
/**
 * Weekly classes per classroom below which a building's schedule is too thin to trust: its main
 * users list no times in our sources (e.g. Rehabilitation Sciences, 3 classes for 43 rooms).
 */
export const MIN_CLASSES_PER_ROOM = 1;
/**
 * A classroom listed for fewer weekday daytime hours than both of these is probably booked directly
 * by its department (tutorials, seminars), not empty: SS 2120 has no listed classes while SS rooms
 * typically have 33 hours a week. We never show such a room as free.
 */
export const RARELY_LISTED_HOURS = 6;
export const RARELY_LISTED_SHARE = 0.25;
const LISTED_FROM = 9 * 60;
const LISTED_TO = 18 * 60;

export const DAY_START = 8 * 60;
export const DAY_END = 22 * 60;
/** A gap between classes this short (minutes) doesn't count as the room being free. */
export const SHORT_GAP = 10;

export type Size = "any" | "small" | "medium" | "large";

export const SIZES: Record<Size, { label: string; min: number; max: number }> = {
  any: { label: "Any size", min: 0, max: Infinity },
  small: { label: "Small (< 50)", min: 0, max: 49 },
  medium: { label: "Medium (50–149)", min: 50, max: 149 },
  large: { label: "Large (150+)", min: 150, max: Infinity },
};

export interface Filters {
  /** Minutes the room must stay free from the selected time. 0 = free right now. */
  minFor: number;
  size: Size;
  tables: boolean;
  starredOnly: boolean;
  /** Also show labs and departmental rooms (often card-access, and their own bookings aren't known). */
  dept: boolean;
}

export const DEFAULT_FILTERS: Filters = { minFor: 0, size: "any", tables: false, starredOnly: false, dept: false };

export type RoomStatus =
  | { kind: "busy"; course: string; until: number; reported?: boolean }
  | { kind: "free"; until: number | null }
  /** No class listed now, but the room is rarely listed at all: likely booked outside our sources. */
  | { kind: "unlisted" }
  | { kind: "unknown" };

export interface RoomView {
  room: Room;
  /** "BA 1200": used for stars and URLs. */
  key: string;
  status: RoomStatus;
  /** This room's classes on the selected day, in start order. */
  today: Meeting[];
}

export interface BuildingView {
  building: Building;
  /** Every room has a schedule we trust, so "free" means free. */
  exact: boolean;
  /** False when no class is ever scheduled here, so we can't say anything about it. */
  hasData: boolean;
  /** Rooms counted here: the classrooms, plus labs and departmental rooms when shown. */
  total: number;
  /** Classes in session at the selected time. */
  inUse: number;
  /** Rooms passing the filters that are free for the whole window (an estimate unless exact). */
  freeCount: number;
  /** Rooms passing the filters, with their status. */
  rooms: RoomView[];
  /** Classes in session at each hour from DAY_START to DAY_END. */
  hourly: number[];
}

export interface Index {
  byBuilding: Map<string, Meeting[]>;
  /** Buildings with enough classes in our sources to say anything about them. */
  knownBuildings: Set<string>;
  exactBuildings: Set<string>;
  /** Room keys ("SS 2120") too rarely listed to trust as free; see RARELY_LISTED_HOURS. */
  rarelyListed: Set<string>;
}

export interface Moment {
  day: number;
  minute: number;
  /** False on holidays, reading week and outside the term: no classes run. */
  classes: boolean;
}

export const roomKey = (b: Building, r: Room) => `${b.code} ${r.room}`;

export function buildIndex(data: CampusData): Index {
  const byBuilding = new Map<string, Meeting[]>();
  for (const m of data.meetings) {
    const list = byBuilding.get(m[0]);
    if (list) list.push(m);
    else byBuilding.set(m[0], [m]);
  }
  const knownBuildings = new Set<string>();
  const exactBuildings = new Set<string>();
  for (const b of data.buildings) {
    const list = byBuilding.get(b.code) ?? [];
    // No (or almost no) classes means its users aren't in our sources (e.g. exams, faculties that
    // list no times), not that it's empty.
    const classrooms = b.rooms.filter((r) => !r.dept).length;
    if (list.length === 0 || list.length < classrooms * MIN_CLASSES_PER_ROOM) continue;
    knownBuildings.add(b.code);
    // A class in a room LSM doesn't book (a lab, studio, departmental room) still has a known
    // place: it just doesn't occupy any classroom we list.
    const placed = list.filter((m) => m[1] !== "").length;
    if (placed / list.length >= ROOM_COVERAGE_THRESHOLD) exactBuildings.add(b.code);
  }

  // Listed weekday daytime hours per classroom, compared with the building's typical classroom.
  const rarelyListed = new Set<string>();
  for (const b of data.buildings) {
    if (!exactBuildings.has(b.code)) continue;
    const minutes = new Map<string, number>();
    for (const m of byBuilding.get(b.code) ?? []) {
      const overlap = Math.min(m[4], LISTED_TO) - Math.max(m[3], LISTED_FROM);
      if (m[2] <= 5 && overlap > 0) minutes.set(m[1], (minutes.get(m[1]) ?? 0) + overlap);
    }
    const classrooms = b.rooms.filter((r) => !r.dept);
    const hours = classrooms.map((r) => (minutes.get(r.room) ?? 0) / 60);
    const sorted = [...hours].sort((a, z) => a - z);
    const mid = sorted.length / 2;
    const median = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
    const limit = Math.min(RARELY_LISTED_HOURS, RARELY_LISTED_SHARE * median);
    classrooms.forEach((r, i) => hours[i] < limit && rarelyListed.add(roomKey(b, r)));
  }
  return { byBuilding, knownBuildings, exactBuildings, rarelyListed };
}

const active = (m: Meeting, minute: number) => m[3] <= minute && minute < m[4];

export function roomMatches(room: Room, key: string, f: Filters, starred: Set<string>): boolean {
  const size = SIZES[f.size] ?? SIZES.any;
  if (room.dept && !f.dept) return false;
  if (f.size !== "any" && (room.capacity == null || room.capacity < size.min || room.capacity > size.max)) return false;
  // "Tables" as a whole word: LSM's "Tablet Arm" desks don't fit a laptop and notes.
  if (f.tables && !/\btables?\b/i.test(room.writing ?? "")) return false;
  // A starred building stars all of its rooms.
  if (f.starredOnly && !starred.has(key) && !starred.has(key.split(" ")[0])) return false;
  return true;
}

/** Free from `minute` for at least `minFor` minutes. A room free for the rest of the day counts up to DAY_END. */
export function freeFor(status: RoomStatus, minute: number, minFor: number): boolean {
  if (status.kind !== "free") return false;
  if (minFor <= 0) return true;
  return (status.until ?? DAY_END) - minute >= minFor;
}

export function viewBuilding(
  b: Building,
  index: Index,
  at: Moment,
  filters: Filters = DEFAULT_FILTERS,
  starred: Set<string> = new Set(),
  /** Extra room filter by key, e.g. a room search. */
  only?: (key: string) => boolean,
): BuildingView {
  const meetings = at.classes ? (index.byBuilding.get(b.code) ?? []).filter((m) => m[2] === at.day) : [];
  const exact = index.exactBuildings.has(b.code) || !at.classes;
  const hasData = index.knownBuildings.has(b.code) || !at.classes;
  const known = new Set(b.rooms.map((r) => r.room));
  // Hidden labs don't take up a classroom, so their classes don't count against the free ones.
  const hidden = new Set(filters.dept ? [] : b.rooms.filter((r) => r.dept).map((r) => r.room));
  const total = b.rooms.length - hidden.size;
  const { minute } = at;

  const all = b.rooms.map((room): RoomView => {
    const today = meetings.filter((m) => m[1] === room.room).sort((a, z) => a[3] - z[3]);
    const current = today.find((m) => active(m, minute));
    const next = today.find((m) => m[3] > minute);
    const key = roomKey(b, room);
    if (current) {
      // Busy until the room actually opens up: back-to-back classes (or a gap too short to study) chain.
      let until = current[4];
      for (const m of today) if (m[3] <= until + SHORT_GAP && m[4] > until) until = m[4];
      const status: RoomStatus = { kind: "busy", course: current[5], until };
      if (current[6]) status.reported = true;
      return { room, key, today, status };
    }
    // Holidays aside, a room its department likely books stays unconfirmed rather than free.
    if (at.classes && index.rarelyListed.has(key)) return { room, key, today, status: { kind: "unlisted" } };
    if (exact) return { room, key, today, status: { kind: "free", until: next ? next[3] : null } };
    return { room, key, today, status: { kind: "unknown" } };
  });
  // Searching for a lab by name ("BA 3145") shows it even with labs hidden.
  const shown = only ? { ...filters, dept: true } : filters;
  const rooms = all.filter((v) => roomMatches(v.room, v.key, shown, starred) && (!only || only(v.key)));

  // Classes at time t: rooms known to be busy plus meetings we can't place in a room.
  const inUseAt = (t: number) => {
    const now = meetings.filter((m) => active(m, t) && !hidden.has(m[1]));
    return new Set(now.filter((m) => known.has(m[1])).map((m) => m[1])).size +
      now.filter((m) => !known.has(m[1])).length;
  };

  let freeCount: number;
  if (!hasData) {
    freeCount = 0;
  } else if (exact) {
    freeCount = rooms.filter((v) => freeFor(v.status, minute, filters.minFor)).length;
  } else {
    // Busiest point in the window decides how many rooms can stay free throughout.
    let peak = inUseAt(minute);
    for (let t = minute + 15; t < minute + filters.minFor; t += 15) peak = Math.max(peak, inUseAt(t));
    const knownBusy = new Set(
      meetings.filter((m) => known.has(m[1]) && m[3] < minute + Math.max(filters.minFor, 1) && minute < m[4]).map((m) => m[1]),
    );
    const candidates = rooms.filter((v) => !knownBusy.has(v.room.room) && v.status.kind !== "unlisted").length;
    freeCount = Math.max(0, Math.min(candidates, total - peak));
  }

  const hourly: number[] = [];
  for (let t = DAY_START; t < DAY_END; t += 60) hourly.push(meetings.filter((m) => active(m, t + 30)).length);

  return { building: b, exact, hasData, total, inUse: inUseAt(minute), freeCount, rooms, hourly };
}

export interface Pick {
  building: Building;
  view: RoomView;
  until: number | null;
}

/**
 * Rooms with a trusted schedule that stay free longest from now, smallest rooms first on ties,
 * at most `perBuilding` from any one building so the picks spread across campus.
 */
export function topPicks(views: BuildingView[], minute: number, minFor: number, limit = 6, perBuilding = 1): Pick[] {
  const picks: Pick[] = [];
  for (const bv of views) {
    if (!bv.exact) continue;
    for (const v of bv.rooms) {
      // Labs may be locked or booked by their department: never a best bet.
      if (!v.room.dept && v.status.kind === "free" && freeFor(v.status, minute, minFor)) {
        picks.push({ building: bv.building, view: v, until: v.status.until });
      }
    }
  }
  picks.sort((a, z) => (z.until ?? DAY_END) - (a.until ?? DAY_END) || (a.view.room.capacity ?? 0) - (z.view.room.capacity ?? 0));
  const taken = new Map<string, number>();
  return picks
    .filter((p) => {
      const n = taken.get(p.building.code) ?? 0;
      taken.set(p.building.code, n + 1);
      return n < perBuilding;
    })
    .slice(0, limit);
}

export function dayStatus(calendar: Calendar | null | undefined, date: string): { classes: boolean; reason?: string } {
  if (!calendar) return { classes: true };
  if (date < calendar.classesStart) return { classes: false, reason: "Classes haven't started for the term" };
  if (date > calendar.classesEnd) return { classes: false, reason: "Classes are over for the term" };
  const off = calendar.noClasses.find((n) => n.start <= date && date <= n.end);
  return off ? { classes: false, reason: off.label } : { classes: true };
}

// ---- time and dates ----

export function formatTime(minute: number): string {
  const h = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Mon=1 … Sun=7 for a YYYY-MM-DD date. */
export function dayOfWeek(date: string): number {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "2026-12" plus n months. */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
}

/** Weeks of a "YYYY-MM" month, Monday first, with null for days outside the month. */
export function monthGrid(month: string): (string | null)[][] {
  const [y, m] = month.split("-").map(Number);
  const cells: (string | null)[] = Array(dayOfWeek(`${month}-01`) - 1).fill(null);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Tue, Oct 27" or, long, "Tuesday, October 27, 2026". */
export function formatDate(date: string, style: "short" | "long" = "short"): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = WEEKDAY_NAMES[dayOfWeek(date) - 1];
  const month = MONTH_NAMES[m - 1];
  return style === "long" ? `${weekday}, ${month} ${d}, ${y}` : `${weekday.slice(0, 3)}, ${month.slice(0, 3)} ${d}`;
}

/** Today's date and the minute of day in Toronto, wherever the viewer is. */
export function torontoNow(now = new Date()): { date: string; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}
