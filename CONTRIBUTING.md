# Contributing to Free Rooms

Free Rooms is an open source, student-run project, and anyone is welcome to help: you don't need
to be a UofT student, a programmer, or an expert. Thank you for being here!

## Ways to help

- **Report a class we're missing.** If a tutorial, lab, lecture or seminar meets in a room the app
  shows as free, open that room in the app and tap **Report it**, or use the
  [report form](https://github.com/mertrassa/uoft-free-rooms/issues/new?template=room-report.yml).
  This is the single most useful thing you can do.
- **Check reports.** Look through [open room reports](https://github.com/mertrassa/uoft-free-rooms/issues?q=is%3Aopen+label%3Aroom-report)
  and comment if you can confirm or correct one (e.g. "my tutorial is there too, Thursdays").
- **Report a bug or suggest an idea.** [Open an issue](https://github.com/mertrassa/uoft-free-rooms/issues/new)
  describing what you saw, what you expected, and the link from your address bar (it holds the date,
  time and filters).
- **Improve the code, design or docs.** Pick an open issue (or propose one), then send a pull request.

## Working on the code

You need [Node.js](https://nodejs.org/) 22 and, for the data scripts, Python 3.

```bash
git clone https://github.com/mertrassa/uoft-free-rooms.git
cd uoft-free-rooms/web
npm install
npm run dev     # http://localhost:5173 (demo data at ?demo=1)
npm test        # must pass before you open a pull request
```

The app is plain React + TypeScript with no state library. Start with:

- `web/src/availability.ts`: all the free/busy logic, fully covered by `availability.test.ts`.
  If you change how rooms are judged free, add or update a test there.
- `web/src/App.tsx` and `web/src/components.tsx`: the page.
- `scripts/build_data.py`: merges the data sources into `web/public/data/campus.json`.

See the [README](README.md) for how the data is built and how accurate it is.

## Pull requests

1. Fork the repo and create a branch from `main`.
2. Keep each pull request to one change, and describe what it does and why.
3. Run `npm test` and `npm run build` in `web/`; both must pass (GitHub runs them too).
4. For visible changes, add a screenshot, and check that it works on a phone-sized screen and in
   both light and dark mode.

A maintainer will review it, usually within a few days. Don't worry about getting everything right
the first time: we'll work it out together in the review.

### Our one firm rule: trust

The app must never show a room as free when we have reason to think it isn't. When in doubt, show
it as busy, "Likely booked" or unknown. A student who walks to a "free" room and finds a class in it
stops using the app.

## Data and ACORN

Room numbers come from ACORN, read with a student's own login. If you help with data pulls:

- Only make the read-only course-details requests that `scripts/acorn_rooms.js` makes; never touch
  enrolment, the cart or anything else in ACORN.
- Keep to one request every 15–20 seconds, and stop at the first HTTP 429.
- Never commit anything personal: no session IDs, cookies, student numbers or account details.
  The pulled files contain only course codes, times and rooms.

If the University asks for ACORN data not to be used, it will be removed and the app will rely on
student reports instead.

## Code of conduct

Be kind and patient. Assume good intent, welcome newcomers, and keep feedback about the work, not the
person. Harassment of any kind isn't tolerated; maintainers may remove comments or contributors that
break this.

## License

Free Rooms is licensed under the [GNU GPL v3](LICENSE). By contributing, you agree that your
contributions are licensed under it too.
