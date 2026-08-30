// āsīt (правило 7), но данные НЕ написаны вручную — собраны генератором
// (docs/app/lib/slot-engine-generate.js, buildApproachMergeExample) из тех
// же исходных фактов, что и в rule7-asit.js: морфологические части,
// какие буквы примыкают, какие сливаются, новый глиф. Цель файла —
// сравнение с рукописным оригиналом на живом полигоне
// (test-slot-engine-rule7-generated.html vs test-slot-engine-rule7.html).
// Раскладка слотов совпадает побуквенно, тайминги — в пределах ~40мс.
import { mountSlotExample, buildApproachMergeExample } from '../lib/slot-engine.js';

export const data = buildApproachMergeExample({
  words: [['a'], ['a', 's'], ['ī', 't']], // аугмент | корень as- | окончание -īt
  attach: {
    movers: [{ word: 2, letter: 0 }, { word: 2, letter: 1 }], // ī, t
    target: { word: 1, letter: 1 }, // s — окончание примыкает к основе
  },
  merge: {
    from: { word: 0, letter: 0 }, // аугмент a
    at: { word: 1, letter: 0 },   // корневой a → станет ā
    toGlyph: 'ā',
  },
  ruleNum: 7,
  color: 0xAFBFD4,
});

export function mount(container) {
  return mountSlotExample(container, data);
}
