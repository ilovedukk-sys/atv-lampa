import { render } from 'preact';
import '@fontsource/inter/cyrillic-400.css';
import '@fontsource/inter/cyrillic-500.css';
import '@fontsource/inter/cyrillic-600.css';
import '@fontsource/inter/cyrillic-700.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './App';
import { startFpsMeter } from './core/fps';

/**
 * Интерфейс всегда рисуется в 1920×1080 (как на ТВ) и масштабируется под окно.
 * Так в браузере ПК мы видим ровно то же, что будет на телевизоре.
 */
const stage = document.getElementById('app')!;
stage.setAttribute('data-stage', '');

function fit() {
  const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  const left = (window.innerWidth - 1920 * scale) / 2;
  const top = (window.innerHeight - 1080 * scale) / 2;
  // На ТВ экран ровно 1920×1080 — никаких лишних преобразований всей сцены
  stage.style.transform = scale === 1 ? '' : `translate(${left}px, ${top}px) scale(${scale})`;
}
window.addEventListener('resize', fit);
fit();

render(<App />, stage);
startFpsMeter();
