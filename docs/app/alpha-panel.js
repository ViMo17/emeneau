// Вынесено из sanskrit-sandhi-app.html — панель алфавита справа: тултип,
// аудио-заглушка, пин буквы, рендер ALPHA_ROWS. Делает собственные
// document.getElementById() (те же id, что и в основном скрипте) — элементы
// уже есть в статической разметке к моменту выполнения любого модуля, порядок
// импорта не имеет значения. Наружу нужна только hideTooltip — основной
// скрипт вызывает её при уходе курсора с карточки правила (тултип общий).
import { ALPHA_ROWS } from './data.js';

let pinnedCardA = null;

const tooltip = document.getElementById('tooltip');

function showTooltip(card, hint) {
  tooltip.textContent = hint;
  tooltip.classList.add('show');
  const rect = card.getBoundingClientRect();
  const tw = tooltip.offsetWidth;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  tooltip.style.left = left + 'px';
  tooltip.style.top  = (rect.top - tooltip.offsetHeight - 10 + window.scrollY) + 'px';
}
function hideTooltip() { tooltip.classList.remove('show'); }

function playFlip() {
  /* звук временно отключён — заглушка, изменим позже */
}

document.addEventListener('click', () => {
  /* пин сандхи снимается только кликом на другую карточку, не на фон */
  if (pinnedCardA) { pinnedCardA.classList.remove('pinned','hovered'); pinnedCardA = null; hideAudioPanel(); hideTooltip(); }
});

const audioPanel = document.createElement('div');
audioPanel.id = 'audio-panel';
audioPanel.innerHTML = `
  <span id="audio-label"></span>
  <span id="audio-trans"></span>
  <div id="audio-placeholder">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#aaa" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    </svg>
    <span>аудио</span>
  </div>`;

function showAudioPanel(cell) {
  document.getElementById('audio-label').textContent = cell.dv;
  document.getElementById('audio-trans').textContent = cell.tr;
  audioPanel.classList.add('visible');
}
function hideAudioPanel() { audioPanel.classList.remove('visible'); }

const wrap = document.getElementById('alpha-wrap');
const alphaDesc = document.getElementById('alpha-desc');
alphaDesc.appendChild(audioPanel);

ALPHA_ROWS.forEach(row => {
  if (row.gap) {
    const g = document.createElement('div'); g.className = 'gap-row'; wrap.appendChild(g); return;
  }
  if (row.header) {
    const corner = document.createElement('div'); corner.className = 'col-head-corner'; wrap.appendChild(corner);
    row.cells.forEach(txt => {
      const h = document.createElement('div');
      h.className = 'col-head';
      h.textContent = txt;
      wrap.appendChild(h);
    });
    return;
  }
  const lbl = document.createElement('div');
  lbl.className = 'row-label';
  if (row.label) lbl.innerHTML = `<span class="rl-main">${row.label}</span><span class="rl-sub">${row.sub}</span>`;
  wrap.appendChild(lbl);

  row.cells.forEach(cell => {
    if (!cell) {
      const e = document.createElement('div'); e.className = 'lc-empty'; wrap.appendChild(e); return;
    }
    const card = document.createElement('div');
    card.className = `lc ${cell.cls}`;
    /* Согласные показываем без inherent-а: ka→k, kha→kh, ṭha→ṭh и т.д.
       Гласные (a, ā, ai, au, ṛ…) и спецзнаки (ṃ, ḥ) не трогаем. */
    const disp = (cell.tr.endsWith('a') && cell.tr.length > 1) ? cell.tr.slice(0, -1) : cell.tr;
    const fontSize = '16px';
    card.innerHTML = `<span class="dv" style="font-family:'Helvetica Neue',sans-serif;font-size:${fontSize};letter-spacing:-0.03em">${disp}</span>`;
    card.id = 'ac-' + cell.tr;
    card.addEventListener('mouseenter', () => {
      if (pinnedCardA && pinnedCardA !== card) return;
      card.classList.add('hovered'); showTooltip(card, cell.hint); playFlip();
    });
    card.addEventListener('mouseleave', () => {
      if (card === pinnedCardA) return;
      card.classList.remove('hovered'); hideTooltip();
    });
    card.addEventListener('click', e => {
      e.stopPropagation();
      if (pinnedCardA === card) {
        card.classList.remove('pinned','hovered'); pinnedCardA=null; hideTooltip(); hideAudioPanel();
      } else {
        if (pinnedCardA) pinnedCardA.classList.remove('pinned','hovered');
        card.classList.remove('hovered'); card.classList.add('pinned');
        pinnedCardA = card; showTooltip(card, cell.hint); showAudioPanel(cell);
      }
    });
    wrap.appendChild(card);
  });
});

export { hideTooltip };
