// tat + hiraṇyam → taddhiraṇyam (правило 70, цепочка с правилом 71), но
// данные НЕ написаны вручную — собраны генератором
// (docs/app/lib/slot-engine-generate.js, buildInfluenceTransformChain) из
// тех же исходных фактов, что и в rule70-taddhiranyam-slots.js. Цель файла
// — сравнение с рукописным оригиналом на живом полигоне
// (test-slot-engine-rule70-generated.html vs test-slot-engine-rule70.html).
// Раскладка слотов (включая сжатый блок «yam») совпадает побайтово,
// тайминги — в пределах ~20мс, ringHoldDur — точное совпадение.
import { mountSlotExample, buildInfluenceTransformChain, TRANSFORM_KIND } from '../lib/slot-engine.js';

export const data = buildInfluenceTransformChain({
  words: [['t', 'a', 't'], ['h', 'i', 'r', 'a', 'ṇ', 'yam']],
  steps: [
    {
      trigger: { word: 0, letter: 2 }, target: { word: 1, letter: 0 }, // t → h
      toGlyph: 'dh', transformKind: TRANSFORM_KIND.assimToNeighbor,
      ruleNum: 70, color: 0xAE987A, primary: true, clearance: -0.35,
    },
    {
      trigger: { word: 1, letter: 0 }, target: { word: 0, letter: 2 }, // dh → t (уже dh)
      toGlyph: 'd', transformKind: TRANSFORM_KIND.vargaPair,
      ruleNum: 71, color: 0xAE987A,
    },
  ],
});

export function mount(container) {
  return mountSlotExample(container, data);
}
