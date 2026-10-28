"""Pull every course meeting for a session from UofT's Timetable Builder API.

The public API (the one ttb.utoronto.ca calls) returns, per meeting: day, start/end
time and building code. Room numbers are blank in the public response.

Usage:
    python scripts/fetch_ttb.py --session 20269 --out data/meetings_20269.json
"""

import argparse
import json
import time
import urllib.error
import urllib.request

API = "https://api.easi.utoronto.ca/ttb/getPageableCourses"
DIVISIONS = ["APSC", "ARTSC", "FIS", "FPEH", "MUSIC", "ARCLA", "ERIN", "SCAR"]
PAGE_SIZE = 20  # the API caps pages at 20 regardless of what is requested
DAYS = {1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 7: "Sun"}


def fetch_page(session, division, page):
    body = {
        "courseCodeAndTitleProps": {"courseCode": "", "courseTitle": "", "courseSectionCode": ""},
        "departmentProps": [], "campuses": [], "sessions": [session], "requirementProps": [],
        "instructor": "", "courseLevels": [], "deliveryModes": [], "dayPreferences": [],
        "timePreferences": [], "divisions": [division], "creditWeights": [],
        "availableSpace": False, "waitListable": False,
        "page": page, "pageSize": PAGE_SIZE, "direction": "asc",
    }
    req = urllib.request.Request(
        API, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "Accept": "application/json",
                 "Referer": "https://ttb.utoronto.ca/"},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            payload = json.loads(resp.read().decode("utf-8"))["payload"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        payload = None  # TTB answers "no courses" (e.g. no Y courses in a division) with a 404
    return payload["pageableCourse"] if payload else {"courses": [], "total": 0}


def sessions_for(session):
    """TTB files full-year (Y) courses under a combined session, e.g. "20269-20271"."""
    year, term = int(session[:4]), session[4]
    if term == "9":
        return [session, f"{session}-{year + 1}1"]
    if term == "1":
        return [session, f"{year - 1}9-{session}"]
    return [session]


def hhmm(ms):
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}"


def meetings_for(course):
    for section in course["sections"]:
        if section.get("cancelInd") == "Y":
            continue
        for m in section["meetingTimes"]:
            b = m.get("building") or {}
            if not b.get("buildingCode"):
                continue  # online / TBA
            yield {
                "course": course["code"] + course["sectionCode"],
                "section": section["name"],
                "campus": course["campus"],
                "building": b["buildingCode"],
                "room": (b.get("buildingRoomNumber") or "") + (b.get("buildingRoomSuffix") or ""),
                "day": DAYS.get(m["start"]["day"], m["start"]["day"]),
                "start": hhmm(m["start"]["millisofday"]),
                "end": hhmm(m["end"]["millisofday"]),
                "session": m["sessionCode"],
            }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--session", default="20269", help="e.g. 20269 = Fall 2026, 20271 = Winter 2027")
    ap.add_argument("--out", default="data/meetings.json")
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between requests")
    args = ap.parse_args()

    meetings = []
    for session in sessions_for(args.session):
        for division in DIVISIONS:
            page = 1
            while True:
                result = fetch_page(session, division, page)
                for course in result["courses"]:
                    meetings.extend(meetings_for(course))
                total = result.get("total") or 0
                print(f"{session} {division} page {page}/{-(-total // PAGE_SIZE)}  meetings so far: {len(meetings)}", flush=True)
                if page * PAGE_SIZE >= total:
                    break
                page += 1
                time.sleep(args.delay)

    import os
    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(meetings, f, indent=1)
    with_room = sum(1 for m in meetings if m["room"])
    print(f"Wrote {len(meetings)} meetings to {args.out} ({with_room} with a room number)")


if __name__ == "__main__":
    main()
