import { useEffect, useMemo, useState } from "react";
import {
  DAY_END,
  DAY_START,
  SIZES,
  addDays,
  buildIndex,
  dayOfWeek,
  dayStatus,
  formatDate,
  formatDuration,
  formatTime,
  topPicks,
  torontoNow,
  viewBuilding,
  type Filters,
  type Pick,
  type Size,
} from "./availability";
import {
  BuildingCard,
  CONTRIBUTING_URL,
  Contribute,
  REPORT_FORM_URL,
  REPO_URL,
  ThemeSwitch,
  TopPicks,
} from "./components";
import { DatePicker } from "./DatePicker";
import { readUrl, useDismissed, useStarred, useTheme, writeUrl } from "./hooks";
import type { CampusData } from "./types";

const WINDOWS = [
  { value: 0, label: "Free right now" },
  { value: 30, label: "Free for 30 min+" },
  { value: 60, label: "Free for 1 hour+" },
  { value: 120, label: "Free for 2 hours+" },
  { value: 180, label: "Free for 3 hours+" },
];

export default function App() {
  const initial = useMemo(() => readUrl(), []);
  const [data, setData] = useState<CampusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => torontoNow());
  const [picked, setPicked] = useState<{ date: string; minute: number } | null>(
    initial.date || initial.minute != null
      ? { date: initial.date ?? torontoNow().date, minute: initial.minute ?? torontoNow().minute }
      : null,
  );
  const [filters, setFilters] = useState<Filters>(initial.filters);
  const [query, setQuery] = useState(initial.query);
  const [openBuilding, setOpenBuilding] = useState<string | null>(null);
  const [openRoom, setOpenRoom] = useState<string | null>(null);
  const [starred, toggleStar] = useStarred();
  const [theme, setTheme] = useTheme();
  const [contributeClosed, closeContribute] = useDismissed("contribute");
  const demo = initial.demo;

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/${demo ? "campus.demo.json" : "campus.json"}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [demo]);

  useEffect(() => {
    const id = setInterval(() => setNow(torontoNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  const date = picked?.date ?? now.date;
  const minute = picked?.minute ?? now.minute;
  const day = dayOfWeek(date);
  const live = picked == null;

  useEffect(() => {
    writeUrl({ date: picked?.date ?? null, minute: picked?.minute ?? null, filters, query, demo });
  }, [picked, filters, query, demo]);

  const index = useMemo(() => (data ? buildIndex(data) : null), [data]);
  const termDay = dayStatus(data?.calendar, date);

  // The picker covers the term (plus today, wherever it falls).
  const cal = data?.calendar;
  const minDate = cal && cal.classesStart < now.date ? cal.classesStart : now.date;
  const maxDate = cal ? (cal.classesEnd > now.date ? cal.classesEnd : now.date) : addDays(now.date, 120);

  const views = useMemo(() => {
    if (!data || !index) return [];
    const q = query.trim().toLowerCase();
    const at = { day, minute, classes: termDay.classes };
    const filtering = filters.size !== "any" || filters.tables || filters.starredOnly;
    return data.buildings
      .filter(
        (b) =>
          !q ||
          b.code.toLowerCase().startsWith(q) ||
          // Ignore punctuation in names: "oise" finds "O.I.S.E.".
          b.name.toLowerCase().replace(/[^a-z0-9 ]/g, "").includes(q.replace(/[^a-z0-9 ]/g, "")) ||
          b.rooms.some((r) => `${b.code} ${r.room}`.toLowerCase().startsWith(q)),
      )
      .map((b) => {
        // Searching for a room ("SS 21") narrows the building to matching rooms.
        const roomSearch = q.includes(" ") && b.rooms.some((r) => `${b.code} ${r.room}`.toLowerCase().startsWith(q));
        return viewBuilding(b, index, at, filters, starred, roomSearch ? (k) => k.toLowerCase().startsWith(q) : undefined);
      })
      .filter((v) => !filtering || v.rooms.length > 0)
      .sort(
        (a, z) =>
          Number(starred.has(z.building.code)) - Number(starred.has(a.building.code)) ||
          Number(z.hasData) - Number(a.hasData) ||
          z.freeCount - a.freeCount ||
          a.inUse / (a.total || 1) - z.inUse / (z.total || 1),
      );
  }, [data, index, query, day, minute, filters, starred, termDay.classes]);

  const picks = useMemo(
    () => (termDay.classes ? topPicks(views, minute, filters.minFor) : []),
    [views, minute, filters.minFor, termDay.classes],
  );

  const totalFree = views.reduce((n, v) => n + v.freeCount, 0);
  const anyEstimate = termDay.classes && views.some((v) => v.hasData && !v.exact);
  const afterHours = minute < DAY_START || minute >= DAY_END;

  // Auto-open a building when searching for one of its rooms.
  const roomSearch = query.trim().toUpperCase();
  useEffect(() => {
    if (!data || !roomSearch.includes(" ")) return;
    const match = data.buildings.find((b) => b.rooms.some((r) => `${b.code} ${r.room}` === roomSearch));
    if (match) {
      setOpenBuilding(match.code);
      setOpenRoom(roomSearch);
    }
  }, [roomSearch, data]);

  const setFilter = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const setTime = (patch: Partial<{ date: string; minute: number }>) =>
    setPicked((p) => ({ date: p?.date ?? now.date, minute: p?.minute ?? now.minute, ...patch }));

  const openPick = (p: Pick) => {
    setOpenBuilding(p.building.code);
    setOpenRoom(p.view.key);
    requestAnimationFrame(() =>
      document.getElementById(`r-${p.view.key.replace(" ", "-")}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
    );
  };

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            <div>
              <h1>Free Rooms</h1>
              <p className="brand-sub">Find an empty classroom to study in · St. George{data ? ` · ${data.termLabel}` : ""}</p>
            </div>
          </div>
          <div className="masthead-tools">
            {demo && <span className="demo-badge">Demo data</span>}
            <ThemeSwitch theme={theme} onChange={setTheme} />
          </div>
        </div>
      </header>

      <section className="controls" aria-label="Search options">
        <div className="controls-inner">
          <div className="when">
            <DatePicker
              value={date}
              today={now.date}
              min={minDate}
              max={maxDate}
              calendar={data?.calendar}
              onChange={(d) => setTime({ date: d })}
            />
            <label className="time-label" htmlFor="time">
              {formatTime(minute)}
            </label>
            <input
              id="time"
              type="range"
              min={DAY_START}
              max={DAY_END - 15}
              step={15}
              value={Math.min(Math.max(minute, DAY_START), DAY_END - 15)}
              aria-valuetext={formatTime(minute)}
              onChange={(e) => setTime({ minute: Number(e.target.value) })}
            />
            <button className={`btn now ${live ? "" : "ghost"}`} onClick={() => setPicked(null)} aria-pressed={live}>
              {live ? "● Now" : "Now"}
            </button>
          </div>
          <div className="filter-row">
            <select aria-label="How long" value={filters.minFor} onChange={(e) => setFilter("minFor", Number(e.target.value))}>
              {WINDOWS.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
            <select aria-label="Room size" value={filters.size} onChange={(e) => setFilter("size", e.target.value as Size)}>
              {Object.entries(SIZES).map(([k, s]) => (
                <option key={k} value={k}>
                  {s.label}
                </option>
              ))}
            </select>
            <button
              className={`toggle ${filters.tables ? "on" : ""}`}
              aria-pressed={filters.tables}
              title="Only rooms with real tables. Hides rooms with tablet-arm chairs (a small fold-out desk on each seat), labs, and rooms with no writing surface."
              onClick={() => setFilter("tables", !filters.tables)}
            >
              Full desks
            </button>
            <button
              className={`toggle ${filters.dept ? "on" : ""}`}
              aria-pressed={filters.dept}
              title="Also show labs and department rooms that classes meet in but the central classroom list leaves out. They may need card access, and their department can book them outside class times. No seat counts."
              onClick={() => setFilter("dept", !filters.dept)}
            >
              Labs &amp; dept rooms
            </button>
            <button className={`toggle ${filters.starredOnly ? "on" : ""}`} aria-pressed={filters.starredOnly}
              onClick={() => setFilter("starredOnly", !filters.starredOnly)}>
              ★ Starred
            </button>
          </div>
          <input
            className="search"
            type="search"
            placeholder="Search a building or room, e.g. Bahen or SS 2117"
            aria-label="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </section>

      <main className="content">
        {error && <p className="banner bad">Couldn't load room data ({error}).</p>}
        {!data && !error && <p className="banner">Loading classrooms…</p>}

        {data && (
          <>
            <div className="summary">
              <p className="summary-num">
                <strong>
                  {anyEstimate ? "~" : ""}
                  {totalFree}
                </strong>{" "}
                classroom{totalFree === 1 ? "" : "s"} free
              </p>
              <p className="summary-when">
                {formatDate(date)} at {formatTime(minute)}
                {filters.minFor ? ` for ${formatDuration(filters.minFor)}+` : ""}
                {live ? " · live" : ""}
              </p>
            </div>

            {demo && (
              <p className="banner warn">
                Demo data: rooms were assigned at random to show how the app works with full room schedules. Don't plan
                around it. <a href="?">Use real data</a>
              </p>
            )}
            {!termDay.classes && (
              <p className="banner good">
                <strong>No classes: {termDay.reason}.</strong> No classrooms have classes scheduled, but buildings may keep
                shorter hours.
              </p>
            )}
            {termDay.classes && afterHours && (
              <p className="banner">Outside class hours. Most buildings are locked or have reduced access now.</p>
            )}
            {anyEstimate && (
              <p className="banner">
                Room-by-room schedules aren't public yet, so “~” counts are estimates: classrooms in the building minus
                classes held there. Rooms marked “In class” are certain.{" "}
                {!demo && <a href="?demo=1">Preview with full room data</a>}
              </p>
            )}

            {!demo && !contributeClosed && <Contribute onDismiss={closeContribute} />}

            <TopPicks picks={picks} minute={minute} onOpen={openPick} />

            <h2 className="list-h">Buildings</h2>
            {views.length === 0 ? (
              <p className="banner">No rooms match. Try a shorter time, a different size, or clear the search.</p>
            ) : (
              <ul className="buildings">
                {views.map((v) => (
                  <BuildingCard
                    key={v.building.code}
                    view={v}
                    day={day}
                    minute={minute}
                    classes={termDay.classes}
                    open={openBuilding === v.building.code}
                    openRoom={openRoom}
                    starred={starred}
                    onToggle={() => setOpenBuilding(openBuilding === v.building.code ? null : v.building.code)}
                    onToggleRoom={(k) => setOpenRoom(openRoom === k ? null : k)}
                    onStar={toggleStar}
                  />
                ))}
              </ul>
            )}

            <footer className="foot">
              <p>
                Class times and rooms from ACORN and Timetable Builder; classroom list from Learning Space Management. Data updated{" "}
                {new Date(data.generatedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}.
                Covers centrally booked classrooms only. Rooms can still be booked for events, exams or meetings.
              </p>
              <p>
                Free Rooms gets better with every report. Is one of your tutorials, labs or lectures missing?{" "}
                <a href={REPORT_FORM_URL} target="_blank" rel="noreferrer">
                  Report a class
                </a>
                . It's open source (
                <a href={`${REPO_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer">
                  GPL-3.0
                </a>
                ) and{" "}
                <a href={CONTRIBUTING_URL} target="_blank" rel="noreferrer">
                  open to contributions
                </a>
                .
              </p>
              <p>
                A student project. Not affiliated with or endorsed by the University of Toronto. If this use of ACORN data
                isn't permitted, please <a href={`${REPO_URL}/issues`}>let the maintainer know</a>:
                it will be removed and room data will come from student reports instead.
              </p>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
