# Free Rooms · UofT

Find empty classrooms at UofT St. George to study in. Live at
**https://mertrassa.github.io/uoft-free-rooms/**.

Free Rooms is an open source, student-run project, and everyone is welcome to take part: report a
class we're missing, check other people's reports, suggest ideas, or send a pull request. Start
with [CONTRIBUTING.md](CONTRIBUTING.md).

> **About the ACORN data.** Room numbers for classes come from ACORN, read one course at a time
> with a student's own login, the same way the course details pop-up shows them. If this use of
> ACORN data is not permitted, please open an issue on this repository (or contact the maintainer)
> and it will be removed from the app. Free Rooms would then switch to a survey-based approach,
> where students report which room each class meets in.

## Features

- **Free classrooms by date and time**: live by default (Toronto time), or pick any term date from the calendar.
- **Term calendar**: knows reading weeks, holidays and term start/end, says when no classes run, and marks those days in the date picker.
- **"Free for at least" filter** (30 min to 3 hours), **room size**, **full desks** (hides the ~100 rooms with
  only tablet-arm chairs, labs, or no writing surface).
- **Labs & dept rooms** (off by default): adds the ~170 labs and departmental rooms that classes meet
  in but LSM doesn't list (e.g. BA 3145), with Busy/Free from their classes. They may need card
  access and can be booked outside class times, so they're never Best bets and have no seat counts.
  Searching for one by name ("BA 3145") shows it either way.
- **Light, dark or auto theme**, remembered per browser.
- **Best bets**: the rooms that stay free longest from the chosen time, one per building. Shown only where room schedules are known.
- **Room timelines**: tap a room to see its classes that day.
- **Report a class**: each room's timeline has a "Report it" link for classes our sources miss (e.g.
  department-booked tutorials). It opens a pre-filled GitHub issue; see [Student reports](#student-reports).
  A message at the top (dismissible, remembered per browser) and a footer line invite students to
  report their own classes we're missing.
- **Stars**: star buildings or rooms; they sort first and can be filtered to. Saved in the browser.
- **Directions** to each building, and **shareable links** (the URL keeps the date, time, filters and search).
- Works on phones; light and dark mode.

## Layout

- `scripts/fetch_ttb.py`: pulls every course meeting (day, time, building) from Timetable Builder's public API.
- `scripts/scrape_lsm.py`: pulls the centrally booked classrooms (address, capacity, seating, writing surface) from LSM Room Info.
- `scripts/mock_rooms.py`: demo data. Assigns each meeting a random free room in its building.
- `scripts/build_data.py`: merges everything into `web/public/data/campus.json`, the one file the app loads.
- `data/calendar.json`: term dates and no-class days per session. Check it each term.
- `web/`: the app (Vite + React + TypeScript). Builds to a static site.

## Refresh the data (once per term)

```bash
python scripts/fetch_ttb.py --session 20269 --out data/meetings_20269.json
python scripts/scrape_lsm.py --out data/rooms_lsm.json
python scripts/build_data.py --session 20269 --meetings data/meetings_20269.json --rooms data/rooms_lsm.json
```

Session codes: `YYYY9` = Fall, `YYYY1` = Winter, `YYYY5` = Summer. `fetch_ttb.py` also pulls the
full-year (Y) courses, which TTB files under the combined session `YYYY9-YYYY+11`.

### Room data from ACORN

Timetable Builder leaves rooms blank; ACORN's course details have them. `scripts/acorn_rooms.js` runs
inside a signed-in ACORN tab and makes the same read-only request the course details pop-up makes,
one course every 2 seconds (the full St. George list takes about an hour; run it during the day).

1. `python scripts/acorn_course_list.py --session 20269 > data/acorn_courses_20269.json`
2. Sign in to ACORN, go to Enrol & Manage > Courses, and open any course's details pop-up once, then close it.
3. Paste `scripts/acorn_rooms.js` into that tab's console, then run `acornRooms(<the course list>)`.
   Progress is in `window.__acornRooms`; `acornRoomsStop()` stops it.
   ACORN signs out after roughly 15–20 minutes without a click, and its server session can end
   sooner. The script then stops with a message; progress is saved in the browser's localStorage
   every 25 courses, so sign in again, repeat step 2, paste the script and rerun with the same list.
   Keep to about one request every 2 seconds: at 1.5 s ACORN answered HTTP 429 (too many requests).
4. `acornRoomsDownload("acorn_meetings_20269.json")`, move the file into `data/`, and rebuild.
   `acornRoomsClear()` then drops the saved progress.

**Graduate and professional-faculty courses** (SGS, Law, Dentistry, Pharmacy, Toronto School of
Theology...) aren't in Timetable Builder. Their course list comes from ACORN's course search, one
search per subject code:

1. `python scripts/sgs_subjects.py` writes the graduate subject codes (from the public SGS Calendar).
2. In the ACORN tab, type any course code into the search box once, then run
   `acornCourseSearch(<the subject codes>)`. It returns St. George courses for the session that TTB
   doesn't list (Fall 2026: 2,696 courses, many of them thesis or reading courses with no class times).
3. Pull them with `acornRooms(<that list>)` as above and save as `acorn_grad_meetings_20269.json`.

```bash
python scripts/build_data.py --meetings data/meetings_20269.json data/acorn_meetings_20269.json data/acorn_grad_meetings_20269.json
```

### Student reports

Some rooms are booked by departments directly (often tutorials, e.g. SS 2120), so neither ACORN nor
Timetable Builder lists them. Reports come in as issues labelled `room-report`
([form](.github/ISSUE_TEMPLATE/room-report.yml)). Once a report looks right, add it to
`data/reports_<session>.json`, rebuild, and close the issue:

```json
[{ "building": "SS", "room": "2120", "days": ["Tue", "Thu"], "start": "14:00", "end": "15:00",
   "label": "Tutorial", "issue": 12 }]
```

Those rooms then show "Reported class" at those times, hatched in the timeline. A report that overlaps
a class already listed in that room is skipped.

Demo data (what the app looks like with full room schedules), served at `?demo=1`:

```bash
python scripts/mock_rooms.py --session 20269
python scripts/build_data.py --demo --meetings data/mock_meetings_20269.json --out web/public/data/campus.demo.json
```

## Live site

https://mertrassa.github.io/uoft-free-rooms/ (deployed by `.github/workflows/pages.yml` on every push to `main`).

## Run and test

```bash
cd web
npm install
npm run dev     # http://localhost:5173, demo at http://localhost:5173/?demo=1
npm test        # logic tests plus checks on both shipped data files
npm run build   # static site in web/dist/
```

## Contributing

Contributions of every size are welcome, from a one-line fix to a new feature. See
[CONTRIBUTING.md](CONTRIBUTING.md) for how to set up, what to work on, and how pull requests are
reviewed. Issues labelled [`room-report`](https://github.com/mertrassa/uoft-free-rooms/labels/room-report)
are classes students have reported; help checking them is always appreciated.

## License

The code is free software under the [GNU General Public License v3.0](LICENSE): you may use, study,
change and share it, and anything you distribute that builds on it must be under the GPL too. The
class and room data in `data/` and `web/public/data/` come from University of Toronto sources and
aren't covered by this license.

## Accuracy

With the ACORN pull merged in (Fall 2026: 1,733 courses, 6,883 meetings, all with a room), every
building with classes has exact per-room Busy/Free status. Graduate and professional-faculty courses
are in too: 2,694 of 2,696 courses pulled (1,056 have class times, 1,801 meetings). ENV1199YF and
ENV2000HF return a server error from ACORN every time. Asynchronous online sections and meetings with
no weekday are skipped. Joint courses (e.g. CSC469H1 with CSC2208H) count once. Without it, Timetable Builder alone has
the building but not the room, so the app estimates free rooms per building (classrooms minus
classes in session) and marks those counts with "~". A building switches to exact status once at
least 90% of its meetings carry a room. Classes in rooms LSM doesn't book (labs, studios,
departmental rooms) count as placed, since they don't occupy a listed classroom; `build_data.py` adds
those rooms (marked `dept`) to buildings LSM lists. Another ~100 such rooms are in buildings LSM
doesn't list at all and aren't shown, since we have no names or addresses for them. A room stays busy
through back-to-back classes (gaps of 10 minutes or less). Showing a busy room as free costs more
trust than the reverse, so classrooms that are rarely listed while their building is busy (under 6
weekday hours between 9 and 6, and under a quarter of the building's typical classroom; e.g. SS 2120
with none, or UC 51) show "Likely booked" instead of free: their department probably books them
directly, often for tutorials. Fall 2026 has 10 such rooms. Reported classes count toward a room's
listed hours. Buildings with fewer weekly classes in
our sources than classrooms show "No class data" instead of a count: the Exam Centre has none, and
Rehabilitation Sciences has only 3 for 43 rooms, since most of its courses list no times in ACORN.
