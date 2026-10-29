// Runs the shipped data files through the app's logic, so a bad data build fails here.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DAY_END, DAY_START, DEFAULT_FILTERS, buildIndex, topPicks, viewBuilding } from "./availability";
import type { CampusData } from "./types";

const load = (name: string): CampusData =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../public/data/${name}`, import.meta.url)), "utf-8"));

for (const name of ["campus.json", "campus.demo.json"]) {
  describe(name, () => {
    const data = load(name);
    const index = buildIndex(data);
    const codes = new Set(data.buildings.map((b) => b.code));

    it("has buildings, rooms, meetings and a calendar", () => {
      expect(data.buildings.length).toBeGreaterThan(30);
      expect(data.buildings.every((b) => b.rooms.some((r) => !r.dept))).toBe(true);
      expect(data.meetings.length).toBeGreaterThan(1000);
      expect(data.calendar?.classesStart).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("has well-formed meetings in known buildings", () => {
      for (const [b, , day, start, end] of data.meetings) {
        expect(codes.has(b)).toBe(true);
        expect(day >= 1 && day <= 7).toBe(true);
        expect(start).toBeLessThan(end);
      }
    });

    it("gives consistent counts at every quarter hour of the week", () => {
      for (let day = 1; day <= 5; day++) {
        for (let minute = DAY_START; minute < DAY_END; minute += 15) {
          for (const dept of [false, true]) {
            const f = { ...DEFAULT_FILTERS, dept };
            const views = data.buildings.map((b) => viewBuilding(b, index, { day, minute, classes: true }, f));
            for (const v of views) {
              expect(v.freeCount).toBeGreaterThanOrEqual(0);
              expect(v.freeCount).toBeLessThanOrEqual(v.total);
              expect(v.rooms).toHaveLength(v.total);
              if (v.exact) {
                const notFree = v.rooms.filter((r) => r.status.kind === "busy" || r.status.kind === "unlisted").length;
                expect(v.freeCount + notFree).toBe(v.total);
              }
            }
            for (const p of topPicks(views, minute, 0)) {
              expect(p.view.status.kind).toBe("free");
              expect(p.view.room.dept).toBeFalsy();
            }
          }
        }
      }
    });
  });
}

describe("campus.json rarely listed rooms", () => {
  const data = load("campus.json");
  const index = buildIndex(data);

  it("include the department-booked rooms we know about, and stay few", () => {
    expect(index.rarelyListed.has("SS 2120")).toBe(true);
    expect(index.rarelyListed.has("UC 51")).toBe(true);
    expect(index.rarelyListed.size).toBeLessThan(30);
  });
});

describe("demo data", () => {
  const data = load("campus.demo.json");

  it("is marked as demo and has every building with classes exact", () => {
    expect(data.demo).toBe(true);
    const index = buildIndex(data);
    expect(index.exactBuildings.size).toBe(index.byBuilding.size);
  });

  it("never double-books a room", () => {
    const slots = new Map<string, [number, number][]>();
    for (const [b, r, day, start, end] of data.meetings) {
      const key = `${b} ${r} ${day}`;
      slots.set(key, [...(slots.get(key) ?? []), [start, end]]);
    }
    for (const list of slots.values()) {
      list.sort((a, z) => a[0] - z[0]);
      for (let i = 1; i < list.length; i++) expect(list[i][0]).toBeGreaterThanOrEqual(list[i - 1][1]);
    }
  });
});
