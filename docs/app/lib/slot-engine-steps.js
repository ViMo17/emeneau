// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — шаги (грамматика / правило N): построение runtime-таймлайна
// и целевой прозрачности по текущему шагу. Часть модульного разбиения
// slot-engine.js (Стадия 5) — см. slot-engine.js. Ничего не импортирует.
// ═══════════════════════════════════════════════════════════════════════════

/* ШАГИ (грамматика / правило N)

   Раздел данных примера — необязательный, но рекомендованный вместо
   ручных 'dim'-операций для основного случая «что сейчас активно».

   data.steps = [
     { kind:'grammar', label:'грам.', start, end, activeSlots:[...] },
     { kind:'rule', ruleNum: 3, start, end, activeSlots:[...] },
     ...
   ]

   Требование: шаги идут подряд без разрывов (end одного = start следующего) —
   движок сам добавляет служебный «хвост» после последнего шага (до конца
   ролика), в котором ничего не притенено — так дим плавно снимается перед
   финальной волной READY_COLOR (applySettle), а не остаётся зависшим.

   Для каждого кубика в НУМЕРОВАННОМ слоте (временные ключи отстойника —
   не трогаем, ими управляет сама операция split): если слот входит в
   activeSlots текущего шага — полная непрозрачность, если нет — притенён.
   У границ шагов — плавный переход (RAMP мс), не рывок. */
/**
 * @param {import('./slot-engine-types.js').RuntimeStep | null} step
 * @param {number} slot
 * @param {number} dimOpacity
 * @returns {number}
 */
export function stepTargetOpacity(step, slot, dimOpacity) {
  if (!step) return 1;
  if (step.activeSlots === 'ALL') return 1;
  return (step.activeSlots || []).includes(slot) ? 1 : dimOpacity;
}

/* Между авторскими шагами МОЖЕТ быть зазор (steps[i].start > steps[i-1].end) —
   движок сам превращает такой зазор в явное «проявление»: все буквы становятся
   активны (activeSlots:'ALL') на всё время зазора, с обычными рамп-переходами
   по краям (тот же RAMP, что и у любой другой границы шага). Снятие притенения
   и возврат исходных цветов = сигнал «шаг преобразований закончен», прежде чем
   начнётся притенение под следующий шаг. Если зазора нет (шаги примыкают
   впритык) — мгновенный кроссфейд без паузы. Хвост после последнего шага уже
   и так «развиден» — это и есть сигнал конца ВСЕХ преобразований перед волной
   settle. */
// Проявление («все видны») семантически означает «состав участников
// меняется» — если activeSlots у соседних шагов ОДИНАКОВЫ (цепочка правил
// с тем же составом, как у taddhiraṇyam: оба шага держат [2,4]), реальной
// причины показывать проявление нет, а при коротком зазоре и широкой
// раскладке (много кубиков → большой суммарный сдвиг REVEAL_STAGGER) волна
// проявления ещё и не успевает докатиться до дальнего края за отведённое
// время — обрывается на полпути и откатывается назад, левая и правая
// половина ряда оказываются на разной стадии прерванной волны. Поэтому
// одинаковый состав активных слотов — зазор пропускается без проявления.
/**
 * a/b — уже РАЗРЕШЁННЫЕ activeSlots соседних runtime-шагов (см. resolveSlotRef
 * в slot-engine-mount.js), не сырой SlotRef автора.
 * @param {'ALL' | number[]} a
 * @param {'ALL' | number[]} b
 * @returns {boolean}
 */
export function sameActiveSlots(a, b) {
  if (a === 'ALL' || b === 'ALL') return a === b;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y), sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}
/**
 * steps — авторские шаги ПОСЛЕ разрешения activeSlots в плоский массив
 * (см. resolveSlotRef в slot-engine-mount.js) — вот почему тип параметра
 * RuntimeStep (уже разрешённая форма), а не сырой Step.
 * @param {import('./slot-engine-types.js').RuntimeStep[] | undefined} steps
 * @returns {import('./slot-engine-types.js').RuntimeStep[] | null}
 */
export function buildRuntimeSteps(steps) {
  if (!steps || !steps.length) return null;
  const list = [];
  // До старта первого авторского шага (data.steps[0].start) stepIndexAt
  // (смотрит только на .end, не на .start) всё равно считал бы ТЕКУЩИМ уже
  // этот шаг и применял бы его притенение МГНОВЕННО, без рампы (у первого
  // шага нет prev) — буквы, не входящие в его activeSlots, гасли бы ещё в
  // воздухе, до приземления. Симметрично хвостовому виртуальному шагу — если
  // до первого шага есть зазор (обычно есть, т.к. шаг стартует уже после
  // падения), добавляем такой же «пока всё видно» участок в начале.
  if (steps[0].start > 0) {
    list.push({ _virtual: true, activeSlots: 'ALL', start: 0, end: steps[0].start });
  }
  for (let i = 0; i < steps.length; i++) {
    if (i > 0 && steps[i].start > steps[i - 1].end && !sameActiveSlots(steps[i].activeSlots, steps[i - 1].activeSlots)) {
      list.push({ _reveal: true, activeSlots: 'ALL', start: steps[i - 1].end, end: steps[i].start });
    }
    list.push(steps[i]);
  }
  const last = list[list.length - 1];
  list.push({ _virtual: true, activeSlots: 'ALL', start: last.end, end: Infinity });
  return list;
}

/** @param {number} elapsed @param {import('./slot-engine-types.js').RuntimeStep[]} runtimeSteps @returns {number} */
export function stepIndexAt(elapsed, runtimeSteps) {
  for (let i = 0; i < runtimeSteps.length; i++) {
    if (elapsed < runtimeSteps[i].end) return i;
  }
  return runtimeSteps.length - 1;
}
