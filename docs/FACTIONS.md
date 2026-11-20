# Factions and commanders — design notes

Status: **Coalition Navy** and **Free Tide** are playable (pick per seat on the New game screen, in the
online lobby and in the Balance lab; bots play both). Notes from building them: enemy ship types are hidden
anyway (you only ever see squares), so the Q-Ship's trick is *no muzzle flash* rather than a disguise; a
Boarding Skiff that tries a ship that isn't burning is beaten back (−1 HP); a Tide base becomes a Raft
Dock once its Tide reaches radius 4. Numbers live in js/data/factions.js. Next: commanders. **Meridian Petroleum** and the
**Aegis Directorate**, and every commander's **active power**, come later. This file keeps the whole
design in one place.

Model: StarCraft 2. Each faction shares the oil economy (surveying, rigs, bases, the market, victory
types, map types, events) but has its own signature mechanic, warship roster and military research,
and a clear weakness. Each faction has three commanders, unlocked and levelled up by playing.

---

## ⚓ Coalition Navy (the current roster)

**Mechanic: Logistics.** Ships *in supply* (within range of a Supply Ship, one of your bases or a
forward port) repair 1 HP a turn out of combat. Ships that stay out of supply for 3+ rounds are
*low on supplies*: −1 damage on their weapons (minimum 1) until they get back. Rewards steady advances
along supply lines; cutting the lines hurts.

**New ships:** Supply Ship (moving supply source; refuels nearby ships a little), Amphibious Assault
Ship (captures an enemy base instead of wrecking it).

**Renames** (more naval-sounding): Patrol Boat → Picket Boat · Hydrofoil Raider → Fast Attack Craft ·
Submarine → Attack Submarine · Missile Boat → Missile Corvette · Jammer Ship → Electronic Warfare Ship ·
Cruiser → Guided Missile Cruiser · Carrier → Fleet Carrier · Command Ship → Flagship ·
Nuclear Submarine → Nuclear Attack Sub · Salvage Ship → Salvage Tender · Repair Ship → Fleet Tender.
(Destroyer, Frigate, Battleship, Dreadnought, Corvette, Minelayer keep their names.)

**Weakness:** slow and expensive; struggles far from supply.

**Commanders**
- **Admiral Hale — Battleline.** Capital ships cheaper; exclusive: Dreadnought line. *(Power, later:
  Naval Bombardment — every ship in range fires an extra salvo at an area.)*
- **Commodore Vance — Carrier Doctrine.** Aircraft range up; exclusive: Supercarrier. *(Power, later:
  Air Superiority — no enemy aircraft or missiles in an area for 2 rounds.)*
- **Captain Ortiz — Marines.** Assault ships capture faster, captured bases keep upgrades. *(Power,
  later: Beachhead — found a base next to any ship, even in an enemy claim.)*

## 🏴 The Free Tide (insurgents, smugglers, swarms)

**Mechanic 1: The Tide.** A floating raft network spreads from their bases (and from Leviathans).
On the Tide, their ships get +1 move, pay half oil to move, heal 1 HP a turn, and new boats can launch
anywhere on it. The Tide gives them vision. It grows slowly over time; enemy ships can cut it
(sinking a Leviathan, wrecking the base it grows from).

**Mechanic 2: Swarm and plunder.** Small boats come in packs (one order, two boats) and build in one
turn. Sunk enemy ships and Tankers leave plunder their nearby ships collect automatically (no salvage
ship needed). Boarding Skiffs can capture badly damaged enemy ships.

**Roster** (Navy counterpart in brackets)
- Prospector Skiff [Survey Ship] — cheaper, faster
- Oil Barge [Tanker] · Rig Raft [Drillship]
- Skiff Pack [Picket Boat] — two boats per order
- Gunboat [Corvette]
- Sea Lancer [Fast Attack Craft] — very fast torpedo boat
- Mine Junk [Minelayer] — lays mines as it sails
- Smuggler Sub [Attack Submarine] — cheap, fragile
- Raider Brig [Destroyer] — the line ship
- Fireship [—] — rams and explodes, big damage to ships and rigs
- Rocket Junk [Missile Corvette]
- Boarding Skiff [—] — captures enemy ships at 1/3 HP or less
- Q-Ship [Guided Missile Cruiser] — looks like an Oil Barge to enemies until it fires
- Drone Mothership [Fleet Carrier] — cheap expendable drones
- Leviathan [Battleship] — slow floating fortress that spreads the Tide
- Tide Queen [Flagship] — swarm boats near it hit harder

**Weakness:** no real long range; weak away from the Tide; big guns and area damage wreck swarms.

**Commanders**
- **"Mother" Ruiz — Endless Swarm.** Packs of three, faster builds. *(Power, later: Rising Tide.)*
- **Kade the Burner — Arson.** Fireships and slicks burn; spills last longer. *(Power, later: Oil Fire.)*
- **Old Salt Nyx — Smugglers.** Plunder goes straight into storage; exclusive ghost boats.
  *(Power, later: Ghost Run.)*

---

## 🛢️ Meridian Petroleum (later)

Corporation with a navy. **Mechanic: contracts and mercenaries** — money matters more than research;
mercenary ships hired to arrive instantly at any base; rigs pump more; buy rivals' oil at a discount.
Ships: Security Cutter, Escort Frigate, Armored Tanker, a rotating mercenary catalog. Weakness:
mercenary upkeep in money (oil price crashes hurt), fragile in-house ships.
Commanders: **CEO Lindqvist** (Shareholder Value; power: Market Manipulation), **Director Okoye**
(Private Security; power: Emergency Contract), **Chief Engineer Pak** (Deep Rigs; power: Overpressure).

## 💠 The Aegis Directorate (later)

High-tech post-oil believers. **Mechanic: shields and energy** — regenerating shields over HP;
weapons draw on a shared energy pool fed by energy rigs (no money per shot); few, powerful ships;
start closer to Post-Oil. Ships: Sentinel (shield projector), Lance (railgun), Phase Sub (blinks),
Drone Carrier, Arbiter (cloaks nearby), Bastion. Weakness: expensive, slow to replace; energy rigs are
the soft spot. Commanders: **Prime Solace** (Bulwark; power: Aegis Dome), **Theorist Vey** (Fusion Path;
power: Overcharge), **Warden Isk** (Phase Doctrine; power: Recall).

---

## Commanders: unlocking and levels (StarCraft 2 co-op style) — built

- Every perk, exclusive ship and number is in `js/data/commanders.js`; the rules hooks are in
  `js/engine/factions.js` (marines, siphons, burning slicks...), and perks feed the same bonus system as
  research (`js/engine/modifiers.js`).
- **Profiles** (`js/app/profile.js`): several per browser, each with a name (also used online),
  commanders' XP, mastery picks and faction records. Main menu → 🎖️ Commanders to switch, create,
  rename, delete, export and import. On the New game screen every human seat picks a profile, or plays
  as a guest (only each faction's first commander, level 1, no XP).
- **XP:** 8 a round (up to 1,200) + 400 for a win, × the opponents' average (Easy 0.5, Normal 1, Hard
  1.25, Admiral+ 1.5, people 1.25). Level n → n+1 costs 600 + 150 × (n − 1). Shown on the game over page.
- **Unlocks:** first commander free; the second at the first's level 5 or 3 faction wins; the third once
  any of them is level 10.
- **Each seat:** a commander or **No commander** (no XP). Bots pick one to suit their personality, at
  Easy 1 / Normal 5 / Hard 10 / Admiral+ 15, with a random mastery.
- **Game setting "Commander levels": Profile levels / All level 1.** Online, players send their profile's
  levels to the host (trusted for now).
- **Exclusives (level 3):** Hale's Battlecruiser (not the Dreadnought, which every Navy player has),
  Vance's Escort Carrier (early, instead of a late Supercarrier), Ortiz's Landing Craft, Ruiz's Brood Raft,
  Kade's Incendiary Junk, Nyx's Ghost Boat.
- **Powers (built):** two each, from level 1 and level 8, on cooldowns in your own turns (all start 3
  turns from ready). Hale: Damage Control (every ship +2 HP, capitals +4), Full Broadside (capitals fire
  again). Vance: Carrier Strike (2 dmg 3×3 on a seen square), Recon Blanket (9×9 reveal anywhere). Ortiz:
  Beach Landing (take a platform-less base near your ships), Sabotage (blow up a platform or rig). Ruiz:
  Swarm Call (3 free Skiffs on your Tide), Tidal Surge (Tide +2 for 3 rounds). Kade: Ignite (every slick
  burns 2 rounds), Firestorm (2 dmg 3×3 + a burning slick). Nyx: Black Market Sale (20 oil at 1.5×, price
  unmoved), Smuggling Run (+3 moves, free moves this turn). Engine: `js/engine/powers.js`; bots:
  `js/ai/commanders.js`.
- **Ranked (later):** two queues: *Minimum* (everyone's commander at level 1) and *Maximum* (only
  commanders you've levelled to 15 can be picked, played at 15).
