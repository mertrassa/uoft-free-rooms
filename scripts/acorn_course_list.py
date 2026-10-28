"""List the St. George courses to look up in ACORN, from the TTB meetings file.

Prints a JSON array like ["CSC108H1F", "MAT137Y1Y", ...] (course code + section code)
for scripts/acorn_rooms.js. Only courses with an in-person meeting in a building LSM
lists are included, since only those rooms appear in the app.

Usage:
    python scripts/acorn_course_list.py --session 20269 > data/acorn_courses_20269.json
"""

import argparse
import json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default="20269")
    ap.add_argument("--meetings", default="data/meetings_20269.json")
    ap.add_argument("--rooms", default="data/rooms_lsm.json")
    args = ap.parse_args()

    with open(args.rooms, encoding="utf-8") as f:
        buildings = {r["building"] for r in json.load(f)}
    with open(args.meetings, encoding="utf-8") as f:
        courses = sorted({
            m["course"] for m in json.load(f)
            if m["campus"] == "St. George" and m["session"] == args.session and m["building"] in buildings
        })
    print(json.dumps(courses))


if __name__ == "__main__":
    main()
