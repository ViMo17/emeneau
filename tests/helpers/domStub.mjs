// Устанавливает globalThis.document/window через jsdom для тестов UI-слоя
// (alpha-panel.js/rule-panel.js/role-demo.js) — им нужны getElementById/
// querySelectorAll/classList/SVG/MutationObserver, которых нет в
// tests/helpers/canvasStub.mjs (тот стаб — только для canvas/div, нужных
// движку для текстур). Разметка ниже — точная копия id/классов из
// docs/app/sanskrit-sandhi-app.html (панели #panel-sandhi/#center/
// #panel-alpha + #tooltip): модули делают document.getElementById() на
// эти конкретные id при импорте, без них выполнение падает на первой же
// строке. Идемпотентно — повторный вызов из нескольких тестов не
// пересоздаёт уже установленный document.
import { JSDOM } from 'jsdom';

const HTML = `
<div id="root">
  <div id="panel-sandhi">
    <div id="sandhi-body"></div>
    <div id="group-stub">
      <div id="stub-label"></div>
      <div id="stub-sub" style="display:none"></div>
    </div>
    <div id="guna-box">
      <table class="guna-table">
        <tr><td class="gt-h"></td><td class="gt-h">a</td><td class="gt-h">i·ī</td><td class="gt-h">u·ū</td><td class="gt-h">ṛ·ṝ</td><td class="gt-h">ḷ</td></tr>
        <tr><td class="gt-r">вридд ↑</td><td class="gt-blank"></td><td class="grade-vriddhi-rev" id="gc-vriddhi-rev-i">yā</td><td class="grade-vriddhi-rev" id="gc-vriddhi-rev-u">vā</td><td class="grade-vriddhi-rev" id="gc-vriddhi-rev-r">rā</td><td class="gt-blank"></td></tr>
        <tr><td class="gt-r">гуна ↑</td><td class="gt-blank"></td><td class="grade-guna-rev" id="gc-guna-rev-i">ya</td><td class="grade-guna-rev" id="gc-guna-rev-u">va</td><td class="grade-guna-rev" id="gc-guna-rev-r">ra</td><td class="gt-blank"></td></tr>
        <tr><td class="gt-r">слаб</td><td class="grade-weak" id="gc-weak-a">a</td><td class="grade-weak" id="gc-weak-i">i</td><td class="grade-weak" id="gc-weak-u">u</td><td class="grade-weak" id="gc-weak-r">ṛ</td><td class="grade-weak" id="gc-weak-l">ḷ</td></tr>
        <tr><td class="gt-r">гуна</td><td class="grade-guna" id="gc-guna-a">a</td><td class="grade-guna" id="gc-guna-i">e</td><td class="grade-guna" id="gc-guna-u">o</td><td class="grade-guna" id="gc-guna-r">ar</td><td class="grade-guna" id="gc-guna-l">al</td></tr>
        <tr><td class="gt-r">вридд</td><td class="grade-vriddhi" id="gc-vriddhi-a">ā</td><td class="grade-vriddhi" id="gc-vriddhi-i">āi</td><td class="grade-vriddhi" id="gc-vriddhi-u">āu</td><td class="grade-vriddhi" id="gc-vriddhi-r">ār</td><td class="grade-vriddhi" id="gc-vriddhi-l">āl</td></tr>
      </table>
    </div>
  </div>

  <div id="center">
    <div id="rule-display">
      <div id="rd-empty">← выберите правило</div>
      <div id="rd-num" style="display:none"></div>
      <div id="rd-text-wrap" style="display:none"><div id="rd-text"></div></div>
    </div>
    <div id="letter-picker"></div>
    <div id="animation-area">
      <div id="anim-empty">← выберите пример выше</div>
      <div id="anim-wrap" style="display:none"><div id="anim-tiles" style="position:relative"></div></div>
    </div>
    <div id="exercises-zone">
      <div id="ez-label">Упражнения</div>
      <div id="ez-chips"><span id="ez-empty">← выберите правило</span></div>
    </div>
  </div>

  <div id="panel-alpha">
    <div id="alpha-wrap"></div>
    <div id="alpha-desc"></div>
    <div id="grammar-explain">
      <div id="role-steps"><div id="role-steps-ribbon"></div></div>
      <div id="role-steps-text"></div>
    </div>
  </div>
</div>
<div class="tooltip" id="tooltip"></div>
`;

export function installDomStub() {
  if (typeof globalThis.document !== 'undefined' && globalThis.document.getElementById('alpha-wrap')) {
    return globalThis.__domStubDom;
  }
  const dom = new JSDOM(HTML, { url: 'https://example.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.MutationObserver = dom.window.MutationObserver;
  globalThis.CustomEvent = dom.window.CustomEvent;
  globalThis.__domStubDom = dom;
  return dom;
}
