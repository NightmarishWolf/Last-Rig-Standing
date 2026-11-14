// Full-screen boxes: generic overlay, confirm box and the Rules screen.
import { DOMINATION, ECONOMY, PORT } from '../data/economy.js';

export function showOverlay(html, bind) {
  const ov = document.getElementById('overlay');
  document.getElementById('overlay-card').innerHTML = html;
  ov.classList.remove('hidden');
  bind?.(document.getElementById('overlay-card'), () => ov.classList.add('hidden'));
}

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
    <p>Two to four admirals, one sea. Oil moves your ships and pays for your war. A player who runs out of ships, rigs and money is out. Last rig standing wins.</p>
    <h4>Your turn</h4>
    <ul>
      <li>Each ship can <b>move</b> (up to its Move, paying oil per square) and take <b>one action</b> (attack, scan, survey…). Once a ship attacks it can't move, unless it has Hit and Run.</li>
      <li>Turning a ship 90° costs one square of movement. Press <b>R</b>.</li>
      <li>Buy ships in the Shipyard. They launch in your spawn zone (the lighter strip at your edge of the map) and are ready next turn.</li>
      <li>Sell oil for money. Selling a lot at once drops the price; it recovers each turn.</li>
      <li><b>Upkeep:</b> every ship costs 5% of its price in money each turn. Ships you can't pay for lose 1 HP. Big idle fleets drain you.</li>
      <li><b>Storage:</b> you can hold ${ECONOMY.oilCap} oil. Anything pumped past that spills, so use it or sell it.</li>
      <li><b>Forward ports:</b> build one on an <b>island coast</b> (island land touching water) with one of your ships right next to it. New ships can then launch within ${PORT.range} squares of the port. Ports have ${PORT.hp} HP, see ${PORT.sight} squares, and can be shot.</li>
    </ul>
    <h4>Oil</h4>
    <ul>
      <li>Deposits are hidden and move every game. Use <b>Survey</b> to find them. S/M/R = small/medium/rich. Water you've surveyed turns <b style="color:#a9d77a">green</b>, so you know where you've already looked.</li>
      <li>Every deposit starts with a random amount of oil. Hover over a deposit or rig to see what's left (e.g. 18/35). Rigs pump the same rate until the deposit runs dry.</li>
      <li>Home deposits are small and run dry within a few rounds (every player's home gets the exact same amounts). No Man's Sea deposits hold several times more, so sooner or later you have to go fight for them.</li>
      <li>Build a rig on a discovered deposit next to one of your ships. Rigs produce oil each turn until the deposit runs dry.</li>
      <li>Owning 3 rigs unlocks Tier 2 ships. 5 rigs unlocks Tier 3.</li>
    </ul>
    <h4>Fog of war</h4>
    <ul>
      <li>Each ship sees a set number of squares around it (its <b>Sight</b>: 1 for support ships up to 4 for carriers and command ships). Rigs see 1 square. Water you can see is bright; everything else is darkened fog.</li>
    <li>You only see enemies inside that bright area, or revealed by scans. Enemy ships show as red-outlined "?" contacts in their owner's colour.</li>
      <li>You can fire at any square in range, even blind. White dot = miss, red X = hit, blue slash = intercepted.</li>
      <li>Firing reveals your rough position: everyone else sees an orange dashed box near you on their next turn. Orange circles show enemy shots that landed in your waters or hit your stuff.</li>
      <li>Submarines are only seen when adjacent or by destroyer sonar. Jammers blank out scans (purple hatching). Decoys and spoofs fake contacts.</li>
      <li>Moving into an unseen enemy stops your ship and reveals it. Mines are invisible to the enemy.</li>
    </ul>
    <h4>Winning</h4>
    <p>Knock everyone else out (no ships, no rigs, under $60), or, if Domination is on, hold rigs on at least half of No Man's Sea's deposits for ${DOMINATION.rounds} rounds in a row.</p>
    <h4>Wrecks</h4>
    <p>Sunk ships leave wrecks. A Salvage Ship can recover half their value, from any side. When a player is knocked out, their whole fleet becomes wrecks.</p>
    <div class="row" style="margin-top:16px"><button class="primary" data-close>Got it</button></div>
  </div>`, (card, close) => card.querySelector('[data-close]').onclick = close);
}
