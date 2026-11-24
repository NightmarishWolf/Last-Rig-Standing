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

---

## 17. Debt and repossession

- **Ships no longer lose HP or sink when you can't pay upkeep.** Instead the bill goes on the books and your money drops below $0: you're **in the red** (shown as −$ in red with 🏦). You can't buy anything while you're in the red.
- **Three turns to fix it.** Sell oil, sell ships you choose or cut research funding. Getting back to $0 or more resets the clock.
- **Repossession:** still in the red after three turns, the bank takes ships back at their sale value, **most expensive first**, until you're back to $0. You don't pick which ships go, and it takes them wherever they are.
- **Bankruptcy:** if your whole fleet isn't worth enough to clear the debt when the three turns are up, you're bankrupt and out of the game.
- Warnings count down the turns you have left, and once repossession is next they name the ships that will go (or warn that you're about to go bankrupt): in the top bar, the Resources card and the end-turn check (which still offers to sell oil to cover it).
- No research funding is bought while you're in the red.

---

## 18. The campaign begins: Navy Mission 1, ranks, achievements and Dabloons

- **Campaign** on the main menu (it replaces the old Tutorial button: the campaign teaches the game now). Part One follows the **Coalition Navy** across ten missions. The first, **First Watch**, is playable; the others show as "coming soon". Missions open in order.
- **Lore:** it's 2061, the land fields are dry, the Allocation Accords share out the last offshore oil, and the Navy enforces them against the Free Tide. The story bible is `docs/LORE.md`.
- **First Watch** (Corrigan Shelf, March 2061). Captain Mateo Ortiz's first command: two Picket Boats sent to find out why Rig 7 went silent. It's played on a hand-made map, with Admiral Hale on the radio and Lt. Sato teaching you as you go:
  - moving ships
  - gunnery on a target barge
  - rounds
  - fog of war
  - a radar contact you have to close in on to identify
  - a Tide skiff that runs and shoots back.
  
  The shipyard, research, market and the other cards stay hidden until later missions teach them.
- **Mission screens:**
  - a briefing with portraits, goals and par
  - a comms box above the board (who's talking, or your current orders; Space reads the next line)
  - a Goals card in the panel that ticks and crosses itself live
  - pulsing highlights on the buttons to press
  - results, with Replay, Campaign and View map.
- **Ranks F to S+.** Every win scores out of 100: speed against par (40), hull kept and ships lost (30), and secondary goals (30). S+ is a perfect score at least 2 rounds under par. First Watch's secondary goals are **On the Clock** (reach Rig 7 by round 8) and **Clean Hull** (no damage).
- **Rewards:** XP for the mission's commander and **Dabloons** (🪙, for cosmetics in a shop that's coming). Both pay out when you beat your best rank on a mission. A replay that doesn't beat it pays a little XP.
- **Achievements**, a new page on the menu with 12 to start:
  - campaign achievements, including a hidden one in First Watch
  - skirmish achievements: first win, a win with each faction, beating a Hard bot, a win in 30 rounds, a Last Rig win, a capture by boarding, a hidden one, and taking a commander to level 15.
  
  Each pays XP (to the commander you were playing) and Dabloons, and pops up when you earn it. Skirmish ones also show on the game over page.
- **Pixel-art portraits** of Ortiz, Hale and Sato, each with four moods. A target barge sprite, and Rig 7 drawn as a dead, grey rig.
- Missions aren't saved: leaving one (Menu → Abandon mission) starts it over next time.

---

## 19. Navy Mission 2: The Quota

- **The Quota** (Bracken Bank, April 2061). Losing Rig 7 put Corrigan behind its Allocation quota. You command Captain Ortiz again, with the outpost rig, a Picket Boat, a Survey Ship and $150. Deliver **$900 from oil sales by the end of round 18**.
- **Teaches:**
  - selling oil and how the price falls and recovers
  - upkeep, and what going into the red means
  - surveying the three marked areas with Deep Survey
  - founding rig bases (the Survey Ship does it from 5 squares away)
  - the 60-oil storage cap
  - guarding rigs: around round 7, a Tide skiff slips out of the fog to siphon your rig furthest from your ships, from your tanks or straight from the well. Get a boat within 3 squares and it runs.
- **Bracken Point:** the richest deposit on the bank lies under an Unallocated village's fishing grounds. Its elder, **Maren Holt** (new portrait), has words for you if you sail close.
  - **Drill it** and the village packs up for the rafts.
  - **Leave it** and Hale has something to say about your conscience.
  
  The ending changes either way.
- **Goals:**
  - **Secondary:** On the Clock (par 12), In the Black (never in the red) and Nothing Taken (no oil siphoned).
  - **Hidden achievement:** Good Neighbours, for delivering without drilling Bracken Point.
  - **Clear achievement:** The Quota.
- **The village** is drawn on the coast with its boats pulled up on the shore.
- **Mission results:**
  - a **Next mission** button
  - every achievement earned during the mission is listed.
- **The Goals card** shows the quota filling up and when the mission fails.
- **Fix:** a mission's enemy no longer shows an empty home-waters box on the map.

---

## 20. Navy Mission 3: Convoy

- **Convoy** (Saltpan Channel, May 2061). **Commodore Elias Vance** takes over the escort group and hands Ortiz the Corrigan Point shipyard, with one job: see the tanker **Hesper** north to the Allocation Terminal.
- **An escort mission:**
  - The Hesper sails herself, two squares a turn, and only with one of your warships within 3 squares. You can't command her.
  - If one of your ships is in her way, it stands aside.
  - Selecting her shows a short card instead of orders.
- **Teaches:**
  - the shipyard (buy Corvettes; they launch next turn)
  - research (pick an Era I tech; research points and buying more with money)
  - fleets
  - the **Escort** standing order
  - fighting while the convoy keeps moving.
- **The ambush:** two Tide skiffs come out from behind the western islands, then two more from the east. Then **Kade the Burner** comes on the radio and sends a fireship at the Hesper. If it gets alongside, it rams and burns everything near her.
- **Goals:**
  - **Main:** the Hesper reaches the Terminal. You fail if she's sunk or hasn't arrived by the end of round 20.
  - **Secondary:** On the Clock (par 15), Full Load (she arrives with 3+ of 4 HP) and No Losses.
  - **Hidden achievement:** Firebreak, for sinking the fireship before it gets within 2 squares of her.
  - **Clear achievement:** Convoy.
- **Choices carry over:** your profile remembers what you did in earlier missions. Vance's first words depend on whether you drilled Bracken Point.
- **New portraits:** Vance (slicked fair hair) and Kade (bandana, soot, a burn scar). The Allocation Terminal is drawn on the shore.
- The skirmish welcome line ("outlast the enemy") no longer shows in mission logs.

---

## 21. Portraits redrawn

- **More detail:** every portrait is redrawn at **48×48** pixels (up from 32×32), with:
  - eyes that have whites, irises, pupils and a catchlight
  - a shaded nose, lips and cheekbones
  - ears, and shading under the chin and across the shoulders
  - uniform details: collars, lapels, ties, buttons, and shoulder boards showing each officer's rank
  - softer age lines on Hale and Maren
  - a lit backdrop.
- **Symmetrical:** faces and bodies are now painted mirrored down the middle, so they're even. The only one-sided marks are deliberate: Kade's burn scar and a smudge of soot.

---

## 22. Navy Mission 4: Driftwood

- **Driftwood** (the Fenwick Isles, June 2061). Vance traces the convoy raiders to **Driftwood**, a Tide raft town of 300 people anchored in a lagoon, and orders it burned.
- **You start with:** Ortiz's squadron (three Corvettes and a Picket Boat), a **Supply Ship**, $500 and the shipyard, a long way from home.
- **Teaches:**
  - **supply lines:** Navy ships more than 3 rounds away from your bases, ports and Supply Ships run low and hit softer, so the Supply Ship has to come along
  - **scouting** with the Radar Ping
  - **the Tide's raft network:** its boats move faster and repair on it, and Driftwood's **Raft Dock** launches a new skiff every 3 rounds
  - **attacking a base's platforms and central rig**
  - **commander powers:** the commander card appears for the first time, with Ortiz's **🏖️ Beach Landing**.
- **The choice:**
  - **Burn it:** shoot down the central rig. Vance is pleased, and people go into the water.
  - **Take it:** clear its platforms, keep its boats 2+ squares away and use Beach Landing. Everyone is detained and nobody is hurt, but Vance is furious, and a young prisoner named **Lio** (new portrait) says Mother Ruiz will hear about it.
  
  Both win the mission, and your profile remembers which you chose.
- **Goals:**
  - **Main:** burn Driftwood or take it. You fail if you lose every warship, or Driftwood still stands after round 24.
  - **Secondary:** On the Clock (par 16), Well Supplied (no warship runs low on supplies) and No Losses.
  - **Hidden achievement:** Taken, Not Burned.
  - **Clear achievement:** Driftwood.
- **The raft town is drawn:** lashed hulls and tarps around the base, charred once it's burned.
- **Mission dialogue:** a step you've already done by the time you reach it no longer plays its lines. For example, you won't be ordered to burn a town that's already burning.

## 23. New portraits
- All seven characters have new 64×64 pixel-art portraits in four moods (neutral, stern, worried, pleased), made from a drawn reference sheet and cleaned up by hand: Kade's scalp spikes trimmed, smiles given whiter teeth.
- The pictures are PNG files in `assets/portraits/`; `js/campaign/portraits.js` keeps the same `portraitSVG(who, mood, size)` call, so briefings and the comms box needed no changes. Portraits preload when the Campaign page opens.

## 24. Navy Mission 5: Reprisal
- **Reprisal** (Corrigan Shelf, July 2061): you command Admiral Hale for the first time, defending Corrigan Point and three rigs against Mother Ruiz's swarm in waves from the reef, the Narrows and the east, through a storm. Win by holding until dawn (round 14) or by hurting Ruiz's Mothership to 2 HP, which sends the whole swarm home. Lose Corrigan Point or two rigs and it's over.
- **Refugee boats** sail with the swarm. On scan they're "?" like any gunboat; seen close up they're crowded fishing boats. In this mission Gun Platforms and standing orders only fire at ships in plain sight and never at refugees (gun crews watch out to their guns' range), so only your own shots can hit them. Firing on one quietly costs the hidden achievement **Eyes Before Guns**.
- **A choice in the dialogue:** if you took Driftwood in Mission 4, Ruiz offers to turn around for her people. Buttons in the comms box: refuse, or release the detainees (the attack ends; remembered for later missions as `ruizOffer`). If Driftwood burned, Kade's fireships join the attack instead.
- **Cosmetics:** clearing Reprisal unlocks the **Corrigan Pennant** (recorded in your profile under `cosmetics`; it'll show in the Locker when the shop opens). New `js/data/cosmetics.js`.
- Engine: `scriptEvent()` lets a mission start its own weather; a hidden `refugee` ship type with its own sprite; the goals card can say when a deadline is a win ("Dawn comes at round 14").
- Ruiz speaks on the radio with a placeholder silhouette until she has a portrait.
- Choosing mercy pays: on the release ending (which can't earn Driven Off), an S rounds up to S+, with a note on the result screen. Missions can do this with `rankUp`.

## 25. Navy Mission 6: Clean Sweep, and Ruiz's portrait
- **Ruiz has a portrait** (converted from the reference art, Tide-green backdrop). **Nyx** has his portrait too: the same smile as Ortiz (same shape, same tooth white), with one tooth missing.
- **Clean Sweep** (Saltpan Channel, September 2061): the first long mission (48×30 map, par 26, fails after round 34) and the first against a **real computer player**: Kade the Burner is the skirmish AI (Hard, Raider, Arson commander), earning, building and hunting. Ortiz (level 3, Landing Craft) commands with Vance's carrier on loan. Clear Gullhaven, Lantern and Tarry Reach by wrecking their rigs or taking them with marines, while tankers sail the lane on their own (a new one every 4 rounds; lose 3 and you're relieved; $250 for each that reaches the Terminal). The Council funds the operation: +$150 and +5 oil a turn.
- **Nyx's charts** (round 2, a choice): $300 reveals the raft-towns, but Kade's boats start turning up near your fleet (3 ambushes; never next to the carrier). Saved as `nyxCharts`.
- **Mercy**, a hospital raft (white tarps, red crosses), is on Vance's list. Sparing it is the hidden achievement **Mercy**; the ending changes either way. Saved as `mercy`.
- Secondary goals: Clean Lane, The Kiln (Kade's own base), Taken Whole (capture a town).
- Engine: a mission's enemy can be a real bot (`enemy.ai`), played on screen like skirmish turns, with the mission's own script running on its turn; ships `onLoan` pay no upkeep and can't be repossessed; ships with `ownFuel` don't burn your oil; a base with `noDock` launches nothing; `waterField` can route round blocked squares; missions get a `watch` hook.

- The **Allocation Council** has its own portrait: a faceless, backlit silhouette (no picture file; drawn in code like the radio placeholder). Ready for Mission 7.

## 26. Navy Missions 7, 8 and 9
- **Bracken** (Ortiz vs Ruiz, Hard Tycoon AI): pump 200 oil from Bracken Bank by round 30 while Ruiz races you for its deposits. The Council orders the village cleared (round 3, buttons): clear it (the rich deposit opens at once; Maren's boats join Ruiz) or give them time (escort three fishing boats out west; the deposit opens when they're out or after 6 rounds). Hidden: **Four Generations** (every boat out). Saved as `bracken`, `boatsOut`.
- **The Terminal** (you play Vance, vs Kade, Hard Raider AI, plus waves every 3 rounds): hold the Terminal until the Home Fleet (round 24) or sink Kade's flagship, the Pyre (out from round 12). Round 7: the hijacked Hesper, crew aboard, sails at the Terminal (no automatic gun will fire on her). Let Ortiz go (his two ships sail on their own to board her) or hold the line and sink her. If she reaches the Terminal she blows up against it. Hidden: **Not That Navy**. Saved as `hesper`.
- **Open Water** (Ortiz vs Ruiz, Hard Conqueror AI, level 7, with her Leviathan): sink three Brood Rafts. Vance's carrier and destroyers fight on their own beside you (you can't command them; they cost nothing). Round 10: Nyx's call (tell Vance you know, or keep quiet; saved as `nyxTold`). Hidden: **Line Breaker** (no capital ship lost). War chest: +$200 a turn.
- `js/campaign/kit.js`: shared helpers for the bigger missions (dialogue lines, founding bases, spawning out of sight, fired-on tracking). Mission non-combatants never draw automatic fire anywhere now (not only in Reprisal). The village prop can be drawn burnt.
- Balance from bot runs (rough; to be tuned in playtesting): Bracken wins around round 19 if cleared, round 30 if you wait; the Terminal holds to round 17–20; Open Water around round 21.
- Bracken: giving the village time adds 6 rounds to par (missions can now stretch par for a choice: `parBonus`).

## 27. Navy Mission 10: The Allocation (the arc is complete)
- **The Allocation** (Ortiz vs Ruiz, Hard Conqueror AI, level 9, plus Vance and Kade as scripted sides): a natural atoll map, the Drowned Reach, about 40 rounds.
  - **Act 1:** break the Gate's two forts. Vance's ships only fire on what comes close; the forts are yours. Side goals: take the Lighthouse with marines (it becomes your forward Dry Dock), wreck Kade's base, lose no more than two ships.
  - **Act 2:** the Council's order, one choice, no second chance. Vance's losses are made good first.
  - **Obey:** burn the Motherraft and its four districts. Vance's carriers fly a light air strike on Haven each turn from outside the reef; Ruiz is blockaded; Kade goes for the carriers. Hidden: **Lifeboats** (never fire on a lifeboat).
  - **Refuse:** a truce with Ruiz (allied ships can't hurt each other and share sight). Get 3000 of Haven's 4000 people out to the west or south edge. Boats only launch through an exit with no Vance ship within 5 squares. Vance brings a second group off the Needle and reinforcements every 3 rounds while a carrier is afloat. Win by the evacuation, or by sinking every carrier and all but two of his ships. Lose if Haven burns, too many boats are lost, or the Resolute sinks. Hale arrives 12 rounds in if she refused Ruiz in Mission 5 and stands Vance down. Hidden: **Clean Hands**.
- Engine: truces between seats (`st.truce`), `shapeField` (sea distance for a ship's whole shape, so scripted carriers find channels they fit), scripted sides now get their ammunition paid during their own turn.
- Fix: in campaign missions only seat 0 counts as a person, so a mission with scripted extra sides no longer leaves the "taking their turn" curtain over the board.

## 28. Map Maker
- A design tool for campaign maps, from the main menu (the 🗺️ Map maker 🔒 button under Sound). It asks for a password once per browser session.
- Maps up to 500 × 500, shown in the game's own land and sea art (or flat colours for speed). Wheel to zoom, Space+drag or middle-drag to move.
- Tools: land and sea brushes (1–60 squares; right-drag paints the opposite), island stamp (natural, irregular islands), roughen coast, smooth coast, fill, lettered pins with labels, oil (small / medium / rich). Undo and redo.
- New maps: natural islands at any size (land share, island size, rough coasts, open edges, seed), the game's own generator (any size and map type, with its oil), a blank sea, or a copy of a mission map. Resize the canvas from any corner.
- Check: water cut off from the open sea, sea only reachable through channels under 2 squares wide (no cruisers or carriers), pins and oil on land, lone specks of land. Each problem links to where it is.
- Saved in the browser by name; the open map autosaves. Export as .txt (the format the missions read, pin labels in `;` comment lines), copy as text, or import a .txt or pasted text.
- Mission maps can now have `;` comment lines.
- **Map Maker: sides, ships, buildings and oil slicks.**
  - Sides: up to four, each with a name, a faction (Navy or Free Tide) and a colour. Scenery is Neutral.
  - 🚢 Ships: every ship of the side's faction, drawn with the game's sprites in the side's colour at their real footprint. Q / E turn them; they can't go on land, off the map or on top of anything.
  - 🏗️ Buildings: bases (outpost or capital, levels 1–4, Free Tide bases can be raft-towns), all 15 platforms, and scenery (village, beached boats, Terminal, derelict rig, lighthouse, old wreck). Selecting a base shows its claim.
  - ⚫ Oil slicks: size, how many rounds they last (or the whole mission), and on fire or not.
  - 🖱️ Select / move: drag anything placed; change its side, name, rotation, level and so on in the Selected panel. Delete or right-click removes it. Everything can be undone.
  - The check also flags ships or buildings on land, overlaps, platforms outside their side's base claims, two capitals on a side, and sides with nothing placed.
  - Exported as readable `;` lines in the .txt (sides, ships, bases, platforms, scenery, slicks), and imported back.

## 29. Rig and platform sprites
- Oil rigs and all 15 platforms have proper top-down sprites now (js/ui/board/structart.js), in the owner's colour like the ships: a rig is a jacket on four legs with its derrick, helideck, crane and flare boom; each platform shows what it is (tanks, turrets, radar mast, dry dock, refinery columns, runway, fusion ring, launch hatches...).
- Navy pieces are grey steel; Free Tide pieces are planks, rust and patched plate.
- Platforms under construction are drawn faded inside yellow scaffolding. Zoomed far out (under 10 px a square) the plain squares are still used.
- The Map Maker uses the same sprites for bases and platforms.
- Fix: ships, rigs, platforms and bases of a side under truce with you were never drawn (Vance's whole squadron was invisible in Mission 10, and Ruiz's fleet after you refuse). Allies now always show, in their own colour, as what they are.
- Fix: land that runs off the edge of the map now reaches the edge (it used to get a thin coast of sea along the border). The same for pack ice.

## 30. Mission 1 on a new map
- First Watch now plays on your hand-made Corrigan Shelf (26 × 18): Corrigan Point in the south-west on a small well, the Spit across the middle with the Narrows (4 squares wide) through it, and Rig 7 on its rich deposit in the north-east. The target barge, the skiff (now hiding just east of the rig, running north-west off the map) and the step markers moved to fit.
- **Mission 2 on a new map:** The Quota now plays on your Bracken Bank (28 × 20): Corrigan Point on the west coast, the North Reach and Middle Bank deposits (both medium now) among the islands, the rich deposit off Bracken Point in the south-east, and the village on the coast below it. Survey areas, Maren's trigger and the village's boats moved to fit.
- **Mission 3 on a new map:** Convoy now plays on your Saltpan Channel (30 × 22): a chain of islands running from the north-west corner to the south-east. Corrigan Point and the Hesper start in the south-west; the Allocation Terminal stands on the north-west island, its jetty running south, and the Hesper unloads at its foot. The first ambush comes out from behind the middle islands to the east, the second from up ahead to the north, and Kade's fireship out of the fog in the north.
- The Hesper now finds her way by her whole hull (she no longer noses into a gap between islands she can't turn in), and where a turn is too tight her tugs walk her round, waving your own ships aside.
- **Mission 4 on a new map:** Driftwood now plays on your Fenwick Isles (34 × 24): the forward outpost and squadron in the south-west, scattered islands across the middle, and Driftwood in the north-east, in a lagoon ringed by a horseshoe of islands with a long island across its mouth. Its Radar Mast, Storage Tank and two skiffs sit around it as before.

## 31. Missions 5–10 on the new maps
- **Reprisal** (34 × 24): the shelf's islands across the north, the coast along the south. Corrigan Point and its Dry Dock on the south side, the West, North and East rigs where you placed them; Ruiz's waves still come in from the north edge, and the refugee boats shelter in the gap east of the middle islands.
- **Clean Sweep** (54 × 34): the Saltpan Channel is now the open water between a northern and a southern chain of islands. Saltpan Station in the west; Gullhaven and Lantern among the northern islands, Tarry Reach and Mercy among the southern ones, the Kiln in the far south-east; five free deposits along the channel; tankers run west to east to the Terminal edge.
- **Bracken** (62 × 42): your capital in the west, Ruiz's capital in the north-east and her second town in the south-east, five deposits across the bank, Bracken Point on the long south coast with the rich deposit and its three fishing boats off it (they leave by the west edge). The bigger bank means longer trips: the quota is 170 now (was 200) and the operation budget $150 a turn (was $100).
- **The Terminal** (62 × 42): the Terminal on the west coast with its picket stations north and south, Kade's capital on the east coast, his outposts on the far north and south islands. The Hesper comes down from the north.
- **Open Water** (48 × 30): all open sea, no land at all. (Also fixed: the Leviathan started half off the map, and a cruiser started on top of a corvette.)
- **The Allocation** (70 × 50): your capital in the north; Haven is your one great raft-town in the south-east lagoon with every platform you placed around it (56 of them). Its only way out is the Gate, the north-west mouth, held by the West and East forts and the Lighthouse; the Cinder Isle is north of the lagoon. Changes to fit: no districts any more (Obey: burn the Motherraft); the Needle is gone (boats can only leave once the Gate is clear of Vance); Vance's second group and Kade's later raids come in from the east; on Obey, Vance's carriers each destroy one of Haven's weapons a turn (AA, cruise batteries, guns, the airbase first), then you breach the wall of tanks and burn the Motherraft; lifeboats leave Haven two at a time while it burns. Haven's platforms cost Ruiz no upkeep, and Kade keeps at most eight raiders at sea.
- Platforms can now be on loan like ships (no upkeep), for scripted strongholds.

## 32. The play screen fits the window
- The board now fills the space left of the side column at any window size. A map small enough to show whole is drawn as big as fits and centred; a bigger map scrolls in a board that fills the whole area.
- On wide screens the story box (campaign comms, tutorial coach) moved to the top of the side column, so the board gets the full height of the window. Narrow screens still stack it above the board.
- The side column grows a little on big screens (340–480 px).
- When one of your ships takes a hit, on anyone's turn, the warning pop-up (the one you get for an order a ship can't take) tells you: "⚠ Under fire: Picket Boat −1 HP · Corvette sunk!". Boats leaving the map and ships used up by an ability don't count as sunk.

## 33. RTS prototype (rts.html, "⚡ RTS prototype" on the main menu)
- A separate experiment beside the turn-based game: free movement, real time with pause (Space; orders still work while paused), ½× / 1× / 2× speed.
- Supply: every ship costs supply (1 for a Picket Boat or Skiff, up to 5–6 for a Cruiser or Mothership); your cap is 10 from the Admiralty, +5 per Crew Quarters, up to 100.
- One mirrored natural map, 64 × 40, you (Coalition Navy) against the computer (the Free Tide). Oil deposits pay money once a worker builds a rig on them. The Admiralty builds ships in a queue of five with a rally point; workers also build Gun Platforms and Crew Quarters within 6 squares of your Admiralty or a rig.
- Ships: Navy Survey Ship (worker), Picket Boat, Corvette, Destroyer, Cruiser; Tide Prospector (worker), Skiff, Gunboat, Fireship (rams for area damage), Mothership. They turn like ships, keep clear of land by their size, path round islands, push past each other, and fire on the move; shells fly, cruisers and motherships splash.
- Controls: drag-select, Shift, double-click, right-click move/attack/build/rally, A attack-move, S stop, H hold, Ctrl+1–9 groups, wheel zoom, arrows / edges / middle-drag scroll, minimap (right-click it to send ships). Fog of war.
- Win by sinking the enemy Admiralty.
- js/rts/: data.js (numbers), map.js, path.js (A* plus straightened paths), sim.js (the world), ai.js, render.js, main.js. It reuses the game's land, water, ship and platform art.

## 34. The real-time game replaces the turn-based one (stage 1 of 5: skirmish)

**New game** on the main menu now starts a real-time match with pause (rts.html). The prototype is gone; this is the game.

- **Setup:** the same New game page: map size and type, seed, mirrored or random layout, fog (On / Reveal / Off), commander levels, Post-Oil on or off, 2–4 players. One person per screen (the other seats are computers); all computers = spectator mode. Turn order, turn timer and world events are gone from the page for now.
- **Economy (oil + market):** rigs pump oil into storage (180 to start, Storage Tanks add more; it spills past the cap). Sell it from the top bar (10, 50 or all): each barrel knocks the price down a little and it recovers over time; Refineries add to the price you get. Ships cost money and oil; ships and platforms cost upkeep; the Admiralty brings in $3/s. Deep in debt, the bank repossesses your priciest ship.
- **Bases:** a worker founds a base on a free oil deposit (right-click it, or B → O). Bases have levels (U to upgrade), a claim (the dashed square) and platform slots. All 15 platforms are in the worker's build menu (B, then the platform's letter; Shift-click to place several). A worker right-clicking a deposit inside a claim builds a Wellhead.
- **Supply:** every ship costs supply; 10 from the Admiralty, +5 per Crew Quarters, up to 100.
- **Ships:** 12 per side for now (the rest come in stage 5). Each yard (the Admiralty, Dry Docks) queues five; letter keys queue, the queue buttons cancel with a full refund; right-click the sea to set a rally point. Abilities on **F**: radar pings, recon flights, missile strikes (Helipads and Airbases too); Cruise Batteries fire on their own.
- **Controls:** box select, double-click for all of a kind, right-click move / attack, A attack-move, S stop, H hold, Ctrl+1–9 groups, Home your Admiralty, . next idle worker, Space pause (orders still work), Esc cancel / menu, ½× to 3× speed. Hover a button for its full stats.
- **Warnings:** "⚠ Under fire" when something of yours off screen is hit (click it to look), with a ping on the minimap.
- **Winning:** destroy every enemy base (Conquest), or finish a Deep-Sea Fusion Plant (Post-Oil).
- **Main menu:** Campaign shows "being converted to real time" and Online "being rebuilt"; Continue, Load, Save and the Balance lab are gone with the turn-based game.
- Still to come: research, commander powers and world events (stage 2), online (3), the campaign (4), the remaining ships (5).

## 35. Real time, stage 2: research, commanders and world events

- **Research** (Tab, or the 🔬 chip in the top bar): the full tech tree from the turn-based game, with the same layout and doctrine choices. Points come in every second: 4 a turn (a turn is 6 seconds) from the Admiralty, 3 per Research Lab, plus funding (− / + on the research screen; it costs money every second). An Era I tech takes about 18 seconds with the Admiralty alone. Click a bright tech to research it, or a dim one to queue it along with everything it needs. The game keeps running while the screen is open.
- **Research now gates things,** as in the turn-based game:
  - **Ships:** Destroyer Program, Air Defense, Guided Missiles and the rest. Locked buttons show 🔒 and what to research.
  - **Platforms:** Crew Quarters, gun platforms, Labs, Dry Docks and the rest. Storage Tanks and Wellheads are open from the start.
  - **Base levels:** Station needs Crew Quarters, Complex needs Base Complexes, Hub needs Mega-Platform Hubs.
  - **Claims:** a new base claims 3×3, and the Pipelines line makes claims bigger.
- **What research changes:** each player's ships use their own numbers, with research and commander perks added (HP, speed, sight, armor, cost, build time, weapon damage, range and shots), and so do platforms (cost, HP, upkeep, gun range, sight). Player-wide effects that work in real time:
  - **Market and storage:** oil storage, sell price, how fast the price drops when you sell.
  - **Costs:** upkeep, and the cost of bases and upgrades.
  - **Rigs:** pump rate, Pump Station bonus, deeper wells (a dry rig strikes another layer), more oil in newly tapped deposits.
  - **Bases:** claim size, platform slots.
  - **Repair:** ships heal inside your claims, and platforms repair themselves.
  - **Sight:** base sight, Stealth Doctrine (enemies must come closer to see your ships), worker sight.
  - **The Tide:** how far it reaches, how big it grows, healing and speed on it.
  - Effects for things not in real time yet (forward ports, plunder, boarding, Skiff Packs, muzzle flashes) say "—" on the research screen.
- **The Tide:** Free Tide bases spread it (2 squares, growing over time; Leviathans carry their own). Tide ships on it sail faster and heal. It shows as a faint wash of the owner's colour.
- **Commanders:**
  - **Perks:** perks up to the commander's level apply. Bots get their commander by personality, at their difficulty's level.
  - **Exclusive ships:** the Battlecruiser (Hale) and the Escort Carrier (Vance) are in, and the Incendiary Junk is now Kade's only. Each needs commander level 3.
  - **Powers:** all twelve, on **N** and **M**, from the panel at the bottom left: Damage Control, Full Broadside, Carrier Strike, Recon Blanket, Beach Landing, Sabotage, Swarm Call, Tidal Surge, Ignite, Firestorm, Black Market Sale and Smuggling Run. Cooldowns are the turn-based ones × 6 seconds, and every power starts 18 seconds from ready. Bots use theirs too.
- **Oil slicks:** a destroyed rig or Wellhead spills one. Nobody can drill inside a slick until it fades. Burning slicks hurt enemy ships; they come from Ignite, Firestorm and the Incendiary Junk's burning oil. Kade's Slicks Burn perk makes every slick hurt his enemies, and his Choking Smoke perk slows enemy rigs inside one.
- **World events** are back on the New game page (Off / Light / Chaotic / Custom). A "round" is 12 seconds, so Light means an event every 2–3 minutes, the first after about 1½ minutes, each announced 12 seconds ahead. All eight are in:
  - **Storm:** drifts across the map; ships in it sail at half speed, and nothing flies in or out of it (air strikes, recon, missiles).
  - **Fog bank:** nothing inside sees more than a square or so.
  - **Calm seas:** every ship sails faster for a while.
  - **Oil shock:** the price jumps or crashes, then drifts back.
  - **Super-rich field:** a 💎 circle in No Man's Sea with a big deposit somewhere inside.
  - **Blowout:** a rig stops pumping until it's fixed for $60 (the base card has the button) or the time runs out.
  - **Pirates:** they raid near the richest player, $140 bounty each.
  - **Rogue sub:** it hunts No Man's Sea, $450 bounty.
  - Active and coming events are listed at the top left; hover one for details.
- **Computer players** follow a research plan for their faction, build Research Labs and a Dry Dock, fund research when they're rich, fix blowouts and use their powers.
