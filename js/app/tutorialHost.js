// The single tutorial coach used by the app.
import { exitTutorial, startTutorial } from './flow.js';
import { createTutorial } from '../tutorial/coach.js';
import { refresh } from '../ui/index.js';

export const tutorial = createTutorial({
  refresh: () => refresh(),
  restart: () => startTutorial(),
  exit: () => exitTutorial(),
});
