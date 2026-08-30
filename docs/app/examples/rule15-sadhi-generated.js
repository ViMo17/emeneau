// śādhi (правило 15), но данные НЕ написаны вручную — собраны генератором
// (docs/app/lib/slot-engine-generate.js, buildApproachElideExample) из тех
// же исходных фактов, что и в rule15-sadhi.js: морфологические части, кто
// приближается, кто исчезает. Цель файла — сравнение с рукописным
// оригиналом на живом полигоне (test-slot-engine-rule15-generated.html vs
// test-slot-engine-rule15.html). Раскладка получилась ЦЕНТРИРОВАННОЙ по
// формуле генератора (2,3,4,6,7) — НЕ совпадает ни с исходной рукописной
// (3,4,5,7,8), ни с временно сдвинутой для диагностики прозрачности
// (0,1,2,4,5) — это ожидаемо, подтверждает, что исходная раскладка не
// была строго центрирована; вопрос центрирования примеров в приложении
// отложен пользователем на отдельный разговор. Тайминги — в пределах
// ~60мс от рукописного оригинала.
import { mountSlotExample, buildApproachElideExample } from '../lib/slot-engine.js';

export const data = buildApproachElideExample({
  words: [['ś', 'ā', 's'], ['dh', 'i']], // корень śās- | окончание -dhi
  movers: [{ word: 1, letter: 0 }, { word: 1, letter: 1 }], // dh, i едут к корню
  target: { word: 0, letter: 2 }, // s — исчезает (elide)
  ruleNum: 15,
  color: 0x869EC1,
});

export function mount(container) {
  return mountSlotExample(container, data);
}
