import { describe, expect, it } from "vitest";
import {
  DAY_END,
  DEFAULT_FILTERS,
  addDays,
  addMonths,
  buildIndex,
  dayOfWeek,
  dayStatus,
  formatDate,
  formatDuration,
  monthGrid,
  formatTime,
  freeFor,
  topPicks,
  torontoNow,
  viewBuilding,
  type Filters,
  type Moment,
} from "./availability";
import { readUrl } from "./hooks";
import type { Building, CampusData, Meeting, Room } from "./types";

const room = (id: string, capacity: number, writing = "Continuous Tables"): Room => ({
  room: id,
  label: id,
  capacity,
  seating: "Stacking Chairs",
  writing,
});

const TUE = 2;
const at = (minute: number, classes = true): Moment => ({ day: TUE, minute, classes });
const h = (hours: number) => hours * 60;

// AA: every class has a room (exact). BB: no class has a room (estimate).
const AA: Building = {
  code: "AA",
  name: "Alpha Hall",
  address: "1 King's College Circle",
  rooms: [room("101", 30), room("102", 80, "Tablet Arm"), room("201", 200)],
};
const BB: Building = { code: "BB", name: "Beta Hall", address: null, rooms: [room("1", 40), room("2", 40), room("3", 40)] };

const meetings: Meeting[] = [
  ["AA", "101", TUE, h(10), h(12), "CSC108H1F LEC0101"],
  ["AA", "101", TUE, h(14), h(16), "MAT137Y1Y LEC0201"],
  ["AA", "102", TUE, h(13), h(14), "ECO101H1F TUT0101"],
  ["AA", "201", 3, h(10), h(12), "PSY100H1F LEC0101"], // Wednesday only
  ["BB", "", TUE, h(10), h(11), "HIS101H1F LEC0101"],
  ["BB", "", TUE, h(10), h(12), "HIS102H1F LEC0101"],
  ["BB", "", TUE, h(11), h(13), "HIS103H1F LEC0101"],
];

const data: CampusData = {
  generatedAt: "2026-10-27T00:00:00Z",
  session: "20269",
  termLabel: "Fall 2026",
  buildings: [AA, BB],
  meetings,
};
const index = buildIndex(data);
const filters = (f: Partial<Filters>): Filters => ({ ...DEFAULT_FILTERS, ...f });

describe("buildIndex", () => {
  it("trusts buildings whose meetings all have known rooms", () => {
    expect(index.exactBuildings.has("AA")).toBe(true);
    expect(index.exactBuildings.has("BB")).toBe(false);
  });

  it("counts classes in rooms LSM doesn't list as placed, without booking a listed room", () => {
    const lab = buildIndex({ ...data, meetings: [["AA", "LAB9", TUE, h(9), h(10), "X"]] });
    expect(lab.exactBuildings.has("AA")).toBe(true);
    const v = viewBuilding(AA, lab, at(h(9) + 30));
    expect(v.freeCount).toBe(AA.rooms.length);
  });

  it("stays an estimate when too few classes have a room", () => {
    const some = buildIndex({
      ...data,
      meetings: [["AA", "101", TUE, h(9), h(10), "X"], ["AA", "", TUE, h(9), h(10), "Y"]],
    });
    expect(some.exactBuildings.has("AA")).toBe(false);
  });

  it("doesn't claim a building with no class data is free", () => {
    const empty = buildIndex({ ...data, meetings: [] });
    expect(empty.exactBuildings.has("BB")).toBe(false);
    const v = viewBuilding(BB, empty, at(h(10)));
    expect(v.hasData).toBe(false);
    expect(v.freeCount).toBe(0);
    expect(topPicks([v], h(10), 0)).toEqual([]);
  });
});

describe("viewBuilding with full room data", () => {
  it("marks rooms busy, free until next class, or free for the day", () => {
    const v = viewBuilding(AA, index, at(h(11)));
    const status = Object.fromEntries(v.rooms.map((r) => [r.room.room, r.status]));
    expect(status["101"]).toEqual({ kind: "busy", course: "CSC108H1F LEC0101", until: h(12) });
    expect(status["102"]).toEqual({ kind: "free", until: h(13) });
    expect(status["201"]).toEqual({ kind: "free", until: null }); // its class is on Wednesday
    expect(v.exact).toBe(true);
    expect(v.inUse).toBe(1);
    expect(v.freeCount).toBe(2);
  });

  it("keeps a room busy through back-to-back classes and short gaps", () => {
    const chained = buildIndex({
      ...data,
      meetings: [
        ["AA", "101", TUE, h(9), h(11), "A"],
        ["AA", "101", TUE, h(11), h(13), "B"],
        ["AA", "101", TUE, h(13) + 10, h(15), "C"], // 10-minute gap: still busy
        ["AA", "101", TUE, h(16), h(17), "D"], // an hour free before this one
      ],
    });
    const v = viewBuilding(AA, chained, at(h(10)));
    expect(v.rooms.find((r) => r.room.room === "101")?.status).toEqual({ kind: "busy", course: "A", until: h(15) });
  });

  it("treats the end of a class as free (end time is exclusive)", () => {
    const v = viewBuilding(AA, index, at(h(12)));
    expect(v.rooms[0].status).toEqual({ kind: "free", until: h(14) });
  });

  it("only counts rooms free for the whole window", () => {
    // At 12:00: 101 free 2h (until 14), 102 free 1h (until 13), 201 free all day.
    expect(viewBuilding(AA, index, at(h(12)), filters({ minFor: 60 })).freeCount).toBe(3);
    expect(viewBuilding(AA, index, at(h(12)), filters({ minFor: 90 })).freeCount).toBe(2);
    expect(viewBuilding(AA, index, at(h(12)), filters({ minFor: 180 })).freeCount).toBe(1);
  });

  it("lists each room's classes for the day in order", () => {
    const v = viewBuilding(AA, index, at(h(9)));
    expect(v.rooms[0].today.map((m) => m[5])).toEqual(["CSC108H1F LEC0101", "MAT137Y1Y LEC0201"]);
    expect(v.rooms[2].today).toEqual([]);
  });

  it("counts classes per hour for the strip", () => {
    const v = viewBuilding(AA, index, at(h(9)));
    expect(v.hourly).toHaveLength(14);
    expect(v.hourly[2]).toBe(1); // 10:30
    expect(v.hourly[5]).toBe(1); // 13:30
    expect(v.hourly[0]).toBe(0); // 8:30
  });
});

describe("viewBuilding without room data", () => {
  it("estimates free rooms as classrooms minus classes in session", () => {
    const v = viewBuilding(BB, index, at(h(10) + 30));
    expect(v.exact).toBe(false);
    expect(v.inUse).toBe(2);
    expect(v.freeCount).toBe(1);
    expect(v.rooms.every((r) => r.status.kind === "unknown")).toBe(true);
  });

  it("uses the busiest point in the window", () => {
    // From 10:00 to 12:00 the peak is 2 classes (10–11 and 11–12 both have two running).
    expect(viewBuilding(BB, index, at(h(10)), filters({ minFor: 120 })).freeCount).toBe(1);
    // At 13:00 nothing runs.
    expect(viewBuilding(BB, index, at(h(13)), filters({ minFor: 60 })).freeCount).toBe(3);
  });

  it("never reports fewer than zero", () => {
    const busy = buildIndex({
      ...data,
      meetings: Array.from({ length: 5 }, (_, i): Meeting => ["BB", "", TUE, h(10), h(11), `X${i}`]),
    });
    expect(viewBuilding(BB, busy, at(h(10))).freeCount).toBe(0);
  });
});

describe("days without classes", () => {
  it("shows every room free on a holiday", () => {
    const v = viewBuilding(BB, index, at(h(10), false));
    expect(v.exact).toBe(true);
    expect(v.freeCount).toBe(3);
    expect(v.rooms.every((r) => r.status.kind === "free" && r.status.until === null)).toBe(true);
  });
});

describe("filters", () => {
  it("filters by size", () => {
    const v = viewBuilding(AA, index, at(h(9)), filters({ size: "large" }));
    expect(v.rooms.map((r) => r.room.room)).toEqual(["201"]);
    expect(v.freeCount).toBe(1);
  });

  it("filters to rooms with tables", () => {
    const v = viewBuilding(AA, index, at(h(9)), filters({ tables: true }));
    expect(v.rooms.map((r) => r.room.room)).toEqual(["101", "201"]);
  });

  it("filters to starred rooms, and a starred building stars all its rooms", () => {
    const one = viewBuilding(AA, index, at(h(9)), filters({ starredOnly: true }), new Set(["AA 102"]));
    expect(one.rooms.map((r) => r.key)).toEqual(["AA 102"]);
    const all = viewBuilding(AA, index, at(h(9)), filters({ starredOnly: true }), new Set(["AA"]));
    expect(all.rooms).toHaveLength(3);
  });

  it("counts only rooms passing an extra room filter", () => {
    const v = viewBuilding(AA, index, at(h(11)), DEFAULT_FILTERS, new Set(), (k) => k === "AA 101");
    expect(v.rooms.map((r) => r.key)).toEqual(["AA 101"]);
    expect(v.freeCount).toBe(0); // AA 101 is in class at 11
  });

  it("caps estimated free counts at the rooms that match", () => {
    const v = viewBuilding(BB, index, at(h(13)), filters({ starredOnly: true }), new Set(["BB 1"]));
    expect(v.freeCount).toBe(1);
  });
});

describe("freeFor", () => {
  it("treats free-for-the-day as lasting until closing", () => {
    expect(freeFor({ kind: "free", until: null }, DAY_END - 60, 60)).toBe(true);
    expect(freeFor({ kind: "free", until: null }, DAY_END - 30, 60)).toBe(false);
    expect(freeFor({ kind: "unknown" }, h(10), 0)).toBe(false);
  });
});

describe("topPicks", () => {
  it("ranks rooms free longest first, then smaller rooms, and skips estimates", () => {
    const views = [AA, BB].map((b) => viewBuilding(b, index, at(h(12))));
    const picks = topPicks(views, h(12), 0, 6, 3);
    expect(picks.map((p) => p.view.key)).toEqual(["AA 201", "AA 101", "AA 102"]);
  });

  it("respects the time window", () => {
    const views = [viewBuilding(AA, index, at(h(12)))];
    expect(topPicks(views, h(12), 90, 6, 3).map((p) => p.view.key)).toEqual(["AA 201", "AA 101"]);
  });

  it("spreads picks across buildings by default", () => {
    const views = [AA, BB].map((b) => viewBuilding(b, index, at(h(12), false)));
    expect(topPicks(views, h(12), 0).map((p) => p.building.code)).toEqual(["AA", "BB"]);
  });
});

describe("dayStatus", () => {
  const calendar = {
    classesStart: "2026-09-08",
    classesEnd: "2026-12-08",
    noClasses: [{ start: "2026-10-26", end: "2026-10-30", label: "Fall Reading Week" }],
  };

  it("knows reading week and the term bounds", () => {
    expect(dayStatus(calendar, "2026-10-27")).toEqual({ classes: false, reason: "Fall Reading Week" });
    expect(dayStatus(calendar, "2026-10-30").classes).toBe(false);
    expect(dayStatus(calendar, "2026-11-02")).toEqual({ classes: true });
    expect(dayStatus(calendar, "2026-09-07").classes).toBe(false);
    expect(dayStatus(calendar, "2026-12-09").classes).toBe(false);
    expect(dayStatus(null, "2026-10-27").classes).toBe(true);
  });
});

describe("time helpers", () => {
  it("formats times and durations", () => {
    expect(formatTime(0)).toBe("12 AM");
    expect(formatTime(h(12) + 30)).toBe("12:30 PM");
    expect(formatTime(h(21) + 45)).toBe("9:45 PM");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(150)).toBe("2h 30m");
  });

  it("does date math across months", () => {
    expect(dayOfWeek("2026-10-27")).toBe(2);
    expect(dayOfWeek("2026-11-01")).toBe(7);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });

  it("lays out a month Monday-first", () => {
    const oct = monthGrid("2026-10"); // Oct 1, 2026 is a Thursday
    expect(oct).toHaveLength(5);
    expect(oct[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(oct[4]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    const feb = monthGrid("2027-02"); // starts on a Monday, 28 days
    expect(feb).toHaveLength(4);
    expect(feb[0][0]).toBe("2027-02-01");
    expect(feb[3][6]).toBe("2027-02-28");
  });

  it("formats dates", () => {
    expect(formatDate("2026-10-27")).toBe("Tue, Oct 27");
    expect(formatDate("2026-11-01", "long")).toBe("Sunday, November 1, 2026");
  });

  it("reads Toronto time, including across the DST change", () => {
    expect(torontoNow(new Date("2026-10-27T08:14:00Z"))).toEqual({ date: "2026-10-27", minute: 4 * 60 + 14 });
    expect(torontoNow(new Date("2026-12-01T15:00:00Z"))).toEqual({ date: "2026-12-01", minute: 10 * 60 });
    expect(torontoNow(new Date("2026-10-28T02:30:00Z"))).toEqual({ date: "2026-10-27", minute: 22 * 60 + 30 });
  });
});

describe("readUrl", () => {
  it("parses shared links and ignores junk", () => {
    expect(readUrl("?date=2026-11-03&t=14:30&for=60&size=small&tables=1&q=BA&demo=1")).toEqual({
      date: "2026-11-03",
      minute: h(14) + 30,
      filters: { minFor: 60, size: "small", tables: true, starredOnly: false },
      query: "BA",
      demo: true,
    });
    expect(readUrl("?size=constructor").filters.size).toBe("any");
    const junk = readUrl("?date=tomorrow&t=late&size=huge&for=abc");
    expect(junk.date).toBeNull();
    expect(junk.minute).toBeNull();
    expect(junk.filters).toEqual(DEFAULT_FILTERS);
  });
});
