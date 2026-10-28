"""List the subject codes (e.g. "CSC", "APD") of St. George graduate courses.

Timetable Builder has no graduate courses. ACORN does, but its course search needs at least a
three-letter prefix, so this reads the public SGS Calendar course search (all campuses: ACORN
says which campus each course is on) and keeps the distinct subject codes, to search ACORN once
per subject.

Usage:
    python scripts/sgs_subjects.py --out data/sgs_subjects.json
"""

import argparse
import json
import re
import time
import urllib.request

URL = "https://sgs.calendar.utoronto.ca/search-courses?page={page}"
# Codes in the page text: not every listed course links to its own page.
CODE = re.compile(r"\b([A-Z]{3})(\d{4})[HYL]\b")
LAST_PAGE = re.compile(r"[?&]page=(\d+)")


def fetch(page):
    req = urllib.request.Request(URL.format(page=page), headers={"User-Agent": "free-rooms/0.1 (student project)"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read().decode("utf-8", "replace")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/sgs_subjects.json")
    ap.add_argument("--delay", type=float, default=1.0, help="seconds between pages")
    args = ap.parse_args()

    first = fetch(0)
    last = max((int(p) for p in LAST_PAGE.findall(first)), default=0)
    codes = set()
    for page in range(last + 1):
        html = first if page == 0 else fetch(page)
        codes |= {m.group(1) + m.group(2) for m in CODE.finditer(html)}
        subjects = {c[:3] for c in codes}
        print(f"page {page}/{last}: {len(codes)} courses, {len(subjects)} subjects so far", flush=True)
        time.sleep(args.delay)
    courses = len(codes)

    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(sorted(subjects), f)
    print(f"Wrote {len(subjects)} subject codes ({courses} calendar courses) to {args.out}")


if __name__ == "__main__":
    main()
