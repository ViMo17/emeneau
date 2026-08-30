// agnayas (правило 3), но данные НЕ написаны вручную — собраны генератором
// (docs/app/lib/slot-engine-generate.js, buildGunaSplitExample) из тех же
// исходных фактов, что и в rule3-agnayas-slots.js: гунация (i→e, вызвана
// всем хвостом -as), затем несовместимость и распад (e+a→a+y). Самая
// сложная из покрытых генератором категорий — две разные механики подряд
// (influence+transform, затем approach+split). Цель файла — сравнение с
// рукописным оригиналом на живом полигоне
// (test-slot-engine-agnayas-generated.html vs test-slot-engine.html).
// Раскладка совпадает побайтово, activeSlots и структура arrivals —
// точно, тайминги — с постоянным смещением ~220мс по всей цепочке (тот
// же класс ручной вариации буфера после падения, что и в остальных
// генераторах — здесь автор выбрал заметно меньший буфер, чем в других
// примерах).
import { mountSlotExample, buildGunaSplitExample } from '../lib/slot-engine.js';

export const data = buildGunaSplitExample({
  words: [['a', 'g', 'n', 'i'], ['a', 's']], // agni- (основа) | -as (окончание)
  gunaTarget: { word: 0, letter: 3 }, // i → e
  gunaTrigger: { word: 1 }, // -as целиком вызывает гунацию
  toGuna: 'e', toGunaColor: 0x7DCFCA,
  approachMovers: { word: 1 }, // -as подъезжает к E и отскакивает — несовместимость
  arrivals: [
    { into: 'a', slotOffset: 0, fromOffset: { x: 1.0, y: 2.5, z: -1.5 }, delay: 500, dur: 1600, arcHeight: 0.9 },
    { into: 'y', slotOffset: 1, fromOffset: { x: 1.3, y: 3.0, z: -1.8 }, delay: 0, dur: 1850, arcHeight: 1.3 },
  ],
  ruleNum: 3,
  color: 0xAFBFD4,
});

export function mount(container) {
  return mountSlotExample(container, data);
}
