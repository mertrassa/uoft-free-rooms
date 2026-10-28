/*
 * Room data from ACORN, run inside a signed-in ACORN tab (Enrol & Manage > Courses).
 *
 * Read-only: for each course it makes the same GET the course details pop-up makes
 * (rest/enrolment/course/view) and keeps only times and rooms. It never calls any
 * enrolment action. It reuses the URL of a pop-up opened by hand, so open any course's
 * details once first; the account-specific query values never leave the page.
 *
 * Paced one request at a time (2 s apart by default). Stops on sign-out, rate
 * limiting or repeated errors. Progress lives in window.__acornRooms and is saved to
 * this browser's localStorage every 25 courses, so a reload, sign-out or reopened tab loses nothing:
 * run acornRooms() again with the same list and it skips courses already done.
 * acornRoomsStop() stops early; acornRoomsDownload() saves the rows as JSON in the
 * format scripts/build_data.py reads.
 *
 * Usage (paste this file, then):
 *   acornRooms(["CSC108H1F", "MAT133Y1Y"])            // course code + section code
 */

/* eslint-disable no-unused-vars */
const ACORN_ROOMS_KEY = "acornRooms:progress";

function acornRoomsSaved() {
  try {
    return JSON.parse(localStorage.getItem(ACORN_ROOMS_KEY) ?? "null");
  } catch {
    return null;
  }
}

async function acornRooms(courses, { delayMs = 2000, maxErrors = 5, checkpointEvery = 25 } = {}) {
  const template = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .reverse()
    .find((u) => u.includes("/rest/enrolment/course/view?"));
  if (!template) throw new Error("Open any course's details pop-up once, then run this again.");
  if (window.__acornRooms?.running) throw new Error("Already running. Call acornRoomsStop() first.");

  const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const to24 = (t) => {
    const [, h, m, ap] = /(\d+):(\d+)\s*(AM|PM)/i.exec(t);
    return `${String((Number(h) % 12) + (ap.toUpperCase() === "PM" ? 12 : 0)).padStart(2, "0")}:${m}`;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const saved = acornRoomsSaved();
  const state = (window.__acornRooms = {
    total: courses.length,
    done: 0,
    rows: saved?.rows ?? [],
    finished: saved?.finished ?? [],
    failed: [],
    running: true,
    stop: false,
    error: null,
    startedAt: new Date().toISOString(),
  });
  const finished = new Set(state.finished);
  const todo = courses.filter((c) => !finished.has(c));
  state.done = courses.length - todo.length;

  const checkpoint = () => {
    try {
      localStorage.setItem(ACORN_ROOMS_KEY, JSON.stringify({ rows: state.rows, finished: state.finished }));
    } catch {
      // storage full or blocked: progress stays in memory only
    }
  };

  let errorsInARow = 0;
  for (const course of todo) {
    if (state.stop) break;
    // "CSC108H1F" -> CSC108H1 + F; graduate sections can be longer: "AST3101HF1" -> AST3101H + F1.
    const [, courseCode, sectionCode] = /^([A-Z]{3}[A-Z0-9]{3,4}[HY]\d?)(.+)$/.exec(course) ?? [null, course.slice(0, -1), course.slice(-1)];
    const url = new URL(template);
    url.searchParams.set("courseCode", courseCode);
    url.searchParams.set("sectionCode", sectionCode);

    let res = null;
    let body = null;
    try {
      res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
      if (res.ok) body = await res.json();
    } catch (e) {
      // A login or timeout page instead of JSON means the session ended.
      if (res?.ok) {
        state.error = "ACORN returned a page instead of data (probably signed out). Sign in again and rerun.";
        break;
      }
      // When the server session ends, ACORN redirects to the sign-in host, which the
      // browser blocks as cross-origin: fetch rejects with no response at all.
      if (!res && navigator.onLine) {
        state.error = "ACORN session ended (request blocked by sign-in redirect). Sign in again and rerun.";
        break;
      }
      state.failed.push([course, String(e)]);
    }
    if (res && (res.status === 401 || res.status === 403 || res.redirected)) {
      state.error = "Signed out of ACORN. Sign in again and rerun with the same list.";
      break;
    }
    if (res && res.status === 429) {
      state.error = "ACORN asked us to slow down (HTTP 429). Stopped.";
      break;
    }
    if (body) {
      errorsInARow = 0;
      for (const s of body.responseObject?.meetings ?? []) {
        if (s.cancelled) continue;
        for (const t of s.times ?? []) {
          if (!t.buildingCode || !t.day) continue; // online / TBA
          state.rows.push({
            course,
            section: `${s.teachMethod}${s.sectionNo}`,
            campus: "St. George",
            building: t.buildingCode,
            room: t.room ?? "",
            day: DAYS[t.day.index],
            start: to24(t.startTime),
            end: to24(t.endTime),
            session: s.sessionCode,
          });
        }
      }
      state.finished.push(course);
    } else {
      if (res) state.failed.push([course, res.status]);
      if (++errorsInARow >= maxErrors) {
        state.error = `${maxErrors} errors in a row. Stopped.`;
        break;
      }
    }
    state.done++;
    if (state.finished.length % checkpointEvery === 0) checkpoint();
    if (state.done < courses.length) await sleep(delayMs);
  }
  checkpoint();
  state.running = false;
  state.finishedAt = new Date().toISOString();
  return acornRoomsStatus();
}

/*
 * Course list for courses Timetable Builder doesn't have (graduate and professional faculties):
 * one course search per subject prefix, the same request the search box makes as you type.
 * Keeps St. George courses offered in the given session (F and Y sections) that Timetable Builder
 * doesn't list (graduate level, or run by a division outside TTB) and returns them as
 * "CSC2515HF"-style codes for acornRooms(). Run after typing anything into the search box once.
 *   acornCourseSearch(["CSC", "APD", ...])
 */
const TTB_DIVISIONS = ["APSC", "ARTSC", "FIS", "FPEH", "MUSIC", "ARCLA", "ERIN", "SCAR"];

async function acornCourseSearch(prefixes, { session = "20269", delayMs = 4000, skip = [] } = {}) {
  const template = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .reverse()
    .find((u) => u.includes("/rest/enrolment/course/matching-courses?"));
  if (!template) throw new Error("Type a course code into the search box once, then run this again.");
  const known = new Set(skip);
  // Resumable like acornRooms(): searched prefixes and finds are saved in this browser.
  const KEY = "acornSearch:progress";
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    // no saved progress
  }
  const searched = new Set(saved?.searched ?? []);
  const found = new Map(saved?.found ?? []);
  const state = (window.__acornSearch = { total: prefixes.length, done: searched.size, found: found.size, error: null, running: true });
  const checkpoint = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ searched: [...searched], found: [...found] }));
    } catch {
      // storage full or blocked: progress stays in memory only
    }
  };
  for (const prefix of prefixes.filter((p) => !searched.has(p))) {
    const url = new URL(template);
    url.searchParams.set("coursePrefix", prefix);
    let res = null;
    try {
      res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
    } catch (e) {
      state.error = `Search for ${prefix} failed (${e}); probably signed out.`;
      break;
    }
    if (res.status === 429) {
      state.error = `ACORN asked us to slow down (HTTP 429) at ${prefix}. Stopped.`;
      break;
    }
    if (res.ok) {
      for (const c of await res.json()) {
        const code = c.activityCode + c.sectionCode;
        const inTtb = c.levelOfInstruction !== "G" && TTB_DIVISIONS.includes(c.primaryOrgCode);
        if (c.campusCode === "STG" && c.sessionCode === session && !inTtb && !known.has(code)) {
          found.set(code, { level: c.levelOfInstruction, org: c.primaryOrgCode });
        }
      }
      searched.add(prefix);
    }
    state.done++;
    state.found = found.size;
    checkpoint();
    await new Promise((r) => setTimeout(r, delayMs));
  }
  state.running = false;
  state.courses = [...found.keys()].sort();
  return state.courses;
}

function acornRoomsStatus() {
  const s = window.__acornRooms;
  if (!s) return null;
  return {
    done: s.done, total: s.total, rows: s.rows.length, failed: s.failed.length,
    running: s.running, error: s.error, startedAt: s.startedAt, finishedAt: s.finishedAt ?? null,
  };
}

function acornRoomsStop() {
  if (window.__acornRooms) window.__acornRooms.stop = true;
}

function acornRoomsDownload(name = "acorn_meetings.json") {
  const blob = new Blob([JSON.stringify(window.__acornRooms.rows)], { type: "application/json" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

/** After the rows are saved to disk: drop this browser's saved progress. */
function acornRoomsClear() {
  localStorage.removeItem(ACORN_ROOMS_KEY);
  localStorage.removeItem("acornSearch:progress");
}
