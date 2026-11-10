# Last Rig Standing

A naval strategy game of attrition: find hidden oil, build rigs, grow your fleet, and outlast your opponent.
2–4 players on one screen (hot-seat), four map sizes from Small (24×14) to Huge (52×30).
With 2 players, homes are on the left and right; with 3–4, homes sit in the corners (and bottom-middle for 3).
A player with no ships, no rigs and less than $60 is knocked out. Last player left wins.

## Put it on GitHub Pages

1. Create a new repository on GitHub (for example `last-rig-standing`).
2. Upload everything in this folder (`index.html`, `css/`, `js/`) to the repository root.
   On the repo page: **Add file → Upload files**, drag the files in, commit.
3. Go to **Settings → Pages**. Under "Build and deployment", set Source to **Deploy from a branch**,
   pick **main** and **/ (root)**, then **Save**.
4. After a minute, your game is live at `https://YOUR-USERNAME.github.io/last-rig-standing/`.

To test on your own computer, the browser needs a local server (modules don't load from `file://`):
`python -m http.server` in this folder, then open http://localhost:8000.

## Where things live

| File | What it does |
|---|---|
| `js/data/ships.js` | **All balance numbers**: ships, costs, deposits, oil market, starting money, tier unlocks, map sizes, player colours |
| `js/engine.js` | Game rules. Pure logic, no graphics. Every change goes through `applyAction(state, action)` |
| `js/ui.js` | Draws the board and side panel, turns clicks into actions |
| `js/main.js` | Menu, saving, pass-the-device screens |

The game auto-saves in the browser after every action (Menu → Continue).

## Controls

- Click a ship to select it, then click a highlighted spot to move.
- **R** turns the selected ship (or the ship you're placing). **Esc** / right-click cancels.
- Pick an action in the side panel, then click a target on the board.

## Getting ready for online play (Firebase / Supabase)

The engine was built for this. The whole game is one JSON object, and every move is a small
action object like `{ type: 'move', shipId: 's4', x: 7, y: 3 }`. Online play means:

1. Store the game in the database (one document/row per game).
2. When a player acts, send the action; every client runs `applyAction()` on it.
3. Replace `save()` / `load()` in `main.js` with database reads/writes.

Known limitation to fix at that stage: in this version the full game state (including hidden
enemy positions) lives in each browser, which is fine on one screen but lets a player cheat online.
The fix is to run `applyAction()` on the server side (Firebase Cloud Functions or Supabase Edge
Functions) and send each player only `getView(state, player)`.
