// Full-screen boxes: generic overlay, confirm box and the Rules screen.
import { ECONOMY, PORT } from '../data/economy.js';
import { CONQUEST, DOMINATION, LAST_RIG } from '../data/victory.js';
import { FLEET } from '../data/production.js';
import { BASE_FOUNDING } from '../data/bases.js';

export function showOverlay(html, bind) {
  const ov = document.getElementById('overlay');
  document.getElementById('overlay-card').innerHTML = html;
  ov.classList.remove('hidden');
  bind?.(document.getElementById('overlay-card'), () => ov.classList.add('hidden'));
}

export function closeOverlay() { document.getElementById('overlay').classList.add('hidden'); }

export function showConfirm(title, text, yesLabel, onYes, onNo) {
  showOverlay(`<h2>${title}</h2><p class="muted">${text}</p>
    <div class="row" style="margin-top:16px"><button class="primary big" data-yes>${yesLabel}</button><button class="big ghost" data-no>Cancel</button></div>`,
  (card, close) => {
    card.querySelector('[data-yes]').onclick = () => { close(); onYes(); };
    card.querySelector('[data-no]').onclick = () => { close(); onNo?.(); };
  });
}

export function showRules() {
  showOverlay(`<div class="rules">
    <h2>How to play Last Rig Standing</h2>
    <p>Two to four admirals, one sea. Oil moves your ships and pays for your war. A player left with no ships, no rig that still pumps oil, and under $60 is out. Last rig standing wins.</p>
    <p>Any seat can be a <b>computer player</b> (pick it on the New game screen): Easy, Normal, Hard or Admiral+, each with a personality. Bots never see through the fog of war. <b>Hard</b> bots cheat with a head start (2 extra Survey Ships, +$200 and a second rig base from turn 1); <b>Admiral+</b> gets that plus +1 oil from every rig, +2 research a turn and ships that build 1 turn faster. You'll watch their moves that your fleet can see; <b>Skip ⏩</b> finishes a bot's turn instantly. Make every seat a computer to spectate.</p>
    <h4>Factions</h4>
    <p>Every seat picks a faction on the New game screen (or in the online lobby). Both share the oil economy, bases and victories, but have their own warships, military research and a signature mechanic.</p>
    <ul>
      <li><b>⚓ Coalition Navy</b>: tough, expensive ships. <b>Logistics:</b> ships in supply (home waters, near your bases or forward ports, or within 4 of a Supply Ship) repair 1 HP a turn when they weren't in combat last round. Ships out of supply for 3 rounds are <b>low on supplies</b> (📦 badge): −1 damage until they get back. The <b>Amphibious Assault Ship</b> captures an enemy base (not an Admiralty) whose central rig is at half HP or less, with no defenders within 2.</li>
      <li><b>🏴 Free Tide</b>: cheap, fast, fragile boats. <b>The Tide</b>, a raft network, spreads from their bases (and Leviathans, the Tide Queen) and grows over time; on it their ships get +1 move, pay half oil and heal 1 HP a turn, and it gives them sight. Grown bases become <b>Raft Docks</b> that launch boats anywhere on their Tide. <b>Skiff Packs</b> launch two boats per order. Enemy ships sinking near a Tide ship leave <b>plunder</b> (money, and oil from tankers). <b>Boarding Skiffs</b> capture a <b>burning</b> enemy ship (🔥: a third of its HP or less, shown on ships you can see); <b>Fireships</b> ram and explode; the <b>Q-Ship</b> fires without a muzzle flash.</li>
    </ul>
    <h4>Commanders and profiles</h4>
    <p>Each seat can bring a <b>commander</b> from its faction (or none). Their perks unlock as they level up from 1 to 15: the core perk at level 1, an <b>exclusive ship</b> at 3, upgrades at 5, 7, 9, 11 and 13, and a <b>mastery</b> choice at 15. Levels are earned in your <b>profile</b> by playing that commander: XP for every round, a bonus for winning, more against tougher opponents. Your first commander of each faction is free; the others unlock as you level up. See 🎖️ Commanders on the main menu. A game can be set to play every commander at <b>level 1</b> for an even start.</p>
    <p><b>Powers:</b> every commander has two active powers (one from level 1, one from level 8), shown in your commander's card on the right. Click one to use it; aimed powers then want a square on the map (Esc cancels). Each recharges over a number of your turns, and they all start a few turns from ready.</p>
    <h4>Your turn</h4>
    <ul>
      <li>Each ship can <b>move</b> (up to its Move, paying oil per square: small boats sip about 0.2–0.3 oil a square, capital ships burn 1 or more; fractions carry over between moves) and take <b>one action</b> (attack, scan, survey…). Every action costs a little money (shown on its button, per shot for multi-shot guns), so sailing is cheap but fighting and surveying aren't free. Standing orders never spend the money you need for next turn's upkeep. Once a ship attacks it can't move, unless it has Hit and Run.</li>
      <li><b>Turning:</b> press <b>R</b> to plan which way a selected ship will face. The preview shows it, and the ship only turns (free: no movement or oil, it just needs room to swing) when you click to move it or send it on a voyage. It can turn anywhere along the way where there's room.</li>
      <li><b>Voyages:</b> click anywhere beyond a ship's teal movement area to send it on a multi-turn voyage. It sails on by itself every time you end your turn, until it arrives. Clicking a normal move or <b>Cancel voyage</b> stops it.</li>
      <li><b>Waypoints:</b> hold <b>Shift</b> and click to add stops along the way (A, then B, then C) to route ships around islands, mines or enemy waters, then click normally to set the final destination. Esc clears the stops.</li>
      <li><b>Getting around:</b> drag the map or use WASD / arrow keys to scroll, the mouse wheel or +/- to zoom, and click the minimap to jump. <b>Tab</b> selects your next ready ship, <b>Space</b> centres on the selected one, and <b>Enter</b> ends your turn.</li>
      <li><b>Map types</b> (picked when you set up a game; hover a type for what it's like): 🌍 Classic, 🏝️ Archipelago (small islands, narrow channels), ⛵ The Strait (one channel between the homes, rich oil in the narrows), 🌊 Open Ocean (almost no land), 🫙 Inland Sea (a walled, rich sea with a gate facing each player), ⚓ Twin Seas (a sheltered home bay each, a shared sea in the middle), 🏔️ Shattered Coast (long thin fjords), or 🎲 Random. Every type is mirrored for fairness when the layout is Mirrored. The <b>map seed</b> (shown on the results page) makes the same map again: type it in New game → Map seed with the same size, players, type and layout.</li>
      <li><b>Auto-sell</b> (research Automated Trading, Economy tree): under Resources, turn 🤖 Auto-sell on and set how much oil to keep (− and +, Shift for 10 at a time, or click the number and type it). At the end of each of your turns, after voyages and standing orders have used theirs, everything above that is sold at the market price.</li>
      <li><b>World events</b> (picked when you set up a game; off unless you choose them): <b>Light</b> = one every 10–15 rounds, <b>Chaotic</b> = every 5–8, <b>Custom</b> = pick which (hover each for what it does) and how often. Each is announced a round ahead (📣 in the World card, with a dashed outline on the map where it will be). 🌩️ <b>Storm front</b>: drifts across the map; ships starting their turn in it move at half speed, and no aircraft fly in or out of it. 🌫️ <b>Fog bank</b>: sight 1 inside. 🌤️ <b>Calm seas</b>: +1 move for a round. 📈 <b>Oil shock</b>: the price jumps or crashes, then drifts back. 💎 <b>Super-rich field</b>: a marked area holds a hidden deposit with ~3× a rich deposit's oil; survey to find it. 🔥 <b>Well blowout</b>: a rig stops for 2 rounds unless you pay to fix it (World card). 🏴‍☠️ <b>Pirates</b>: raid outlying rigs and weak ships for 12 rounds (never a base's central rig); sinking one pays a bounty. 🦈 <b>Rogue submarine</b>: hunts a region for 15 rounds; big bounty.</li>
      <li><b>Oil spills:</b> when a rig is destroyed or a Tanker sinks, oil spills around it. Nobody can build a rig on a deposit in the slick until it clears (it fades over 8–12 rounds), and sailing through it costs double oil. A Drillship or Fleet Tender can <b>Clean Up</b> a slick within 2 squares ($30, takes 4 rounds off). You can always rebuild your own wrecked Admiralty, slick or not.</li>
      <li><b>Polar maps:</b> pack ice blocks every ship except the <b>Icebreaker</b> (research Ice-class Hulls, Drilling tree), which clears the ice it sails over and can survey for oil under the ice. A deposit under ice can't be built on until it's broken open. The ice shifts every 3 rounds: open lanes slowly freeze over, though an opened deposit stays open.</li>
      <li><b>Fog of war</b> (picked when you set up a game): <b>🌫️ On</b>, you only see what your ships, rigs, bases and platforms can see right now. <b>🗺️ Reveal</b>, the map starts dark, but anywhere your fleet has seen once stays visible, live, for the rest of the game. <b>👁️ Off</b>, everyone sees every ship, rig, base and platform. In every mode <b>submerged submarines</b> are still only spotted up close or by sonar, mines stay hidden, and oil deposits still have to be surveyed.</li>
      <li><b>Turn order</b> (picked when you set up a game): <b>⚡ Simultaneous</b> (the default) or <b>⏯ Take turns</b>, one player at a time (whoever goes first in a round has a small edge, which is why Simultaneous is the default). Simultaneous: everyone plays the round at once, and moves happen the moment they're made (if two ships go for the same square, the first move to land wins). Press <b>Ready ✓</b> (or Enter) when you're done; you can take it back with <b>Not ready</b> until everyone is ready. Then voyages, fleets and standing orders run for everyone and the next round starts. Bots play their round alongside you. Not available with two or more people sharing one screen.</li>
      <li><b>Online:</b> Menu → 🌐 Online. One player hosts and shares the 4-letter code (or the invite link); the others join with it. Seats can be online players or computers. The host's browser runs the game, so the host keeps it open. <b>Chat</b> with 💬 (or press <b>/</b>), with quick emotes. If someone drops out, the game <b>pauses</b> until they're back; the host can let a bot play for them or carry on without them (their turns are skipped), and can pause by hand with ⏸. If you lose the host, your game keeps trying to <b>reconnect</b> by itself. With a turn timer, the host ends turns that run out. A game the host closed stays in their saves: loading it hosts it again under the same code. When it's your turn and the tab is in the background, you get a notification. Can't connect? Online → <b>Connection settings</b> tests your connection and lets you add a relay server.</li>
      <li><b>Replays:</b> every game is recorded. <b>🎬 Watch replay</b> on the results page, or Load game → Replays: play it back at any speed, jump around, and watch with everything visible or through one admiral's fog of war. Download a replay to share it.</li>
      <li><b>Balance lab</b> (main menu): runs bot-vs-bot games in the background and shows who wins, how games end, how well each ship class pays for itself, the economy over time and the research winners pick. Add game-data files from real games too.</li>
      <li><b>Sound:</b> 🔊 in the top bar mutes it; the volume slider is on the main menu.</li>
      <li><b>Shipyards:</b> buy ships in the Shipyard. You pay up front, and the yard builds them over a few turns (⏱ in the list: bigger ships take longer). Finished ships appear next to the yard at the start of your turn, ready to sail. Your <b>Home Yard</b> (your spawn strip) builds 2 at a time; forward ports build 1; Dry Docks build 2, each a turn faster. Extra ships wait in line, and you can cancel (full refund before work starts, half after).</li>
      <li><b>Fleets:</b> select a ship and click <b>Form a fleet…</b>, then click the ships to bring along (within ${FLEET.joinRange} squares). The biggest ship is the flagship (★). Click the map with any fleet ship selected and the whole fleet sails there in formation, at the speed of its slowest ship. Stragglers catch up; <b>Regroup</b> calls them back now.</li>
      <li><b>Long range:</b> later research unlocks strikes that cost oil per shot instead of per square sailed. <b>Missile Corvettes and Guided Missile Cruisers</b> get Cruise Missiles (range 14) that <b>outrange every base weapon</b>, so nobody can just sit at home: defenders have to sail out and fight. <b>Nuclear Attack Subs</b> can fire missiles (range 12). Bases get shorter-range defences: a <b>Helipad</b> launches recon drones (reveal 5×5 up to 15 away), a <b>Cruise Missile Battery</b> hits targets up to 6 away and an <b>Airbase</b> bombs a 3×3 area up to 10 away, and <b>Satellite Reconnaissance</b> gives a 7×7 look anywhere every 4 turns. Aim them from the base card. Strikes need a target you can see. AA Platforms and Frigates shoot them down, and Electronic Warfare Ships scramble half of them.</li>
      <li><b>Standing orders</b> run by themselves each time you end your turn: 🔁 <b>Patrol</b> a loop of points, 🛡️ <b>Escort</b> another ship, ⚓ <b>Guard</b> a spot, or 🧭 <b>Explore</b> unknown waters (surveying on the way). Patrol, Escort and Guard also fire at enemy ships in range. They work for single ships and for whole fleets.</li>
      <li>Sell oil for money. The price is shared by everyone and moves on a curve: selling pushes it down fast at first, then more and more slowly as it nears the $4 floor. Each round it climbs back toward $15, quickly after a crash and more slowly as it nears normal.</li>
      <li><b>Selling ships:</b> select a ship and click <b>Sell ship</b> for half its price back (less if damaged). It must be in your home waters or inside one of your rig bases' claims, and out of combat (not shooting or being hit) for 3 rounds.</li>
      <li><b>Upkeep:</b> every ship costs 4% of its price in money each turn. Ships you can't pay for lose 1 HP. Big idle fleets drain you.</li>
      <li><b>Storage:</b> you can hold ${ECONOMY.oilCap} oil. Anything pumped past that spills, so use it or sell it.</li>
      <li><b>Forward ports:</b> build one on an <b>island coast</b> (island land touching water) with one of your ships right next to it. The port is also a small shipyard: ships built there appear within ${PORT.range} squares of it. Ports have ${PORT.hp} HP, see ${PORT.sight} squares, and can be shot.</li>
    </ul>
    <h4>Oil</h4>
    <ul>
      <li>Deposits are hidden and move every game. Use <b>Survey</b> to find them. S/M/R = small/medium/rich. Water you've surveyed turns <b style="color:#a9d77a">green</b>, so you know where you've already looked.</li>
      <li>Every deposit starts with a random amount of oil. Hover over a deposit or rig to see what's left (e.g. 18/35). Rigs pump the same rate until the deposit runs dry.</li>
      <li>Home deposits are modest and run dry after a while (every player's home gets the exact same amounts). No Man's Sea deposits hold several times more, so sooner or later you have to go fight for them.</li>
      <li>Build a rig on a discovered deposit to found a <b>rig base</b>. You need a ship right next to it, or a Survey Ship, Flagship, Fleet Tender or Carrier within 5 squares. You start with one: your <b>Admiralty</b> (★). A new base costs $${BASE_FOUNDING.baseCost} plus $${BASE_FOUNDING.costPerBase} for every base you already have, up to $${BASE_FOUNDING.maxCost} at most.</li>
    </ul>
    <h4>Rig bases</h4>
    <ul>
      <li>A base claims the water around it (3×3 at first, up to 13×13 with research and upgrades), shown as a border in your colour. Enemies can't build inside it.</li>
      <li>Click one of your rigs or platforms to open its base. Build <b>platforms</b> on water inside the claim: Wellheads pump extra deposits in the claim, Storage Tanks raise your oil cap, Research Labs add research, and research unlocks Pumps, Gun Platforms, Radar, Dry Docks, Refineries, AA, Helipads and Missile Batteries.</li>
      <li>Platforms take a few turns to build, cost upkeep, use the base's slots, and can be shot. Upgrade a base (Outpost → Station → Complex → Hub) for more slots and a bigger claim; it needs research and a finished Crew Quarters.</li>
      <li>Sink a base's central rig and the base is <b>wrecked</b>: its claim and platforms go offline until the owner rebuilds the centre.</li>
    </ul>
    <h4>Research</h4>
    <ul>
      <li>Open the tree with the 🔬 button in the top bar or <b>T</b>. Research points come from your Admiralty, Research Labs, and funding you pay for each turn.</li>
      <li>Click a bright tech to research it, or a dim one further down to queue it with everything it needs. New ships, platforms, faster engines, better weapons and bigger claims all come from research.</li>
      <li><b>Doctrines (⚖)</b> come in pairs: researching one closes the other for the rest of the game.</li>
    </ul>
    <h4>Fog of war</h4>
    <ul>
      <li>Each ship sees a set number of squares around it (its <b>Sight</b>: 1 for support ships up to 4 for carriers and command ships). Rigs see 1 square. Water you can see is bright; everything else is darkened fog.</li>
    <li>You only see enemies inside that bright area, or revealed by scans. Enemy ships you can see with your own eyes show as what they are (zoom in to see the ship). Ships picked up only by scans, sonar or gun flashes show as dark "?" contacts outlined in their owner's colour: you know where they are, not what they are.</li>
      <li>You can fire at any square in range, even blind. White dot = miss, red X = hit, blue slash = intercepted.</li>
      <li>Firing reveals your rough position: everyone else sees an orange dashed box near you on their next turn. Orange circles show enemy shots that landed in your waters or hit your stuff.</li>
      <li>Submarines are only seen when adjacent or by destroyer sonar. Jammers blank out scans (purple hatching). Decoys and spoofs fake contacts.</li>
      <li>Moving into an unseen enemy stops your ship and reveals it. Mines are invisible to the enemy.</li>
    </ul>
    <h4>Winning</h4>
    <ul>
      <li><b>⚔️ Conquest</b> (always on): be the last admiral standing. Losing your <b>Admiralty</b> (wrecked or captured) gives you ${CONQUEST.exileTurns} turns to rebuild it or move it to another base ($${CONQUEST.moveCapitalCost}), or you're out. Players with no ships, no rigs and almost no money are out too.</li>
      <li><b>🗺️ Domination:</b> control ${Math.round(DOMINATION.share * 100)}% of all the sea claimed by bases (and at least ${Math.round(DOMINATION.minMapShare * 100)}% of the map's open water, counting at most what a Classic map has, and not pack ice; on Archipelago maps, where islands crowd every claim, 60% of that) for ${DOMINATION.rounds} rounds in a row.</li>
      <li><b>⚛️ Post-Oil:</b> research Era V up to Fusion Engineering, then build the Deep-Sea Fusion Plant at a Hub base. It takes 10 turns, and everyone is warned and can see it, so defend it.</li>
      <li><b>🛢️ Last Rig Standing:</b> when the world is down to ${Math.round(LAST_RIG.threshold * 100)}% of its oil, a ${LAST_RIG.rounds}-round countdown starts. When it ends, whoever controls the most oil still in the ground (under their rigs or inside their claims) wins.</li>
      <li><b>Capturing:</b> rebuild an enemy's wrecked base yourself and it's yours, with its platforms.</li>
    </ul>
    <h4>Wrecks</h4>
    <p>Sunk ships leave wrecks. A Salvage Tender can recover half their value, from any side. When a player is knocked out, their whole fleet becomes wrecks.</p>
    <div class="row" style="margin-top:16px"><button class="primary" data-close>Got it</button></div>
  </div>`, (card, close) => card.querySelector('[data-close]').onclick = close);
}
