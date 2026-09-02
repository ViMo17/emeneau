// Минимальный стаб document.createElement('canvas') — только то, что
// реально вызывает chalk-module.js (paintFlatFace/paintGlyph/
// paintMetallicFace): fillRect, fillStyle, save/restore, font, measureText,
// fillText, createLinearGradient/createRadialGradient. НЕ полноценный
// npm-пакет `canvas` (нативная зависимость, требует компиляции cairo) —
// для целей тестирования ЛОГИКИ (не визуального результата) достаточно,
// чтобы код прошёл путь до конца и не упал, реальная отрисовка не нужна.
//
// measureText возвращает ширину, пропорциональную длине строки (та же
// приближённая формула, что использовалась при ручной проверке авто-
// подгонки шрифта в заходе 48 — коэффициент 0.62 от размера шрифта на
// символ) — этого достаточно, чтобы цикл авто-подгонки в paintGlyph
// реально сходился, а не зависал/пропускался.
// ДОПОЛНЕНО (заход 59, перенос applyInfluence): redrawPulseFace рисует
// кольцо пульса прямо в canvas грани — нужны ещё clearRect/drawImage
// (перерисовка поверх чистой копии) и beginPath/arc/stroke (само кольцо).
// Та же логика, что и раньше: реальная отрисовка не нужна, только чтобы
// код прошёл путь до конца и не упал.
function makeStubContext() {
  return {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    filter: 'none',
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    fillRect() {},
    fillText() {},
    clearRect() {},
    drawImage() {},
    beginPath() {},
    arc() {},
    stroke() {},
    createRadialGradient() { return { addColorStop() {} }; }, // makeShadowBlobTexture/paintMetallicFace (chalk-module.js)
    createLinearGradient() { return { addColorStop() {} }; }, // paintMetallicFace (buildMetallicMaterials, chalk-module.js)
    measureText(str) {
      const m = /(\d+)px/.exec(this.font);
      const fontSize = m ? Number(m[1]) : 16;
      return { width: str.length * fontSize * 0.62 };
    },
  };
}

function makeStubCanvas() {
  const ctx = makeStubContext();
  return {
    width: 0,
    height: 0,
    getContext() { return ctx; },
  };
}

function makeStubDiv() {
  return {
    className: '',
    // setProperty реально ЗАПИСЫВАЕТ значение под тем же именем (не
    // просто no-op) — тесты на custom-property-длительности (--label-dur,
    // --sparkle-dur) читают её обратно через style['--label-dur']; обычные
    // присваивания (style.left=...) и так работают на плейн-объекте.
    style: { setProperty(prop, val) { this[prop] = val; } },
    appendChild() {},
    remove() {},
  };
}

// Устанавливает глобальный document (если ещё не установлен реальным DOM)
// с двумя методами createElement реально использует движок — canvas
// (текстуры кубиков) и div (DOM-кольца spawnPulseRing/spawnWave). Идемпо-
// тентно — повторный вызов из нескольких тестовых файлов не перезаписывает
// уже работающий document.
export function installCanvasStub() {
  if (typeof globalThis.document !== 'undefined') return;
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') return makeStubCanvas();
      if (tag === 'div') return makeStubDiv();
      throw new Error(`installCanvasStub: document.createElement('${tag}') не замокан — нужны только 'canvas' и 'div'`);
    },
  };
}
