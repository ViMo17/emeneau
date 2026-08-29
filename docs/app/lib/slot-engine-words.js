// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — группы слов: «вся единица, не одна буква». Часть модульного
// разбиения slot-engine.js (Стадия 5) — см. slot-engine.js. Ничего не
// импортирует — чистые функции.
// ═══════════════════════════════════════════════════════════════════════════

/* ГРУППЫ СЛОВ (для формулы «вся единица, не одна буква»)

   «Источник влияния» (nimitta) в `influence`/`approach`/`activeSlots` не
   обязан задаваться голыми номерами слотов, подобранными вручную под
   конкретный пример — общая формула: берём вторую часть примера (второе
   «слово» — не обязательно грамматическое слово, а любая непрерывная
   группа занятых слотов), определяем её длину, определяем, какая ЧАСТЬ
   этой группы физически влияет (по умолчанию — вся группа целиком, т.к. в
   подавляющем большинстве случаев именно всё окончание/суффикс — нимитта,
   не одна его буква), фиксируем длину этой влияющей части — её положение
   уже вытекает из структуры данных (она стоит через «зазор» = пустой слот
   после первой части, ничего вычислять отдельно не нужно, зазор УЖЕ есть
   в data.initial).

   computeWordGroups(initial) — сканирует data.initial, группирует номера слотов в
   непрерывные последовательности (разрыв в нумерации = граница между «частями» примера).
   Для agnayas initial = [1,2,3,4,6,7] → группы [[1,2,3,4],[6,7]] (слот 5 пуст — это и
   есть тот самый зазор «первая часть, пробел»).

   resolveSlotRef(ref, groups) — превращает ссылку в плоский список номеров слотов:
     - число (5)              → [5]                              (обратная совместимость)
     - массив ([6,7])         → как есть, рекурсивно резолвится   (обратная совместимость)
     - { word: 2 }            → ВСЯ 2-я группа целиком (формула по умолчанию)
     - { word: 2, length: 1 } → только последние N слотов этой группы (anchor:'end' по
                                 умолчанию — триггер обычно на конце слова/окончания;
                                 anchor:'start' — первые N, если влияет начало части)
   Используется везде, где раньше был список слотов вручную: `influence.from`,
   `approach.movers`/`mover`, `steps[].activeSlots`. Не меняет уже написанные данные с
   голыми числами — старые примеры продолжают работать как есть; формула — это
   ДОПОЛНИТЕЛЬНАЯ возможность, не обязательная замена. */
/** @param {import('./slot-engine-types.js').InitialItem[]} initial @returns {number[][]} */
export function computeWordGroups(initial) {
  const slots = (initial || []).map(x => x.slot).sort((a, b) => a - b);
  const groups = [];
  let cur = [];
  for (const s of slots) {
    if (cur.length && s !== cur[cur.length - 1] + 1) { groups.push(cur); cur = []; }
    cur.push(s);
  }
  if (cur.length) groups.push(cur);
  return groups;
}
/** @param {import('./slot-engine-types.js').SlotRef} ref @param {number[][]} groups @returns {number[]} */
export function resolveSlotRef(ref, groups) {
  if (ref == null) return [];
  if (typeof ref === 'number') return [ref];
  if (Array.isArray(ref)) return ref.flatMap(r => resolveSlotRef(r, groups));
  if (typeof ref === 'object' && ref.word) {
    const g = groups[ref.word - 1];
    if (!g) return [];
    const len = ref.length ?? g.length;
    const anchor = ref.anchor ?? 'end';
    return anchor === 'start' ? g.slice(0, len) : g.slice(Math.max(0, g.length - len));
  }
  return [];
}
