# Last Rig Standing

A naval strategy game of attrition: find hidden oil, build rigs, grow your fleet, and outlast your opponents.
2–4 players on one screen (hot-seat), on huge generated worlds of continents, islands and open ocean:

| Map | Size |
|---|---|
| Small | 150×100 |
| Standard | 200×130 |
| Large | 260×170 |
| Huge | 320×210 |

**Ways to win** (pick on the new-game screen; Conquest is always on):
- ⚔️ **Conquest:** wreck or capture every rival Admiralty. Lose yours and you have 5 turns to rebuild or move it.
- 🗺️ **Domination:** control 40% of all claimed sea (and at least 6% of the map's water) for 6 rounds.
- ⚛️ **Post-Oil:** research Era V and finish a Deep-Sea Fusion Plant at a Hub base (10 turns, everyone is warned).
- 🛢️ **Last Rig Standing:** when the world's oil drops to 15%, a 10-round countdown starts; most oil left in the ground wins.

Economy: every deposit starts with a random amount of oil (smaller at home, larger in No Man's Sea), ships and platforms
cost upkeep every turn, and you can only store so much oil. Everyone starts with 2 patrol boats, 2 survey ships, 40 oil
and $400. The oil price is shared: heavy selling drops it, and it recovers each turn. A player with no ships, no rig
that still pumps oil and under $60 is out.

**Rig bases.** Building a rig on a deposit founds a base that claims the water around it (3×3, growing to 13×13).
Build platforms inside the claim (Wellheads for extra deposits, Storage, Research Labs, Pumps, Gun Platforms, Radar,
Dry Docks, Refineries, AA, Helipads, Missile Batteries) and upgrade the base from Outpost to Station, Complex and Hub.

**Shipyards, fleets and standing orders.** Ships are paid for up front and built over 1–6 turns at a shipyard
(your Home Yard, forward ports and Dry Docks), then launch next to the yard. Group ships into **fleets** that sail
together in formation at the speed of the slowest ship. Give ships or fleets **standing orders** (Patrol, Escort,
Guard, Explore) that carry on by themselves at the end of every turn.

**Long-range warfare** (so nobody can just turtle): ships with cruise missiles (range 14) outrange every base weapon
(10 at most), so defenders have to sail out. Also recon drones, coastal Cruise Missile Batteries, Airbase bomber
sorties, sub-launched missiles and satellite passes. They cost oil (and money) per shot, need a target you can
see, and are countered by AA Platforms, Frigates and Jammer Ships.

**Computer players.** Any seat can be a bot: four difficulties (Easy, Normal, Hard, Admiral+) and four personalities
(Admiral, Tycoon, Raider, Conqueror, or random). Bots never see through the fog. Hard and Admiral+
cheat a little: Hard starts with 2 extra Survey Ships, +$200 and a second rig base; Admiral+ gets that plus +1 oil from
every rig, +2 research a turn and ships that build 1 turn faster. Against one human, bot moves you can see play out on the board; with every seat a
bot, it's **spectator mode** with the whole map revealed.

**Research.** A 100-tech tree in seven branches (press **T** or the 🔬 button). Research points come from your
Admiralty, Research Labs and funding. Fourteen ⚖ doctrine pairs force real choices: pick one, lose the other.

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

Each feature has its own small file. Start in `js/data/` for balance changes.

```
index.html               page skeleton
css/
  base.css               colours, fonts, buttons
  layout.css             top bar, board area, panel placement
  panel.css              side panel, shipyard, log, player chips
  dialogs.css            menus, setup screen, rules, confirm boxes
  tutorial.css           tutorial coach box
  timer.css              turn timer
  responsive.css         small screens (loaded last)
js/
  main.js                start-up: wires everything together
  data/                  ALL BALANCE NUMBERS (edit these to tune the game)
    ships.js             every ship: stats, shape, abilities
    economy.js           oil deposits, rigs, ports, market, upkeep, oil cap, domination
    bases.js             rig base levels and every platform type
    research.js          THE TECH TREE: every tech, its cost, prerequisites, effects, doctrines
    victory.js           victory settings (countdowns, shares, thresholds)
    production.js        shipyards (slots, speed), build queue, fleets, standing orders
    bots.js              bot difficulties and personalities (what they build and research)
    maps.js              map sizes, player names and colours
  engine/                game rules, no graphics
    index.js             one import for the whole engine
    actions.js           applyAction() and getView(): the only ways in and out
    setup.js             new game: homes, deposits, starting fleets
    terrain.js           world generator: continents, islands, one connected ocean
    pathfind.js          sea routes for long voyages (A*)
    orders.js            voyage orders that keep sailing turn after turn
    production.js        shipyards: buying, build queues, launching finished ships
    fleets.js            fleets: forming, formation sailing, regrouping
    standing.js          standing orders (patrol, escort, guard, explore) and auto-fire
    strikes.js           long range: recon drones, cruise missiles, bombers, satellite passes, jamming
    movement.js          moving/turning, hidden collisions, mines
    abilities.js         attacks, scans, surveys, mines, repairs, spoofs, salvage
    combat.js            shot resolution, armor, interception, sinking
    economy.js           launch zones, selling oil
    ports.js             forward ports on island coasts
    turns.js             start of turn, upkeep, domination, elimination
    visibility.js        fog of war
    stats.js             prices, upkeep, movement cost, domination counts
    modifiers.js         every ship/weapon/player stat with research bonuses applied
    research.js          research points, queue, doctrines, unlocks
    bases.js             rig bases, claims, platforms, upgrades, gun platforms, capturing
    victory.js           Conquest, Domination, Post-Oil and Last Rig Standing
    geometry.js          grid maths, zones, coordinates
    util.js, rng.js      shared helpers, seeded random numbers
  ai/                    computer players (read ai/index.js first)
    context.js           what a bot knows, its dice, the fair-play rule, oil-budgeted sailing
    memory.js            enemy sightings and ship jobs, remembered between turns
    economy.js           selling oil, research, platforms, upgrades
    expansion.js         survey sweeps, exploring, founding bases (with an oil budget)
    defense.js           guards, shooting at enemy ships and structures in range
    military.js          defending bases, spies, the strike fleet and its targets, raiders
    build.js             what to build, at which shipyard
  ui/                    everything on screen
    index.js             UI start-up, refresh, sending actions
    state.js             what the screen is doing (selection, mode, hover)
    camera.js            scrolling and zooming
    input.js             mouse and keyboard
    panel.js             side panel and top bar
    status.js            hint line under the board, error toasts
    dialogs.js           overlays, confirm box, Rules screen
    research.js          the research tree screen
    board/               the canvas: render.js draws it layer by layer;
                         units, fog, modes (move/target/placing/voyages), fleets (fleets, standing
                         orders, yard badges), tooltip, markers, minimap
  app/                   menus and game flow
    menu.js              main menu and new-game setup (seats: Human / CPU)
    bots.js              computer turns on screen: animation, curtain, spectator controls
    flow.js              pass-the-device, game over, tutorial enter/exit
    timer.js             turn timer
    storage.js           saving in the browser
    settings.js, state.js
  tutorial/
    steps.js             the tutorial steps and coach text (edit text here)
    map.js               the tutorial's hand-built map
    coach.js             the coach box and step logic

tools/
  simulate.mjs           bot-vs-bot simulator (needs Node.js 18+): node tools/simulate.mjs games=20 size=small players=4
```

### Common edits

- **Balance a ship:** change its numbers in `js/data/ships.js` (`build` = turns to build).
- **Shipyard slots, fleet size, standing order text:** `js/data/production.js`.
- **Add a ship:** add an entry to `SHIPS` in `js/data/ships.js` and a two-letter label in `CODES` in `js/ui/constants.js`.
  If it uses a brand-new ability, add it in `js/engine/abilities.js`.
- **Economy tuning:** `js/data/economy.js`.
- **Add or change a tech:** `js/data/research.js` (the header explains every effect you can use).
- **Add or change a platform or base level:** `js/data/bases.js`.
- **Map sizes, land amount, deposit density:** `js/data/maps.js`.
- **Tutorial wording:** `js/tutorial/steps.js`.

## Controls

- Click a ship to select it, then click a highlighted spot to move.
- Click further away to send it on a **voyage**: it finds a sea route and sails on by itself every time you end your turn.
- **Shift+click** to add waypoints first (A, then B, then C) to route around islands or danger; Esc clears them.
- **R** plans which way the ship will face; it only turns (and pays for it) when it actually moves.
- **Drag** the map (or WASD / arrow keys) to scroll, **mouse wheel** (or +/-) to zoom, click the **minimap** to jump.
- **Tab** selects your next ready ship, **Space** centres on the selected one.
- Click one of your rigs or platforms to open its **base**. **T** opens the **research** tree.
- **Shipyard:** click a price to start building at the yard whose tab is open; ✕ cancels.
- **Fleets:** select a ship, **Form a fleet…**, click the ships to bring along, **Create fleet**. With any fleet ship
  selected, clicking far away sends the whole fleet. ★ marks the flagship.
- **Standing orders:** pick one in the Standing orders card (Patrol asks for points, Escort asks for a ship).
- **Esc** / right-click cancels.
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
