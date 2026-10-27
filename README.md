# Flashcards

A very simple flashcard app that installs on your phone like a normal app (PWA).
Piles, cards, learning mode, CSV import and export. Works offline. No server, no account:
your cards are stored only on the device.

## Features

- **Piles**: create, rename, delete, list (sorted by name, with card count)
- **Cards**: add, edit, delete; each card has a front and a back
- **Learn**: choose which side to show first, shuffle on/off (remembered).
  Tap the card to flip, then *Got it* (card is done) or *Again* (card comes back later in the round).
- **Import / export**: one CSV file per pile, same format both ways

## CSV format

```
Georgien
Cheers,Gagimarjos
Please,getaq’va
Hello,Gamartschoba
```

- Line 1 is the pile title, every following line is `front,back`.
- Comma or semicolon both work; the app detects which one a file uses.
- A field containing a comma, semicolon, quote or line break is wrapped in double quotes,
  and a quote inside it is doubled: `"Yes, please",Diakh` · `"He said ""hi""",…`
- Spaces around values and empty lines are ignored. Files must be UTF-8.
- If the first line already looks like a card (two values), the file name becomes the pile title.
- Importing a pile whose name already exists creates `Name (2)` instead of overwriting.
- Lines that aren't exactly one front and one back are skipped and reported after the import.
- Export writes commas and quotes only where needed, so an exported file imports back unchanged.

`samples/georgien.csv` is a ready-made example.

## Project structure

```
index.html              page shell
manifest.webmanifest    app name, icon, colours, standalone display (makes it installable)
sw.js                   service worker: offline cache + background updates
css/styles.css          all styling (light and dark)
js/app.js               screens, navigation, dialogs, learn mode, import/export
js/db.js                storage on the device (IndexedDB)
js/csv.js               CSV parsing and writing
icons/                  app icons
samples/                example CSV
```

No build step and no dependencies: edit a file, commit, done.

## Put it on GitHub Pages

1. On github.com: **New repository** → name it e.g. `flashcards` → **Public** → Create.
   (GitHub Pages is free for public repos. Only the code is public; your cards stay on your phone.)
2. **Add file → Upload files** → drag in the *contents* of this folder
   (`index.html` must be at the top level of the repo, not inside a subfolder) → Commit.
3. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch **main**, folder **/ (root)** → Save.
4. After about a minute the app is live at `https://<your-username>.github.io/flashcards/`.

Using git instead of the web upload:

```bash
cd flashcards
git init -b main
git add .
git commit -m "Flashcards v1"
git remote add origin https://github.com/<your-username>/flashcards.git
git push -u origin main
```

## Install on the phone (Samsung Galaxy, Chrome)

1. Open the GitHub Pages URL in **Chrome**.
2. Tap **⋮ → Add to home screen → Install** (Chrome may also show an *Install app* banner).
3. Open it from the new home-screen icon: full screen, no address bar, works offline.

Samsung Internet works too (*Menu → Add page to → Home screen*), but use one browser
consistently: each browser keeps its own copy of the data.

## Updating the app

1. Change the files and commit/push.
2. In `sw.js`, raise `CACHE_VERSION` (`'v1'` → `'v2'`) whenever you change a file.
3. On the phone, open the app; the update is picked up in the background and shows
   from the next launch (close it fully from recent apps and reopen).

Your piles survive updates; they live in the browser's storage for this site, not in the files.

## Keeping your data safe

Uninstalling the app, clearing Chrome's site data, or changing the GitHub URL (e.g. renaming
the repo) starts with an empty app. Use **Export all piles as CSV** on the home screen
as a backup and to move piles between devices.

## Testing locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Service workers need `https://` or `localhost`; opening `index.html` directly as a file won't work.
