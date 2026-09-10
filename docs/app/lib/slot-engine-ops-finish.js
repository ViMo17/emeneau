// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — applySettle (финальная волна «готово»), applyDim/applyStepDim (притенение фона по шагу).
// Часть модульного разбиения slot-engine-ops.js — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import {
  clamp01, lerp, setOpacity,
} from './slot-engine-core.js';
import { stepIndexAt, stepTargetOpacity } from './slot-engine-steps.js';

/** @param {import('./slot-engine-types.js').SettleOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
export function applySettle(op, elapsed, ctx) {
  const { cubes } = ctx;
  const stepDelay = op.stepDelay ?? 180;
  const bounceDur = op.bounceDur ?? 600;
  const bounceH = op.bounceH ?? 0.32;
  op.slots.forEach((slot, i) => {
    const cube = cubes[slot];
    if (!cube) return;
    const start = op.start + i * stepDelay;
    if (elapsed < start || elapsed > start + bounceDur) return;
    const t = clamp01((elapsed - start) / bounceDur);
    const h = t <= 0.6
      ? bounceH * Math.sin((t / 0.6) * Math.PI)
      : bounceH * 0.3 * Math.sin(((t - 0.6) / 0.4) * Math.PI);
    cube.mesh.position.y = h;
    if (!cube._settled && t >= 0.5) {
      cube._settled = true;
      cube.mesh.material = cube.matsReady;
    }
  });
}

/* DIM (форма ручного управления, оставлена для обратной совместимости и
   точечных случаев) — притенение неактивных букв по явному списку слотов
   и окну времени. Для нового материала предпочтительно data.steps выше —
   он сам считает пересечения и снимает притенение к концу; ручной 'dim'
   по-прежнему полезен для локальных, не связанных с шагами эффектов.
   { type:'dim', slots:[...], start, end, dimOpacity=0.22, ramp=700 } */

/** @param {import('./slot-engine-types.js').DimOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
export function applyDim(op, elapsed, ctx) {
  const { cubes } = ctx;
  if (elapsed < op.start || elapsed > op.end) return;
  const dimOpacity = op.dimOpacity ?? 0.22;
  const ramp = op.ramp ?? 700;
  op.slots.forEach(slot => {
    const cube = cubes[slot];
    if (!cube) return;
    let opacity;
    if (elapsed < op.start + ramp) opacity = lerp(1, dimOpacity, clamp01((elapsed - op.start) / ramp));
    else if (elapsed < op.end - ramp) opacity = dimOpacity;
    else opacity = lerp(dimOpacity, 1, clamp01((elapsed - (op.end - ramp)) / ramp));
    setOpacity(cube.mesh, opacity);
  });
}

/* Притенение неактивных букв по текущему шагу (data.steps) — общий,
   автоматический механизм, отдельный от ручного 'dim' выше. Между
   авторскими шагами МОЖЕТ быть зазор — движок сам превращает его в явное
   «проявление» (activeSlots:'ALL', см. buildRuntimeSteps/sameActiveSlots).

   Переход на КАЖДОЙ границе шагов считается РОВНО ОДИН РАЗ — ramp-in в
   шаге, наступающем ПОСЛЕ границы, читает реальную (уже подведённую к
   цели) яркость prev, не декларативный target. Отдельного ramp-out НЕТ —
   он был бы конфликтующим (двойной счёт одного и того же перехода с
   двух концов), не просто лишним. Не op-based (сигнатура отличается от
   всех остальных apply* — вызывается раз в кадр без привязки к конкретной
   операции), но по той же схеме: внешние зависимости через ctx. */

/** @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
export function applyStepDim(elapsed, ctx) {
  const { cubes, runtimeSteps, data } = ctx;
  if (!runtimeSteps) return;
  const dimOpacity = data.dimOpacity ?? 0.22;
  const RAMP = data.stepRamp ?? 550;
  const REVEAL_STAGGER = data.revealStagger ?? 130;
  const REVEAL_RAMP = data.revealRamp ?? 700;
  const idx = stepIndexAt(elapsed, runtimeSteps);
  const cur = runtimeSteps[idx];
  const prev = runtimeSteps[idx - 1];
  // РЕАЛЬНЫЙ НАЙДЕННЫЙ БАГ: слоты под управлением активного elide (после
  // своего op.start, кубик ещё жив в cubes — elide сам удаляет его по
  // завершении) сюда попадать не должны — elide ведёт СОБСТВЕННУЮ кривую
  // прозрачности (applyElide), а притенение по activeSlots (если этот слот
  // в списке участников — обычно да) каждый кадр перебивало её обратно в 1,
  // выполняясь ПОСЛЕ applyElide в общем цикле рендера (см. renderAtElapsed).
  // До этой правки elide никогда не становился видимо прозрачным ни в одном
  // примере (śādhi, rule42, rule55) — угасание молча срабатывало только
  // математически, экран показывал резкий скачок в невидимость в конце.
  const elideControlled = new Set(
    (data.ops || [])
      .filter(op => op.type === 'elide')
      .filter(op => op.start <= elapsed && cubes[op.at])
      .map(op => op.at)
  );
  const orderedSlots = Object.keys(cubes)
    .filter(key => /^\d+$/.test(key))
    .map(Number)
    .sort((a, b) => a - b); // порядок слева направо — тот самый, что просила пользователь
  const enteringReveal = prev && cur.activeSlots === 'ALL';
  orderedSlots.forEach((slot, order) => {
    if (elideControlled.has(slot)) return;
    const cube = cubes[slot];
    let target = stepTargetOpacity(cur, slot, dimOpacity);
    if (enteringReveal) {
      const t = clamp01((elapsed - cur.start - order * REVEAL_STAGGER) / REVEAL_RAMP);
      target = lerp(stepTargetOpacity(prev, slot, dimOpacity), target, t);
    } else if (prev && elapsed - cur.start < RAMP) {
      const t = clamp01((elapsed - cur.start) / RAMP);
      target = lerp(stepTargetOpacity(prev, slot, dimOpacity), target, t);
    }
    setOpacity(cube.mesh, target);
  });
}

