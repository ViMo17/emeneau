// acchid- + -s-ta → acchitta «он рассёк» (правило 12) — s между взрывными → 0.
// КНИЖНЫЙ ПРИМЕР ЭМЕНÓ (с. 21: «acchid- 'рассёк' + -s-ta (3 л. ед. ч.
// аориста) ⇒ acchitta 'он рассёк' (см. прав. 31)»).
//
// РАЗБОР ФОРМЫ. chid- «рассекать» + аугмент a- + сигматический показатель
// аориста -s- (siC) + личное окончание 3 л. ед. ч. СРЕДНЕГО залога
// (вторичный ряд) -ta. «acchid-» дан УЖЕ готовым (ch после гласного
// удвоен — правило 10, Whitney §227; повторно здесь не проигрывается).
//
// ПОЧЕМУ БЕЗ ВРИДДХИ И ПОЧЕМУ ВЕРНУЛИСЬ К КНИГЕ (решение пользователя
// 2026-10-13, сверено дословно по Wikisource). Whitney §879b: срединный
// гласный корня в s-аористе — вриддхи в активе, БЕЗ изменения в медии
// (у Панини 7.2.1 sici vṛddhiḥ parasmaipadeṣu — вриддхи только в
// парасмайпаде). §882, парадигма chid: медий 3 sg. ácchitta. §881a:
// s перед t/th после конечного согласного корня опускается — в медии
// регулярно; §883: в активе (ácchāitta и др.) — «very rare occurrence».
// Временно (2026-10-10…13) стоявший активный acchaitta был, таким
// образом, редкой формой вместо регулярной книжной.
//
// ПРАВИЛО 12: Pāṇini 8.2.26 jhalo jhali (анувритти sasya 8.2.24, lopaḥ
// 8.2.23) — s после jhal перед jhal выпадает; оба фланга (t слева после
// cartva, t окончания справа) входят в jhal.
//
// ТРИ ФИЗИЧЕСКИХ БЛОКА (Главный принцип, CLAUDE.md Часть 2): корень
// «acchid-» — неподвижный якорь; -s- и -ta — разные морфы, падают
// раздельно. (2) -s- подъезжает к корню первым — причина cartva (d→t);
// затем (3) -ta подъезжает двухотрезочным approach (как в śādhi): leg1
// зажимает s между двумя t — условие лопы; в паузе — лопа; leg2 довозит
// окончание на освободившееся место.
//
// ДВА СОБЫТИЯ ЦЕПОЧКОЙ, ничего нового в движке:
//  B1 [Правило 31, cartva] — d перед глухим s → t (TRANSFORM_KIND.vargaPair,
//     180°, Pāṇini 8.4.55 khari ca), трёхфазный liftH (живая проверка
//     2026-10-10: зажатый соседями кубик иначе задевает их углами).
//  B2 [Правило 12] — s исчезает без остатка, полный `elide`, label 'lopa'.
//
// РАСКЛАДКА: START=0, итоговое 7-буквенное слово в слотах 0..6 — на
// финальной волне камера доводится к центру (recenter), как и было
// подтверждено на прежней версии.
import { mountSlotExample, TRANSFORM_KIND } from '../lib/slot-engine.js';

const START = 0;
// Высота трёхфазного вращения: низ вращающегося кубика (LIFT_H − 0.55)
// выше верха соседей (0.55) при LIFT_H > CUBE_SIZE (1.1), запас 0.1.
const LIFT_H = 1.2;
//   START+0 = a  ⎫
//   START+1 = c  │
//   START+2 = ch ⎬ БЛОК 1 (якорь): acchid- (готово, см. rule10)
//   START+3 = i  │ (без изменения — средний залог)
//   START+4 = d  ⎭ (→t, cartva, B1)
//   [START+5 — зазор]
//   START+6 = s  — БЛОК 2: показатель аориста -s- (→∅, лопа, B2)
//   [START+7 — зазор]
//   START+8 = t  ⎫ БЛОК 3: окончание 3 л. ед. ч. ср. залога -ta
//   START+9 = a  ⎭
export const data = {
  recenter: true,
  initial: [
    { slot: START + 0, tr: 'a' },
    { slot: START + 1, tr: 'c' },
    { slot: START + 2, tr: 'ch' },
    { slot: START + 3, tr: 'i' },
    { slot: START + 4, tr: 'd' },
    { slot: START + 6, tr: 's' },
    { slot: START + 8, tr: 't' },
    { slot: START + 9, tr: 'a' },
  ],

  steps: [
    // B1 — правило 31 (cartva), вспомогательное. Покрывает прибытие -s-
    // (физическая причина) и сам transform.
    { kind: 'rule', ruleNum: 31, start: 3220, end: 12020, activeSlots: [START + 4, START + 6], color: 0xAFBFD4, primary: false },
    // B2 — правило 12 само, целевое. Весь двухотрезочный approach окончания.
    { kind: 'rule', ruleNum: 12, start: 12020, end: 20220, activeSlots: [START + 4, START + 6, START + 8], color: 0xAFBFD4, primary: true },
  ],

  ops: [
    // ПРИБЛИЖЕНИЕ 1: -s- подъезжает к корню, закрывая зазор (retreat:false
    // — совместимое присоединение; jitterAmp:0 — не несовместимость).
    { type: 'approach', movers: [START + 6], target: START + 4, start: 3220, distance: 1.0, retreat: false, jitterAmp: 0 },

    // Причина B1: глухой s, теперь соседний, требует оглушения d.
    // 200мс после прибытия (3220+1150+200=4570).
    { type: 'influence', from: START + 6, to: START + 4, start: 4570 },

    // B1: d → t, cartva. Пауза 2600мс (4570+2600=7170). Готово на
    // 7170+900+600+1800+600+250+700=12020 — конец шага 31.
    { type: 'transform', at: START + 4, toGlyph: 't', start: 7170, ...TRANSFORM_KIND.vargaPair, liftH: LIFT_H, label: 'cartva' },

    // ПРИБЛИЖЕНИЕ 2 (окончание -ta), двухотрезочное. leg1 приземляется
    // на 12020+1150=13170; midHoldDur=5900 = 100+2500(причина)+3200
    // (elide)+100; leg2 довозит на место s.
    {
      type: 'approach', movers: [START + 8, START + 9], target: START + 4, start: 12020,
      midDistance: 2.0, midHoldDur: 5900, distance: 3.0, jitterAmp: 0,
    },

    // Причина B2: два условия — t слева (после cartva) и t справа (только
    // что подъехавшее окончание). 13170+100=13270.
    { type: 'influence', from: START + 4, to: START + 6, start: 13270, ringHoldDur: 2500 },
    { type: 'influence', from: START + 8, to: START + 6, start: 13270, ringHoldDur: 2500 },

    // B2: s исчезает. 13270+2500=15770; готово на 15770+1300+800+1100=
    // 18970 — 100мс до конца паузы (13170+5900=19070), затем leg2.
    { type: 'elide', at: START + 6, start: 15770, label: 'lopa' },

    // settle — автоматически от step.end (13170+5900+1150=20220).
  ],
};

export function mount(container) {
  return mountSlotExample(container, data);
}
