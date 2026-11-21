import './style.css';
import { Engine } from './core/engine.js';

let engine;
function fail(error) {
  console.error(error);
  engine?.renderer.setAnimationLoop(null);
  const curtain = document.querySelector('#curtain');
  curtain.hidden = false;
  document.querySelector('#status').textContent =
    'Survey unavailable. ' + error.message;
}
try {
  engine = new Engine(document.querySelector('#world'), fail);
  await engine.start();
  if (import.meta.env.DEV) window.airp = engine;
} catch (error) {
  fail(error);
}
if (import.meta.hot) import.meta.hot.dispose(() => engine?.dispose());
