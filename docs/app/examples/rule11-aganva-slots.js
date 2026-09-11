// agam- + va → aganva «шли (мы оба)» (правило 11) — шестой пример фазы
// автоматической постройки по номерам правил. gam- «идти» (корень) →
// аористная основа agam- (аугмент a- + корень) + va (личн. оконч. 1 л.
// дв.ч.). Финальный m корня перед v (или m) заменяется на n — Whitney
// §212a (сверено дословно, Wikisource): «before m or v, [final radical m]
// is changed to n: thus, from √gam come áganma, aganmahi, ganvahi». Pāṇini
// 8.2.65 mvoś ca (адхикара 8.2.64, dhātor makārasya nakāra ādeśaḥ) —
// найдено через WebSearch-сниппеты Kāśikāvṛtti, не через прямую сверку
// первоисточника (открытый пункт, тот же класс, что у rule5's сутры).
//
// МЕХАНИКА — та же, что у agnayas (грам.-шаг i→e) и taddhiraṇyam (h→dh):
// одно слово, граница морфем чисто условная (не физический зазор) — root
// и окончание падают уже рядом, approach не нужен (в отличие от śādhi/
// rule42, где сближение — само содержание события). influence (v→m) +
// transform (m→n) на месте.
//
// TRANSFORM_KIND.assimToNeighbor (360°, нейтральная грань), НЕ vargaPair
// (180°) — m и n НЕ парные звуки внутри ОДНОЙ варги (m — губной носовой,
// n — зубной носовой, разные варги), это полная смена варги целиком, тот
// же класс, что у h→dh/h→gh (taddhiraṇyam) — только там согласный вне
// всех варг, здесь m уже носовой внутри своей варги, но лексикализованно
// переходит в ДРУГУЮ варгу целиком (не по общему правилу ассимиляции по
// месту — Whitney явно называет это исключением, не проверено ни для
// каких других сочетаний, кроме m перед v/m).
//
// clearance:0/clearanceZ:-0.5 — оба соседа (a слева, v справа) заняты без
// зазора, тот же геометрический фикс, что уже трижды применялся (rule2/
// rule6/suhārt/rule10).
import { mountSlotExample, centeredStart, TRANSFORM_KIND } from '../lib/slot-engine.js';

const START = centeredStart(6); // = 2
//   START+0=a, START+1=g, START+2=a, START+3=m→n, START+4=v, START+5=a
export const data = {
  initial: [
    { slot: START + 0, tr: 'a' },
    { slot: START + 1, tr: 'g' },
    { slot: START + 2, tr: 'a' },
    { slot: START + 3, tr: 'm' },
    { slot: START + 4, tr: 'v' },
    { slot: START + 5, tr: 'a' },
  ],
  steps: [
    { kind: 'rule', ruleNum: 11, start: 2600, end: 7300, activeSlots: [START + 3, START + 4], color: 0xAFBFD4, primary: true },
  ],
  ops: [
    { type: 'influence', from: START + 4, to: START + 3, start: 2700, ringHoldDur: 4600 },
    { type: 'transform', at: START + 3, toGlyph: 'n', start: 5300, ...TRANSFORM_KIND.assimToNeighbor, clearance: 0, clearanceZ: -0.5, label: 'ассимиляция' },
  ],
};

export function mount(container) {
  return mountSlotExample(container, data);
}
