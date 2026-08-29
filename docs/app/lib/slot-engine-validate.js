// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — валидация данных примера. Часть модульного разбиения
// slot-engine.js (Стадия 5) — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import { N_SLOTS } from './slot-engine-core.js';

/* ═══════════════════ ВАЛИДАЦИЯ ДАННЫХ ПРИМЕРА ═══════════════════

   Системная граница: data приходит из docs/app/examples/ruleN-*.js —
   написанного вручную файла (человеком или в чате), не гарантированно
   корректного. Поля, у которых в apply*-функциях НЕТ `??`-дефолта
   (arr.delay/arr.dur в split.arrivals и arrive.items, op.end в dim,
   и т.д.), при опечатке дают тихий NaN/undefined где-то в кадровом
   цикле — визуально это «кубик просто не появился» или «застыл на
   месте», без единой ошибки в консоли, разбирать которую пришлось бы
   печатанием чисел вручную. Здесь — явная проверка ДО первого кадра,
   с понятным сообщением, что именно и где не так.

   Не полная JSON-схема и не проверка временнóй корректности (что на
   каждый elapsed физически существует нужный кубик) — только форма и
   типы полей, которые apply*-функции разыменовывают напрямую. */
function isSlotNum(v) { return Number.isInteger(v) && v >= 0 && v < N_SLOTS; }
function isFiniteNum(v) { return typeof v === 'number' && Number.isFinite(v); }
// Ссылка на слот(а) — те же формы, что понимает resolveSlotRef: число,
// массив (рекурсивно), либо {word, length?, anchor?}.
function isSlotRef(ref) {
  if (typeof ref === 'number') return isSlotNum(ref);
  if (Array.isArray(ref)) return ref.length > 0 && ref.every(isSlotRef);
  if (ref && typeof ref === 'object') {
    return Number.isInteger(ref.word) && ref.word >= 1
      && (ref.length === undefined || Number.isInteger(ref.length))
      && (ref.anchor === undefined || ref.anchor === 'start' || ref.anchor === 'end');
  }
  return false;
}
const KNOWN_OP_TYPES = new Set(['influence', 'approach', 'transform', 'split', 'arrive', 'merge', 'elide', 'settle', 'dim']);

/** @param {import('./slot-engine-types.js').ExampleData} data @returns {string[]} список проблем, пустой массив если данные корректны */
export function validateExampleData(data) {
  const problems = [];
  if (!data || typeof data !== 'object') return ['data должен быть объектом'];

  if (!Array.isArray(data.initial) || data.initial.length === 0) {
    problems.push('data.initial должен быть непустым массивом {slot, tr}');
  } else {
    const seen = new Set();
    data.initial.forEach((item, i) => {
      if (!item || typeof item !== 'object') { problems.push(`data.initial[${i}] должен быть объектом {slot, tr}`); return; }
      if (!isSlotNum(item.slot)) problems.push(`data.initial[${i}].slot должен быть целым числом 0..${N_SLOTS - 1} (получено: ${item.slot})`);
      else if (seen.has(item.slot)) problems.push(`data.initial: слот ${item.slot} указан дважды`);
      else seen.add(item.slot);
      if (typeof item.tr !== 'string' || !item.tr) problems.push(`data.initial[${i}].tr должен быть непустой строкой`);
    });
  }

  if (data.steps !== undefined) {
    if (!Array.isArray(data.steps)) {
      problems.push('data.steps должен быть массивом');
    } else {
      data.steps.forEach((step, i) => {
        if (!step || typeof step !== 'object') { problems.push(`data.steps[${i}] должен быть объектом`); return; }
        if (step.kind !== 'grammar' && step.kind !== 'rule') problems.push(`data.steps[${i}].kind должен быть 'grammar' или 'rule' (получено: ${step.kind})`);
        if (!isFiniteNum(step.start)) problems.push(`data.steps[${i}].start должен быть числом`);
        if (!isFiniteNum(step.end)) problems.push(`data.steps[${i}].end должен быть числом`);
        if (isFiniteNum(step.start) && isFiniteNum(step.end) && step.end <= step.start) {
          problems.push(`data.steps[${i}]: end (${step.end}) должен быть больше start (${step.start})`);
        }
        if (step.activeSlots !== 'ALL' && !isSlotRef(step.activeSlots)) {
          problems.push(`data.steps[${i}].activeSlots должен быть 'ALL', номером слота, ссылкой {word} или массивом этого`);
        }
      });
      for (let i = 1; i < data.steps.length; i++) {
        const prev = data.steps[i - 1], cur = data.steps[i];
        if (isFiniteNum(prev?.end) && isFiniteNum(cur?.start) && cur.start < prev.end) {
          problems.push(`data.steps[${i}]: start (${cur.start}) раньше конца предыдущего шага (${prev.end}) — шаги не могут пересекаться`);
        }
      }
    }
  }

  if (data.ops !== undefined) {
    if (!Array.isArray(data.ops)) {
      problems.push('data.ops должен быть массивом');
    } else {
      data.ops.forEach((op, i) => {
        if (!op || typeof op !== 'object') { problems.push(`data.ops[${i}] должен быть объектом`); return; }
        const where = `data.ops[${i}] (type:${op.type})`;
        if (!KNOWN_OP_TYPES.has(op.type)) { problems.push(`data.ops[${i}]: неизвестный type "${op.type}" — ожидается один из [${[...KNOWN_OP_TYPES].join(', ')}]`); return; }
        if (!isFiniteNum(op.start)) problems.push(`${where}.start должен быть числом`);
        const need = (cond, msg) => { if (!cond) problems.push(`${where}: ${msg}`); };
        const needArc = (obj, w) => {
          if (typeof obj.into !== 'string' || !obj.into) problems.push(`${w}.into должен быть непустой строкой`);
          if (!isSlotNum(obj.newSlot)) problems.push(`${w}.newSlot должен быть номером слота`);
          if (!obj.from || !isFiniteNum(obj.from.x) || !isFiniteNum(obj.from.y) || !isFiniteNum(obj.from.z)) problems.push(`${w}.from должен быть {x,y,z}`);
          if (!isFiniteNum(obj.delay)) problems.push(`${w}.delay должен быть числом (используется без дефолта)`);
          if (!isFiniteNum(obj.dur)) problems.push(`${w}.dur должен быть числом (используется без дефолта)`);
        };
        switch (op.type) {
          case 'influence':
            need(isSlotRef(op.from), 'from должен быть номером слота, {word} или массивом этого');
            need(isSlotNum(op.to), 'to должен быть номером слота');
            break;
          case 'approach':
            need(isSlotRef(op.movers ?? op.mover), 'movers/mover должен быть номером слота, {word} или массивом этого');
            need(isSlotNum(op.target), 'target должен быть номером слота');
            break;
          case 'transform':
            need(isSlotNum(op.at), 'at должен быть номером слота');
            need(typeof op.toGlyph === 'string' && !!op.toGlyph, 'toGlyph должен быть непустой строкой');
            break;
          case 'split':
            need(isSlotNum(op.at), 'at должен быть номером слота');
            need(Array.isArray(op.arrivals) && op.arrivals.length > 0, 'arrivals должен быть непустым массивом');
            (op.arrivals || []).forEach((arr, j) => needArc(arr, `${where}.arrivals[${j}]`));
            break;
          case 'arrive':
            need(Array.isArray(op.items) && op.items.length > 0, 'items должен быть непустым массивом');
            (op.items || []).forEach((item, j) => needArc(item, `${where}.items[${j}]`));
            break;
          case 'merge':
            need(isSlotNum(op.from), 'from должен быть номером слота');
            need(isSlotNum(op.at), 'at должен быть номером слота');
            need(typeof op.toGlyph === 'string' && !!op.toGlyph, 'toGlyph должен быть непустой строкой');
            break;
          case 'elide':
            need(isSlotNum(op.at), 'at должен быть номером слота');
            break;
          case 'settle':
            need(Array.isArray(op.slots) && op.slots.length > 0, 'slots должен быть непустым массивом номеров слотов');
            break;
          case 'dim':
            need(Array.isArray(op.slots) && op.slots.length > 0, 'slots должен быть непустым массивом номеров слотов');
            need(isFiniteNum(op.end), 'end должен быть числом (используется без дефолта)');
            break;
        }
      });
    }
  }

  return problems;
}
