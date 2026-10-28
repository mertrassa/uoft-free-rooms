"""Generate demo room-level data: give every TTB meeting in an LSM building a room.

This stands in for the real room data (e.g. from ACORN) so the app's exact mode can be
built and tested. Each meeting gets a random room in its own building that is not
already taken at that time; meetings that don't fit are dropped, as they would be in
departmental rooms LSM doesn't list. Seeded, so output is stable between runs.

Usage:
    python scripts/mock_rooms.py --session 20269 \
        --meetings data/meetings_20269.json --rooms data/rooms_lsm.json \
        --out data/mock_meetings_20269.json
"""

import argparse
import json
import random
from collections import defaultdict


def overlaps(a, b):
    return a["day"] == b["day"] and a["start"] < b["end"] and b["start"] < a["end"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default="20269")
    ap.add_argument("--meetings", default="data/meetings_20269.json")
    ap.add_argument("--rooms", default="data/rooms_lsm.json")
    ap.add_argument("--out", default="data/mock_meetings_20269.json")
    ap.add_argument("--seed", type=int, default=7)
    args = ap.parse_args()

    with open(args.rooms, encoding="utf-8") as f:
        rooms = defaultdict(list)
        for r in json.load(f):
            rooms[r["building"]].append(r["room"])
    with open(args.meetings, encoding="utf-8") as f:
        meetings = [m for m in json.load(f)
                    if m["campus"] == "St. George" and m["session"] == args.session and m["building"] in rooms]

    rng = random.Random(args.seed)
    taken = defaultdict(list)  # (building, room) -> meetings
    out, dropped = [], 0
    # Assigning in start-time order packs intervals into the fewest rooms.
    meetings.sort(key=lambda m: (m["building"], m["day"], m["start"], m["end"]))
    for m in meetings:
        free = [r for r in rooms[m["building"]] if not any(overlaps(m, o) for o in taken[(m["building"], r)])]
        if not free:
            dropped += 1
            continue
        room = rng.choice(free)
        taken[(m["building"], room)].append(m)
        out.append({**m, "room": room})

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)
    print(f"Assigned {len(out)} meetings to rooms, dropped {dropped} that didn't fit -> {args.out}")


if __name__ == "__main__":
    main()
