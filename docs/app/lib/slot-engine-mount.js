// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — mountSlotExample: сцена, кадровый цикл, лента шагов, стили.
// Часть модульного разбиения slot-engine.js (Стадия 5) — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import { slotX, clamp01, easeFall } from './slot-engine-core.js';
import { makeCube, updateShadow, isSharedResource } from './slot-engine-cube.js';
import { computeWordGroups, resolveSlotRef } from './slot-engine-words.js';
import { buildRuntimeSteps, stepIndexAt } from './slot-engine-steps.js';
import { validateExampleData } from './slot-engine-validate.js';
import {
  applyInfluence, applyApproach, applyTransform, applySplit, applyArrive,
  applyMerge, applyElide, applySettle, applyDim, applyStepDim, disposePulseFace,
} from './slot-engine-ops.js';

export function mountSlotExample(container, data, opts = {}) {
  const problems = validateExampleData(data);
  if (problems.length) {
    throw new Error('Некорректные данные примера:\n' + problems.map(p => '  - ' + p).join('\n'));
  }
  injectStylesOnce();

  // .slot-stage держит min-height:220px (не только height:100%) — без
  // явной страховки сцена рискует схлопнуться в 0px в контейнерах без
  // собственной явной высоты (#anim-tiles в sanskrit-sandhi-app.html —
  // чистый flex:1 1 auto;min-height:0), не только в изолированных тестах,
  // где контейнер всегда получает высоту снаружи (vh/px).
  container.innerHTML = `<div class="slot-stage" style="width:100%;height:100%;min-height:220px;position:relative;display:flex;flex-direction:column;">
    <div class="slot-canvas-wrap" style="position:relative;flex:1 1 auto;min-height:0;">
      <div class="slot-labels" style="position:absolute;inset:0;pointer-events:none;overflow:hidden;"></div>
    </div>
    <div class="slot-steps"></div>
  </div>`;
  const stageEl = container.querySelector('.slot-canvas-wrap');
  const labelsEl = container.querySelector('.slot-labels');
  const stepsEl = container.querySelector('.slot-steps');

  // группы слов (по зазорам в data.initial) — общая формула вместо ручных номеров
  // слотов, см. computeWordGroups/resolveSlotRef выше. Доступна ниже как замыкание
  // (applyInfluence/applyApproach) и здесь же — для разрешения activeSlots шагов.
  const wordGroupsList = computeWordGroups(data.initial);

  // data — ЕДИНЫЙ объект МОДУЛЯ (export const data в examples/*.js), не
  // одноразовое состояние конкретного показа — переиспользуется на каждый
  // повторный mount() (replay, повторный клик, два пересёкшихся по времени
  // монтирования). apply* пишут флаги (`op._began`, `op._swapped`,
  // `op._done`, `op._pulsedAt`...) ПРЯМО на объекты op — если бы это были
  // объекты data.ops, они делились бы МЕЖДУ прогонами: при двух
  // пересёкшихся прогонах (два набора кубиков, но один и тот же набор
  // op-флагов) тот, что успел раньше, «съедал» бы флаг, и второй прогон
  // пропускал бы своё же превращение целиком, потому что guard видел бы
  // флаг уже true от чужого прогона. Поэтому ops клонируются заново на
  // каждый mount(), без унаследованных «_»-полей ни от какого предыдущего
  // прогона — data.ops остаётся нетронутым модульным экспортом.
  const ops = (data.ops || []).map(op => {
    const clean = {};
    for (const k in op) if (!k.startsWith('_')) clean[k] = op[k];
    return clean;
  });

  // лента шагов — чипы строятся один раз из data.steps (если есть); activeSlots
  // каждого шага прогоняется через resolveSlotRef — ссылки вида {word:2} становятся
  // плоским списком номеров слотов ДО того, как в дело вступит buildRuntimeSteps
  // (та функция как была «глухой» к словам-группам, так и остаётся — проще).
  const resolvedAuthoredSteps = (data.steps || []).map(step => {
    if (!step.activeSlots || step.activeSlots === 'ALL') return step;
    return { ...step, activeSlots: [...new Set(resolveSlotRef(step.activeSlots, wordGroupsList))] };
  });
  const runtimeSteps = buildRuntimeSteps(resolvedAuthoredSteps);

  // Момент старта settle СЧИТАЕТСЯ автоматически, не прописывается в
  // данных примера вручную — ручное число легко рассинхронизировать с
  // реальным таймлайном при любой правке скорости более ранних операций
  // (число settle.start пришлось бы пересчитывать вручную при каждом
  // сдвиге, и до первого случая, когда кто-то забыл это сделать, ошибка
  // не проявляется). Формула: конец хвостового шага (= конец последнего
  // авторского шага) + время последнего по порядку кубика на стаггер+рампу
  // проявления + пауза (data.settleDelay ?? 1000). Явный settle в ops
  // по-прежнему в приоритете (обратная совместимость / нестандартный
  // старт) — автоматика только достраивает недостающее. Пишет в ЛОКАЛЬНЫЙ
  // ops, не в data.ops — иначе при повторном mount() settle накапливался
  // бы по одному на каждый показ.
  const hasExplicitSettle = ops.some(op => op.type === 'settle');
  if (!hasExplicitSettle && runtimeSteps) {
    const tail = runtimeSteps[runtimeSteps.length - 1];
    // merge поглощает кубик-источник целиком, elide заставляет кубик
    // исчезнуть целиком (см. applyMerge/applyElide, оба делают delete
    // cubes[...]) — их номера слотов должны ВЫЙТИ из финального набора,
    // иначе settle попытается подсветить кубик, который к моменту своего
    // старта уже не существует.
    const goneSlots = new Set([
      ...ops.filter(op => op.type === 'merge').map(op => op.from),
      ...ops.filter(op => op.type === 'elide').map(op => op.at),
    ]);
    const finalSlots = [...new Set([
      ...data.initial.map(x => x.slot),
      ...ops
        .filter(op => op.type === 'split')
        .flatMap(op => (op.arrivals || []).map(a => a.newSlot)),
      ...ops
        .filter(op => op.type === 'arrive')
        .flatMap(op => (op.items || []).map(a => a.newSlot)),
    ])].filter(s => !goneSlots.has(s)).sort((a, b) => a - b);
    const revealStagger = data.revealStagger ?? 130;
    const revealRamp = data.revealRamp ?? 700;
    const lastRevealEnd = tail.start + (finalSlots.length - 1) * revealStagger + revealRamp;
    const settleDelay = data.settleDelay ?? 1000;
    ops.push({
      type: 'settle', slots: finalSlots, start: lastRevealEnd + settleDelay,
    });
  }

  const authoredSteps = resolvedAuthoredSteps;
  authoredSteps.forEach((step, i) => {
    const chip = document.createElement('div');
    // Цвет чипа определяется ТОЛЬКО тем, главный ли шаг (primary), не его
    // kind: главный — цвет своего тира (is-rule+is-primary, крупно); ВСЁ
    // остальное — грамматика И любое вспомогательное/цепочное правило
    // (например, правило 71 внутри примера про правило 70) — один и тот
    // же стандартизированный охровый тон is-grammar (#CDA84E), мелко, не
    // новый цвет под каждый случай. Текст подписи («Правило N» /
    // «Грамматика») по-прежнему берётся из step.kind отдельно, независимо
    // от того, каким классом это красится.
    const isPrimary = step.kind === 'rule' && step.primary;
    const cls = ['slot-step-chip', isPrimary ? 'is-rule' : 'is-grammar'];
    if (isPrimary) cls.push('is-primary');
    chip.className = cls.join(' ');
    const tag = step.kind === 'grammar' ? (step.label || 'Грамматика') : (step.label || ('Правило ' + (step.ruleNum ?? '?')));
    chip.textContent = 'Шаг ' + (i + 1) + '. ' + tag;
    // Клик по шагу — полная чистая пересборка сцены (unmount убирает
    // старую целиком, тот же путь, что и при обычной смене примера) с
    // новой точкой отсчёта времени, см. opts.startAt в сигнатуре
    // mountSlotExample выше — не перемотка уже идущего прогона.
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', () => {
      unmount();
      mountSlotExample(container, data, { startAt: step.start });
    });
    // Цвет кнопки «Правило N» — из данных примера (step.color, hex-число),
    // ожидается тот же цвет, что и у карточки этого правила на панели слева
    // в sanskrit-sandhi-app.html (классы .c1–.c4) — применяется к любому
    // 'rule'-шагу, не только primary (см. комментарий выше).
    if (step.kind === 'rule' && step.color != null) {
      chip.style.setProperty('--rule-chip-color', '#' + step.color.toString(16).padStart(6, '0'));
    }
    stepsEl.appendChild(chip);
    step._chipEl = chip;
  });
  let _lastStepIdx = -1;

  function updateSteps(elapsed) {
    if (!runtimeSteps) return;
    const idx = stepIndexAt(elapsed, runtimeSteps);
    const curStep = runtimeSteps[idx];
    authoredSteps.forEach((step, i) => {
      step._chipEl.classList.toggle('active', step === curStep);
    });
    if (!curStep._virtual && !curStep._reveal && idx !== _lastStepIdx) {
      // маркер-вспышка ровно в момент, когда становится текущим НОВЫЙ
      // авторский шаг (в т.ч. переход грамматика→правило) — то самое
      // «нужен отдельный визуальный маркер», отмеченное как нерешённое
      // в second-examples-todo.md. На _reveal (пауза-проявление между шагами)
      // и _virtual (финальный хвост) не срабатывает — там нет своего чипа,
      // сигналом служит само проявление, отдельная вспышка не нужна.
      flashStepBoundary(curStep);
      // Движок сам сообщает о смене авторского шага НАРУЖУ (не держит
      // отдельную кнопочную ленту переключения ролей внутри себя) —
      // хост-страница слушает событие на container и сама решает, что с
      // ним делать (обычно — подсветить соответствующий шаг в 2D-системе
      // ролей); один источник истины про текущий шаг, не два независимых
      // набора «Шаг 1/Шаг 2» на экране одновременно.
      const stepIdx = authoredSteps.indexOf(curStep);
      container.dispatchEvent(new CustomEvent('slotstep', {
        detail: { index: stepIdx, kind: curStep.kind, ruleNum: curStep.ruleNum },
      }));
    }
    if (idx !== _lastStepIdx) _lastStepIdx = idx;
  }

  function flashStepBoundary(step) {
    // Раньше здесь ещё была верхняя полоса-вспышка (.slot-step-flashbar,
    // золотая, во всю ширину сцены) — по обратной связи читалась как
    // «мелькающая оранжевая полоса сверху», лишний шум. Убрана: чипа-вспышки
    // снизу и самого (теперь последовательного, см. applyStepDim) проявления
    // букв достаточно как сигнала смены шага, отдельная полоса не нужна.
    const chip = step._chipEl;
    if (chip) {
      chip.classList.remove('flash'); void chip.offsetWidth; // рестарт CSS-анимации
      chip.classList.add('flash');
    }
  }

  /* Развидка (снятие притенения) — ПОСЛЕДОВАТЕЛЬНАЯ, слева направо, не
     одновременная. Раньше все буквы разом ре-таргетировались одним общим
     RAMP — по прямой обратной связи после просмотра это читалось как
     «нелогичные вздрагивания и мелькания», а не как ясный сигнал «шаг
     закончен». Теперь у каждой буквы свой сдвиг старта (по её порядку слева
     направо среди занятых слотов), и сам переход медленнее и мягче обычного
     межшагового RAMP — «не спеша», её слово. Действует только на РАЗВИДКУ
     (переход к activeSlots:'ALL' — пауза между шагами и финальный хвост
     перед settle); сужение притенения под НОВЫЙ узкий шаг (обратное
     направление) остаётся одновременным, как раньше — туда претензий не
     было, и резкое «внимание сузилось» там уместнее плавного расползания. */
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const camBase = new THREE.Vector3(0, 3.2, 9.5);
  camera.position.copy(camBase);
  // Верхняя граница сцены проверена реальной проекционной математикой
  // камеры (THREE.Vector3.project), не на глаз — на верхний край кубика в
  // отстойнике (holdOffset.y=2.4 + CUBE_SIZE/2) —
  // при lookAt(0,0,0) он проецируется в NDC y=1.069, за пределами кадра
  // (край кадра — ровно 1.0). Ряд кубиков при этом использует только
  // нижнюю половину кадра (низ ряда — NDC y≈−0.18, до края −1 ещё много
  // запаса) — «места много» подтвердилось расчётом, не только на вид.
  // lookAt(0, 0.4, 0) вместо (0,0,0) — камера чуть наклоняется вверх,
  // верхний край отстойника уходит на NDC y≈0.93 (с запасом), ряд остаётся
  // хорошо видимым (низ ряда NDC y≈−0.31, ещё не у края). Общий фикс, не
  // частность agnayas — тот же отстойник у любого будущего split.
  camera.lookAt(0, 0.4, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputEncoding = THREE.sRGBEncoding;
  stageEl.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 0.6);
  key.position.set(3, 6, 4);
  scene.add(key);

  const cubes = {}; // slot-index → кубик
  // ctx — единый объект контекста для всех apply*-функций (см. ═ ОПЕРАЦИИ ═
  // выше) — тот же самый объект передаётся во все, не создаётся заново под
  // каждую.
  const ctx = { cubes, camera, stageEl, labelsEl, wordGroupsList, scene, runtimeSteps, data };
  // ВРЕМЕННЫЙ диагностический люк (заход 65) — открывает состояние движка
  // из консоли браузера (window.__slotDebug), чтобы проверять РЕАЛЬНЫЕ
  // числа на работающей странице, не строить гипотезы по коду вслепую.
  // Убрать, когда причина асимметричной прозрачности найдена и исправлена.
  if (typeof window !== 'undefined') window.__slotDebug = ctx;
  const fallOrder = data.initial.map(x => x.slot).sort((a, b) => a - b);
  data.initial.forEach(({ slot, tr }) => {
    const c = makeCube(tr, slot * 97 + 13);
    c.mesh.position.set(slotX(slot), 6 + Math.random() * 2, 0); // старт высоко, с разбросом
    c._fallStart = fallOrder.indexOf(slot) * (data.fallStagger ?? 260); // было 200 — медленнее, спокойнее
    c._fallDur = data.fallDur ?? 1300; // было 900
    c._fallDone = false;
    scene.add(c.mesh);
    scene.add(c.shadow);
    cubes[slot] = c;
  });

  function fallY(elapsed, cube) {
    const t = clamp01((elapsed - cube._fallStart) / cube._fallDur);
    if (elapsed < cube._fallStart) return cube.mesh.position.y;
    const fromY = 6, toY = 0;
    return fromY + (toY - fromY) * easeFall(t);
  }

  function resize() {
    const w = stageEl.clientWidth, h = stageEl.clientHeight;
    if (w === 0 || h === 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(stageEl);
  resize();

  // Клик по шагу не перематывает уже идущий прогон (для этого пришлось бы
  // уметь считать состояние в обратном времени — сложно для направленного
  // движения типа approach/split) — сдвигает ТОЧКУ ОТСЧЁТА нового, полностью
  // свежего прогона: t0 смещается назад на opts.startAt, поэтому первый же
  // кадр уже вычисляет elapsed ≈ opts.startAt, и все ops, проверяющие
  // пороги по elapsed с одноразовыми флагами, корректно каскадом проходят
  // все более ранние фазы за один кадр — те же свежие флаги на каждый
  // вызов, что и у ops при обычном mount(), просто здесь elapsed сразу
  // большой, а не растёт с нуля.
  const t0 = performance.now() - (opts.startAt ?? 0);
  let rafId = null;

  function frame(now) {
    const elapsed = now - t0;
    Object.values(cubes).forEach(cube => {
      if (!cube._fallDone) {
        cube.mesh.position.y = fallY(elapsed, cube);
        if (elapsed >= cube._fallStart + cube._fallDur) cube._fallDone = true;
      }
    });
    ops.forEach(op => {
      if (op.type === 'influence') applyInfluence(op, elapsed, ctx);
      else if (op.type === 'approach') applyApproach(op, elapsed, ctx);
      else if (op.type === 'transform') applyTransform(op, elapsed, ctx);
      else if (op.type === 'split') applySplit(op, elapsed, ctx);
      else if (op.type === 'arrive') applyArrive(op, elapsed, ctx);
      else if (op.type === 'merge') applyMerge(op, elapsed, ctx);
      else if (op.type === 'elide') applyElide(op, elapsed, ctx);
      else if (op.type === 'settle') applySettle(op, elapsed, ctx);
      else if (op.type === 'dim') applyDim(op, elapsed, ctx);
    });
    applyStepDim(elapsed, ctx);
    updateSteps(elapsed);
    Object.values(cubes).forEach(updateShadow);
    camera.position.copy(camBase);
    renderer.render(scene, camera);
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  // Форма кубика/тени и текстура тени — ОБЩИЕ на все примеры (см.
  // slot-engine-cube.js), принадлежат странице целиком, не одному показу —
  // unmount() их обходит, иначе следующий mount() (клик по шагу, replay,
  // переключение примера) получил бы уже уничтоженный ресурс. Всё
  // остальное, что реально нашлось в сцене (уникальные материалы/текстуры
  // букв каждого кубика), уничтожается как раньше. Плюс _pulseFace —
  // отдельная per-cube текстура, которую traverse не находит (она не
  // висит в сцене напрямую, только в cube._pulseFace), уничтожается явно.
  function unmount() {
    resizeObserver.disconnect();
    if (rafId !== null) cancelAnimationFrame(rafId);
    scene.traverse(obj => {
      if (obj.geometry && !isSharedResource(obj.geometry)) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(m => {
          if (m.map && !isSharedResource(m.map)) m.map.dispose();
          m.dispose();
        });
      }
    });
    Object.values(cubes).forEach(disposePulseFace);
    renderer.dispose();
  }

  return { unmount, replay: () => mountSlotExample(container, data) };
}

let _stylesInjected = false; // общий <style> движка — вставляется в <head> один раз на документ

/* Стили ленты шагов — общие на все примеры движка, вставляются в <head>
   один раз на документ (не в shadow/scoped-стиль, чтобы не тащить сборку). */
function injectStylesOnce() {
  if (_stylesInjected || document.getElementById('slot-engine-style')) { _stylesInjected = true; return; }
  _stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'slot-engine-style';
  style.textContent = `
    .slot-steps { display:flex; gap:8px; justify-content:center; align-items:center;
      padding:20px 4px 2px; flex:0 0 auto; }
    /* Неактивный чип — сплошной тёмный фон (не почти прозрачный), читается
       как отдельный элемент интерфейса в любом состоянии, не только активном. */
    .slot-step-chip { font-family:'Helvetica Neue',Arial,sans-serif; font-size:11px;
      letter-spacing:.02em; padding:5px 12px; border-radius:999px;
      background:#3A3E48; color:rgba(230,225,210,.55);
      border:1px solid rgba(255,255,255,.12); transition:all .35s ease; }
    .slot-step-chip:hover { filter: brightness(1.18); transform: translateY(-1px); }
    /* Цвет фона — ПОСТОЯННЫЙ признак принадлежности («это грамматика» /
       «это правило N»), не индикатор «сейчас идёт» — прямо на классе
       is-grammar/is-rule, всегда; .active добавляет только СВЕЧЕНИЕ (сейчас
       именно этот шаг играет), не единственный источник цвета. Текст в
       разметке уже капитализирован («Шаг N. Слово») — без
       text-transform:lowercase, оно перебивало бы это визуально обратно. */
    .slot-step-chip.is-grammar { background:#CDA84E; color:#2A2D35; }
    .slot-step-chip.is-rule { font-variant-numeric: tabular-nums;
      background:var(--rule-chip-color, #5B7EAE); color:#0F2547; }
    .slot-step-chip.active { border-color:transparent; }
    /* PRIMARY — тот единственный шаг, ради которого сделан весь ролик
       («шаг 2» из её формулировки: правило N, а не вспомогательная ссылка).
       Вдвое выше и в 1.5 раза шире обычного чипа — font-size и padding
       подобраны раздельно (не transform:scale, чтобы не растянуть пилюлю в
       овал и не исказить буквы). Цвет не переопределяется — тот же
       var(--rule-chip-color), что и у обычного правила (см. выше);
       единственное отличие primary — размер. */
    .slot-step-chip.is-primary { font-size:16px; font-weight:700; padding:14px 19px; }
    .slot-step-chip.flash { animation: slot-step-pop .55s ease; }
    @keyframes slot-step-pop {
      0%   { transform: scale(1); box-shadow: 0 0 0 0 rgba(205,168,78,.55); }
      35%  { transform: scale(1.16); box-shadow: 0 0 0 6px rgba(205,168,78,0); }
      100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(205,168,78,0); }
    }
    /* Кольцо-пульс на кубике-источнике (нимитта) — эталон: широкое, размытое,
       светлое кольцо оттенка СОБСТВЕННОГО цвета кубика (см. ringColorFrom),
       не жёсткий однотонный диск. border-color переопределяется инлайном
       под конкретный кубик — здесь только форма/характер движения. Цвет по
       умолчанию — серебряный (см. SILVER_COLOR/SILVER_RGB), НЕ золотой —
       золото зарезервировано под вриддхи (см. константы вверху файла), для
       мест, где инлайн не задан (пауза-осознание перед split). */
    .slot-pulse-ring {
      position: absolute;
      width: 18px; height: 18px;
      margin: -9px 0 0 -9px;
      border-radius: 50%;
      border: 3px solid rgba(205,211,217,.5);
      filter: blur(1.5px);
      animation: slot-pulse-out var(--pulse-dur) ease-out forwards;
      pointer-events: none;
    }
    @keyframes slot-pulse-out {
      0%   { transform: scale(0.4); opacity: 0; border-width: 4px; filter: blur(1.5px) brightness(1); }
      18%  { opacity: .6; filter: blur(1.5px) brightness(1.7); }
      100% { transform: scale(4.4); opacity: 0; border-width: 0.5px; filter: blur(1.5px) brightness(1); }
    }
    /* Рамка-подчёркивание под группой-нимиттой — нейтральный GROUP_COLOR,
       не фонетический; opacity управляется из JS покадрово
       (updateGroupFrame), здесь только форма/свечение. */
    .slot-group-frame {
      position: absolute;
      height: 3px;
      border-radius: 2px;
      margin-top: 10px;
      background: rgba(226,217,190,.75);
      box-shadow: 0 0 7px 1px rgba(226,217,190,.55);
      pointer-events: none;
    }
    /* Стиль живёт здесь, в движке, не в HTML-странице отдельного примера —
       новому примеру ничего копировать не нужно (риск реален: без этого
       стиля бегущие волны influence были бы полностью невидимы, без
       единой ошибки в консоли, молча). Цвет border ставится инлайном из
       spawnWave (по умолчанию серебряный, см. SILVER_COLOR/SILVER_RGB) —
       то, что ниже, только фолбэк на случай, если стиль применится на
       долю кадра раньше инлайна. */
    .slot-wave-ring {
      position: absolute;
      width: 14px; height: 14px;
      margin: -7px 0 0 -7px;
      border-radius: 50%;
      border: 2px solid rgba(205,211,217,.85);
      animation: slot-wave-travel var(--wave-dur) ease-out forwards;
    }
    @keyframes slot-wave-travel {
      0%   { transform: translate(0,0) scale(0.6); opacity: 0; filter: brightness(1); }
      12%  { opacity: 1; filter: brightness(1.8); }
      100% { transform: translate(var(--dx), var(--dy)) scale(1.5); opacity: 0; filter: brightness(1); }
    }
  `;
  document.head.appendChild(style);
}
