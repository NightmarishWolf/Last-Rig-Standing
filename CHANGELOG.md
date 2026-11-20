# Last Rig Standing: Changelog

Everything since the oil rig cost cap ($400 maximum for a new rig base), newest last.

---

## 1. Online play: hardening

- **Relay (TURN) servers:** settings for a relay server, a **connection test** button, and a clear message when two computers can't reach each other directly (ICE failure).
- **Turn timers enforced by the host:** the host's clock is the one that counts (with an 8-second grace), so a slow or tampered client can't stretch its turn.
- **Chat and emotes**, in the lobby (docked inside the lobby page) and in game.
- **Disconnects:**
  - the game **pauses** when a player drops; the host can **carry on without them** or hand their seat to a **bot**
  - the host can **pause manually**
  - dropped players **reconnect automatically**, and a **Rejoin** button on the main menu takes you back to your last online game
- **Desync reports:** every client checks its game against the host's after each move and reports any drift (with a description of what differs).

## 2. Replays

- Every game is **recorded** automatically (the last 15 are kept in the browser).
- A **replay viewer** with play/pause, speeds, stepping (Space, `,` and `.`), checkpoints for fast seeking, and a choice of whose view to watch.
- Replays can be **downloaded** and **imported**.

## 3. Balance lab

- An in-browser **Balance lab** (main menu) that runs bot-vs-bot games in a background worker and shows a **dashboard**: win rates by personality, difficulty, seat and matchup, how games ended, per-map results, per-unit stats (built, lost, kills, damage, value traded) and an economy curve.
- The command-line simulator (`tools/simulate.mjs`) can save game data and replays (`out=`, `replays=`).
- Every game now tracks **per-unit statistics** (built, lost, shots, damage, kills, value of kills).

## 4. Fog of war settings

- Three fog of war modes when setting up a game:
  - **On:** the usual fog
  - **Reveal:** exploration fog; anything you've once seen stays visible
  - **Off:** everyone sees everything, except stealthy ships like submarines

## 5. Missile boats rebalanced

- The Missile Boat (now the Missile Corvette) was rebalanced, and bots learned to **hunt** with it (scouting for targets and keeping their distance).

## 6. Map types

- **7 new map types** besides Classic, plus **Random**: each with its own land share, layout and where the oil sits (some with their own home areas, deposit sizes and domination rules; Archipelago needs less sea to win by domination).
- **Polar** maps with **pack ice** that blocks ships, and the **Icebreaker** (Polar only) to break it and survey under it; research **Ice Hulls**.
- A **map seed** box to replay the same map.
- Map type and seed are picked on the New game page and in the online lobby.

## 7. Oil spills

- Destroying a **rig** or sinking a **tanker** spills oil: no rigs can be built on deposits in the slick until it clears, and sailing through it costs **double oil**.
- Repair Ships and Drillships can **clean up** slicks.
- The owner of a wrecked Admiralty can always rebuild it, even through a spill.

## 8. World events

- **World events** setting: **Off** (default), **Light**, **Chaotic** or **Custom** (toggle each event; hover for what it does).
- Events: storms (slower ships), calm seas (extra moves), fog banks (cover visibility), blowouts (fix them before they spill), price swings, **super-rich deposits** (an area you have to survey to find), **pirates** and a **rogue submarine** (neutral ships that attack everyone; sinking them pays a bounty).
- Pirates never attack central rigs.

## 9. Simultaneous turns

- **Simultaneous turns are now the default:** everyone plays the round at once and it ends when everyone is ready. Turn order is still available.
- End-of-round processing and bot order **rotate** each round, which removes the first-player advantage.

## 10. Bots go to war

- Bots now **build and use warships**: strike groups that hold a stable frontier, raid rigs, go home to mend, and save money for their war fleet (without starving their economy of oil).
- Results from testing: destroyers fire 5–7 times as often, cruisers sink 5–6 times as many ships, and fleets move on 81% of turns (was 22%).
- A general **balance pass** (the Cruiser was buffed, among others).

## 11. Auto-sell oil

- New economy research **Automated Trading** (after Trading): sells your oil automatically at the end of each turn.
- Set the **minimum oil to keep** with **+1 / −1** buttons, or click the number and type it in.

---

## 12. Factions: Coalition Navy and Free Tide

- Every seat picks a **faction**: on the New game page, in the online lobby (each online player picks their own) and in the Balance lab. A 🎲 option rolls one at random.
- Both factions share the oil economy, bases and victories, but have **their own warships, military research and signature mechanic**.

### ⚓ Coalition Navy
- The existing fleet, renamed to fit: Picket Boat, Fast Attack Craft, Attack Submarine, Missile Corvette, Electronic Warfare Ship, Guided Missile Cruiser, Fleet Carrier, Flagship, Nuclear Attack Sub, Salvage Tender, Fleet Tender. (Old saves still load.)
- **Logistics:** ships in supply (home waters, near your bases or forward ports, or near a Supply Ship) repair **1 HP a turn** when out of combat. Ships out of supply for **3 rounds** are **low on supplies** (📦): −1 damage.
- New ships:
  - **Supply Ship** (Fleet Logistics): a moving supply line
  - **Amphibious Assault Ship** (new research Amphibious Warfare): marines capture an enemy base whole once its central rig is at half HP, with no defenders nearby

### 🏴 Free Tide
- **The Tide:** a raft network that spreads from your bases (and Leviathans and the Tide Queen) and grows over time. On it your ships get **+1 move, half-price oil, 1 HP of healing a turn**, and you get sight across it.
- **Raft Docks:** a base with a big enough Tide launches boats anywhere on it.
- **Skiff Packs:** one order launches two boats.
- **Plunder:** enemy ships sinking near your ships pay you 20% of their price (and oil from tankers).
- **Boarding:** anyone can see a badly damaged ship is **burning** 🔥; a Boarding Skiff next to it captures it (or gets beaten back if it isn't burning).
- **16 ships:** Skiff Pack, Prospector Skiff, Oil Barge, Rig Raft, Gunboat, Sea Lancer, Mine Junk, Smuggler Sub, Raider Brig, Fireship, Rocket Junk, Boarding Skiff, Q-Ship (a working barge whose launchers give no muzzle flash), Drone Mothership, Leviathan, Tide Queen.
- **3 research branches of its own:** The Tide, Swarm Yards, Plunder & Arms. Some Tide techs count as the Navy's equivalent, so the Tide can still build gun platforms, dry docks, AA and missile batteries.

### Also
- Bots play **both factions**, each personality in its own Tide style; they use Fireships and Boarding Skiffs.
- The lab and game data show **wins by faction** and **faction matchups**.
- The board draws the Tide, burning ships and low-supply ships; ship cards show supply or Tide status; player chips show each faction.
- Fixed: a cruise missile battery owned by the Tide could crash a strike.

---

## 13. Commanders and profiles

### Profiles
- **Profiles** kept in the browser, several per computer: name (also your online name), commander XP and levels, mastery picks, and games and wins per faction.
- A **🎖️ Commanders** page on the main menu: switch, create, rename and delete profiles, and **export / import** them as a file.
- In a game on one computer, each human seat picks a **profile** or plays as a **guest** (first commanders only, level 1, no XP).

### Commanders
- **Six commanders**, three per faction, each with perks that unlock as they level from **1 to 15**: a core perk at 1, an **exclusive ship at 3**, upgrades at 5, 7, 9, 11 and 13, and a **mastery choice at 15**.
  - ⚓ **Admiral Hale** (Battleline): cheaper, tougher, longer-ranged capital ships; exclusive **Battlecruiser**.
  - ⚓ **Commodore Vance** (Carrier Doctrine): air power; exclusive **Escort Carrier**.
  - ⚓ **Captain Ortiz** (Marines): capturing bases sooner and against defenders; exclusive **Landing Craft**.
  - 🏴 **"Mother" Ruiz** (Endless Swarm): cheaper, bigger packs and busier docks; exclusive **Brood Raft** (a moving Raft Dock).
  - 🏴 **Kade the Burner** (Arson): deadlier fireships and slicks that burn and choke rigs; exclusive **Incendiary Junk** (leaves burning slicks).
  - 🏴 **Old Salt Nyx** (Smugglers): richer plunder, better prices; exclusive **Ghost Boat** (hides like a sub, siphons oil from enemy rigs).
- Each seat picks a commander or **No commander** (no XP).
- **Unlocks:** the first commander of each faction is free; the second unlocks at the first's level 5 (or 3 wins with that faction); the third once any of them reaches level 10.
- **XP:** for every round played, a bonus for winning, more against harder opponents. Shown on the **game over page** with level-ups, new perks and new commanders.
- New game setting **Commander levels: Profile levels / All level 1** (also in the online lobby).
- **Bots** pick commanders to suit their personality, at level 1 (Easy), 5 (Normal), 10 (Hard) or 15 (Admiral+).
- The lab has commander and level pickers per seat and a **by commander** table.

---

## 14. Commander powers and smarter bots

- Every commander has **two active powers** (one from level 1, one from level 8), used from a commander card on the game screen, with recharge countdowns and aiming on the map:
  - **Hale:** Damage Control (every ship repairs 2 HP, capitals 4) · Full Broadside (capital ships fire again)
  - **Vance:** Carrier Strike (2 damage over 3×3 squares on any square you can see) · Recon Blanket (reveal 9×9 anywhere)
  - **Ortiz:** Beach Landing (take an enemy base with no working platforms) · Sabotage (blow up an enemy platform or rig)
  - **Ruiz:** Swarm Call (3 free Skiffs on your Tide) · Tidal Surge (Tide +2 squares for 3 rounds)
  - **Kade:** Ignite (every slick burns enemies for 2 rounds) · Firestorm (2 damage over 3×3 squares plus a burning slick)
  - **Nyx:** Black Market Sale (20 oil at 1.5× without moving the price) · Smuggling Run (+3 moves and free moves this turn)
- **Bots use powers**, and they're smarter with their faction tools: marines travel with the fleet and land on bases it knocks down, Boarding Skiffs follow the warships, Fireships save themselves for big targets, and specialist ships are built in sensible numbers.
- Balance: Nyx's Black Market Sale and Ruiz's Swarm Call were trimmed after testing.
- Rules, the Commanders page and the design notes (`docs/FACTIONS.md`) cover all of the above.

---

## 15. Polish: the map

- **Commander picker:** the "First commander" option is gone; with a faction chosen you just see its commanders (the first one picked). On a 🎲 random faction there's a "Starting commander (Hale or Ruiz)" choice.
- **Painted land:** natural coastlines, beaches, grass, forest and hills inland, soft relief shading, pale shallows and surf at the shore; tundra and snow on Polar maps; fine grain close up. The squares and rules are unchanged.
- **Water:** lighter near the coasts and deep blue in open ocean, slow swells, ripples close up, and home areas as soft tints of each player's colour.
- **Pack ice:** soft-edged floes with cracks instead of flat squares (redrawn when an Icebreaker breaks some).
- **Animated surf:** waves roll in and break against every coastline when zoomed in (they never wash over ships, rigs or platforms, and fade in fog). Toggle with the 🌊 button in the top bar; off automatically if your system asks for reduced motion.
- The minimap shows the new land, water and ice.

---

## 16. Polish: ship sprites and identification

- **Ships look like ships:** zoomed in, every ship is drawn as a top-down sprite (hull, deck, guns, flight decks, sails and so on) turned to its heading and marked in its owner's colour. Zoomed far out they're the old blocks.
- **Seen vs detected:** an enemy you can see with your own ships shows as its sprite (with a red dashed outline), and hovering over it names it. One picked up only by a scan, sonar or a gun flash is an **unidentified contact**: a dark "?" hull outlined in its owner's colour. You know where it is and whose it is, not what it is. 🔥 (burning, can be boarded) now only shows on ships you can see, so a contact never gives away that it's a 1-HP boat.
- **Q-Ships look like Oil Barges** to the enemy until they open fire; they're unmasked for the round they fire and the next.
- Subs seen from the next square are identified; heard only on sonar, they stay contacts. Pirates and the rogue sub always show for what they are.
- Rules and the hint line describe the new contacts.
