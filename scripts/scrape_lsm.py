"""Scrape St. George's centrally booked classrooms from LSM Room Info.

LSM (lsm.utoronto.ca/webapp/f?p=210) is an Oracle APEX app; its building and room
selects can be set straight from the URL, so each room is one GET.

Usage:
    python scripts/scrape_lsm.py --out data/rooms_lsm.json
"""

import argparse
import html
import http.cookiejar
import json
import os
import re
import time
import urllib.request

BASE = "https://lsm.utoronto.ca/webapp/f?p=210:1"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def get(url):
    with opener.open(url, timeout=60) as resp:
        return resp.read().decode("latin-1")


def options(page, select_id):
    select = re.search(rf'<select  id="{select_id}".*?</select>', page, re.S).group(0)
    out = []
    for value, label in re.findall(r'<option value="([^"]*)"[^>]*>([^<]*)</option>', select):
        value, label = html.unescape(value), html.unescape(label).strip()
        if value != "%null%":
            out.append((value, label))
    return out


def page_text(page):
    page = re.sub(r"<script.*?</script>|<style.*?</style>", " ", page, flags=re.S)
    return html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", page)))


def field(text, name):
    m = re.search(rf"{name} (.+?)(?= Testing Capacity| Seating Type| Writing Surface| Teaching station| Click to View|$)", text)
    return m.group(1).strip() if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/rooms_lsm.json")
    ap.add_argument("--delay", type=float, default=0.5, help="seconds between requests")
    args = ap.parse_args()

    first = get(BASE)
    session = re.search(r'name="p_instance" value="(\d+)"', first).group(1)
    buildings = options(first, "P1_BLDG")

    rooms = []
    for code, label in buildings:
        name = label.split(" ", 1)[1] if " " in label else label
        bpage = get(f"{BASE}:{session}::NO::P1_BLDG,P1_ROOM:{code},")
        # The name also appears in the building dropdown; the address follows its last use.
        tail = page_text(bpage).rsplit(name, 1)[-1]
        address = tail.split(" Toronto, Ontario")[0].strip() if " Toronto, Ontario" in tail else None
        for room, room_label in options(bpage, "P1_ROOM"):
            time.sleep(args.delay)
            text = page_text(get(f"{BASE}:{session}::NO::P1_BLDG,P1_ROOM:{code},{room}"))
            capacity = field(text, "Room Capacity")
            rooms.append({
                "building": code,
                "buildingName": name,
                "address": address,
                "room": room,
                "label": room_label,
                "capacity": int(capacity) if capacity and capacity.isdigit() else None,
                "seating": field(text, "Seating Type"),
                "writing": field(text, "Writing Surface"),
            })
        print(f"{code} {name}: {sum(1 for r in rooms if r['building'] == code)} rooms")
        time.sleep(args.delay)

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(rooms, f, indent=1)
    print(f"Wrote {len(rooms)} rooms in {len(buildings)} buildings to {args.out}")


if __name__ == "__main__":
    main()
