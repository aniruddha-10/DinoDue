# DinoDue

Your UCalgary D2L deadlines, grade weights, and a weekly workload forecast,
in a Chrome extension. Everything runs in your browser: DinoDue reads D2L
while you're signed in and keeps the results in `chrome.storage.local`.

Not affiliated with the University of Calgary or D2L.

## Build

    npm install
    npm test
    npm run build

Then open chrome://extensions, turn on Developer mode, click "Load unpacked",
and pick the `dist` folder. After changing code, run `npm run build` again and
click the reload icon on the extension card.

To preview the popup in a normal browser tab with sample data (no extension
or D2L needed):

    npm run dev

then open http://localhost:5179/?state=main (or `welcome`, `picker`, `quiet`,
`signedOut`).

Requires Node 20+. (Vite 6 / Vitest 3 are used because Node 20.15 is too old
for Vite 7+.)

## How the code is laid out

- `src/types.ts`: the clean shapes everything else uses.
- `src/d2l/api.ts`: every request to D2L, and the raw response shapes.
- `src/d2l/normalize.ts`: course picking, and raw items into Deadlines.
- `src/d2l/weights.ts`: gradebook weights into "share of the final grade".
- `src/d2l/link.ts`: tying deadlines to gradebook entries.
- `src/d2l/sync.ts`: the whole fetch, step by step.
- `src/content/index.ts`: when syncing happens (runs on D2L pages).
- `src/shared/forecast.ts`: this week's "weather" and the Up next lists.
- `src/shared/format.ts`, `colors.ts`, `i18n.ts`: dates, course colours, text.
- `src/popup/`: the popup (course picker, forecast, deadlines).
- `dev/`: a stand-in for the chrome.* APIs used by `npm run dev`.
- `probe/`: the scripts used to check what UCalgary's D2L API allows.
  Their findings are summarized in the comments of the files above.

## Localization

User-facing text lives in `public/_locales/<lang>/messages.json` (Chrome's
`chrome.i18n`). Code stores codes (like sync error codes), not sentences; the
UI turns them into localized text.
