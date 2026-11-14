// Tutorial: the coach box above the board, step advancing, and forgiving retries.
import { STEPS, targetAlive } from './steps.js';

export function createTutorial(hooks) {
  let step = 0, flash = '';
  const el = document.getElementById('coach');

  function render() {
    const s = STEPS[step];
    if (!s) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="coach-head"><span>Tutorial · step ${step + 1} of ${STEPS.length}</span>
        <span>${s.next ? '<button class="primary small-btn" data-tut="next">Next →</button> ' : ''}<button class="ghost small-btn" data-tut="restart">Restart</button> <button class="ghost small-btn" data-tut="exit">Exit</button></span></div>
      <div class="coach-title">${s.title}</div>
      <div class="coach-text">${s.text}</div>
      ${flash ? `<div class="coach-flash">${flash}</div>` : ''}
`;
    el.querySelectorAll('[data-tut]').forEach(b => b.onclick = () => {
      const k = b.dataset.tut;
      if (k === 'next') { step++; flash = ''; hooks.refresh(); }
      if (k === 'restart') hooks.restart();
      if (k === 'exit') hooks.exit();
    });
  }

  // called after every redraw of the panel
  function afterRender(st, ui) {
    if (!st.tutorial) { el.classList.add('hidden'); return false; }
    let changed = false;
    // keep advancing while steps are already satisfied
    let guard = 0;
    while (STEPS[step] && STEPS[step].check && STEPS[step].check(st, ui) && guard++ < 20) { step++; flash = ''; }
    const s = STEPS[step];
    // be forgiving while learning to scout and shoot: missed shots and pings can be retried
    if (s && s.forgiving && targetAlive(st)) {
      for (const sh of st.ships.filter(x => x.owner === 0)) {
        if (sh.cooldowns.ping > 0 || (sh.acted && ['gun', 'ping'].includes(sh.activeAction))) {
          const missed = sh.activeAction === 'gun' && !s.check(st, ui);
          sh.cooldowns.ping = 0; sh.acted = false; sh.activeAction = null; sh.shotsLeft = 0;
          changed = true;
          if (missed) flash = 'Missed! In the tutorial you can try again. (In a real game that ship would be done for the turn.)';
          else if (step === STEPS.findIndex(x => x.title === 'Radar ping')) flash = 'Nothing there. Ping again, aiming at the middle of the marker.';
        }
      }
    }
    render();
    if (s?.highlight) document.querySelectorAll(s.highlight).forEach(b => b.classList.add('pulse'));
    return changed;
  }

  return {
    afterRender,
    markers: () => (STEPS[step]?.markers || []),
    reset: () => { step = 0; flash = ''; },
    hide: () => el.classList.add('hidden'),
  };
}
