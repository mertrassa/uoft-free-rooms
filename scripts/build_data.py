"""Merge TTB meetings and LSM rooms into the single file the web app loads.

Output (web/public/data/campus.json):
    buildings: [{code, name, address, rooms: [{room, label, capacity, seating, writing, dept?}]}]
               (dept: a lab or departmental room LSM doesn't list, known only from class data)
    meetings:  [[building, room or "", day 1-7 (Mon=1), startMin, endMin, "COURSE SECTION", reported?]]
               (reported: 1 for a checked student report, see --reports)
    calendar:  {classesStart, classesEnd, noClasses: [{start, end, label}]} for the session

Meetings with a room mark that room busy. Meetings without one only count toward
their building's load. Room data pulled later (e.g. from ACORN) can be merged in by
passing more --meetings files; rows with a room win over rows without one, and joint
courses meeting in the same room at the same time become one meeting.

Usage:
    python scripts/build_data.py --session 20269 \
        --meetings data/meetings_20269.json --rooms data/rooms_lsm.json

Demo build with mock room data (see mock_rooms.py):
    python scripts/build_data.py --demo --meetings data/mock_meetings_20269.json \
        --out web/public/data/campus.demo.json
"""

import argparse
import datetime
import json
import os

DAY_INDEX = {"Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6, "Sun": 7}
TERMS = {"9": "Fall", "1": "Winter", "5": "Summer"}


def minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default="20269")
    ap.add_argument("--meetings", nargs="+", default=["data/meetings_20269.json"])
    ap.add_argument("--rooms", default="data/rooms_lsm.json")
    ap.add_argument("--calendar", default="data/calendar.json")
    ap.add_argument("--reports", help="checked student reports (default: data/reports_<session>.json if it exists)")
    ap.add_argument("--out", default="web/public/data/campus.json")
    ap.add_argument("--demo", action="store_true", help="mark the output as demo data")
    args = ap.parse_args()

    with open(args.rooms, encoding="utf-8") as f:
        lsm = json.load(f)
    buildings = {}
    for r in lsm:
        b = buildings.setdefault(r["building"], {
            "code": r["building"], "name": r["buildingName"],
            "address": (r.get("address") or "").rstrip(".") or None, "rooms": [],
        })
        b["rooms"].append({k: r.get(k) for k in ("room", "label", "capacity", "seating", "writing")})

    # meeting key -> {(building, room): row}. Rows with a room replace the same meeting
    # without one; a section can meet in several rooms at once (e.g. split practicals),
    # so every room is kept.
    placed, unplaced = {}, {}
    for path in args.meetings:
        with open(path, encoding="utf-8") as f:
            for m in json.load(f):
                if m["campus"] != "St. George" or m["session"] != args.session:
                    continue
                if m["building"] not in buildings:
                    continue  # departmental building, no LSM room list
                if m["day"] not in DAY_INDEX:
                    continue  # no weekday (asynchronous online sections, day TBA)
                key = (m["course"], m["section"], m["day"], m["start"])
                row = [m["building"], m["room"], DAY_INDEX[m["day"]],
                       minutes(m["start"]), minutes(m["end"]), f'{m["course"]} {m["section"]}']
                if m["room"]:
                    placed.setdefault(key, {})[(m["building"], m["room"])] = row
                else:
                    unplaced[key] = row
    # Joint courses (e.g. CSC401H1F with CSC2511H) are one class in one room: merge rows in the
    # same room at the same time into a single meeting listing every course.
    slots = {}
    for rooms in placed.values():
        for r in rooms.values():
            slot = tuple(r[:5])
            if slot in slots:
                if r[5] not in slots[slot][5].split(" / "):
                    slots[slot][5] += f" / {r[5]}"
            else:
                slots[slot] = list(r)
    rows = list(slots.values())
    rows += [r for key, r in unplaced.items() if key not in placed]

    # Classes students reported (via the app's "Report it" link) and a maintainer checked:
    #   [{"building": "SS", "room": "2120", "days": ["Tue", "Thu"], "start": "14:00", "end": "15:00",
    #     "label": "Tutorial", "issue": 12}]
    # Each becomes a meeting flagged as reported (7th field), unless a listed class already covers it.
    reports_path = args.reports or f"data/reports_{args.session}.json"
    n_reports = 0
    if os.path.exists(reports_path):
        with open(reports_path, encoding="utf-8") as f:
            reports = json.load(f)
        for rep in reports:
            if rep["building"] not in buildings:
                print(f"skipping report #{rep.get('issue')}: no building {rep['building']}")
                continue
            for day in rep["days"]:
                row = [rep["building"], rep["room"], DAY_INDEX[day], minutes(rep["start"]), minutes(rep["end"]),
                       rep.get("label") or "Class", 1]
                if any(r[:3] == row[:3] and r[3] < row[4] and row[3] < r[4] for r in rows):
                    continue  # already listed
                rows.append(row)
                n_reports += 1

    # Rooms LSM doesn't book (labs, studios, departmental rooms) but classes meet in. They have
    # no capacity or seating data; the app hides them unless asked.
    listed = {(b["code"], r["room"]) for b in buildings.values() for r in b["rooms"]}
    for code, room in sorted({(r[0], r[1]) for r in rows if r[1]} - listed):
        buildings[code]["rooms"].append(
            {"room": room, "label": room, "capacity": None, "seating": None, "writing": None, "dept": True})

    calendar = None
    if os.path.exists(args.calendar):
        with open(args.calendar, encoding="utf-8") as f:
            calendar = json.load(f).get(args.session)

    year, term = args.session[:4], TERMS.get(args.session[4], "")
    data = {
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "session": args.session,
        "termLabel": f"{term} {year}".strip(),
        "demo": args.demo,
        "calendar": calendar,
        "buildings": sorted(buildings.values(), key=lambda b: b["code"]),
        "meetings": sorted(rows),
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))

    with_room = sum(1 for r in rows if r[1])
    n_rooms = sum(len(b["rooms"]) for b in buildings.values())
    n_dept = sum(1 for b in buildings.values() for r in b["rooms"] if r.get("dept"))
    print(f"{len(buildings)} buildings, {n_rooms} rooms ({n_dept} labs or departmental), "
          f"{len(rows)} meetings ({with_room} with a room, {n_reports} reported) -> {args.out}")


if __name__ == "__main__":
    main()
