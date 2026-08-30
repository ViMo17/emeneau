// vāk asti → vāg asti (правило 71), но данные НЕ написаны вручную — собраны
// генератором (docs/app/lib/slot-engine-generate.js, buildInfluenceTransform
// Example) из тех же исходных фактов, что и в rule71-vak-asti-slots.js:
// слова, источник влияния, цель, новый глиф, категория поворота.
// Цель файла — сравнение с рукописным оригиналом на живом полигоне
// (test-slot-engine-rule71-generated.html vs test-slot-engine-rule71.html),
// не замена оригинала. Числа таймлайна СВЕРЕНЫ (не совпадают побайтово —
// расхождение ≤20мс, см. комментарии в slot-engine-generate.js), раскладка
// слотов совпадает побуквенно.
import { mountSlotExample, buildInfluenceTransformExample, TRANSFORM_KIND } from '../lib/slot-engine.js';

export const data = buildInfluenceTransformExample({
  words: [['v', 'ā', 'k'], ['a', 's', 't', 'i']],
  trigger: { word: 1, letter: 0 }, // 'a' — гласный, вызывающий озвончение
  target: { word: 0, letter: 2 },  // 'k' — становится 'g'
  toGlyph: 'g',
  transformKind: TRANSFORM_KIND.vargaPair,
  ruleNum: 71,
  color: 0xAE987A,
});

export function mount(container) {
  return mountSlotExample(container, data);
}
