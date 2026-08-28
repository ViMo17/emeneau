// Минимальный стаб document.createElement('canvas') — только то, что
// реально вызывает chalk-module.js (paintFlatFace/paintGlyph): fillRect,
// fillStyle, save/restore, font, measureText, fillText. НЕ полноценный
// npm-пакет `canvas` (нативная зависимость, требует компиляции cairo) —
// для целей тестирования ЛОГИКИ (не визуального результата) достаточно,
// чтобы код прошёл путь до конца и не упал, реальная отрисовка не нужна.
//
// measureText возвращает ширину, пропорциональную длине строки (та же
// приближённая формула, что использовалась при ручной проверке авто-
// подгонки шрифта в заходе 48 — коэффициент 0.62 от размера шрифта на
// символ) — этого достаточно, чтобы цикл авто-подгонки в paintGlyph
// реально сходился, а не зависал/пропускался.
function makeStubContext() {
  return {
    fillStyle: '#000000',
    font: '',
    textAlign: '',
    textBaseline: '',
    save() {},
    restore() {},
    fillRect() {},
    fillText() {},
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

// Устанавливает глобальный document (если ещё не установлен реальным DOM)
// с единственным методом, который реально используется — createElement для
// canvas. Идемпотентно — повторный вызов из нескольких тестовых файлов не
// перезаписывает уже работающий document.
export function installCanvasStub() {
  if (typeof globalThis.document !== 'undefined') return;
  globalThis.document = {
    createElement(tag) {
      if (tag === 'canvas') return makeStubCanvas();
      throw new Error(`installCanvasStub: document.createElement('${tag}') не замокан — нужен только 'canvas'`);
    },
  };
}
