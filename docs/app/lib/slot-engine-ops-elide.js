// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — applyElide (исчезновение без замены) и applyResist (попытка исчезновения, блокированная исключением).
// Часть модульного разбиения slot-engine-ops.js — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import * as THREE from 'three';
import {
  GROUP_RGB, colorFor, ringColorFrom, clamp01, lerp, easeOutCubic, easeInOutCubic, easeOutBack, slotX, setOpacity,
} from './slot-engine-core.js';
import { resolveSlotRef } from './slot-engine-words.js';
import { frontAnchor, spawnPulseRing, spawnSparkleBurst, spawnLabelPill, updateGroupFrame } from './slot-engine-ops-shared.js';

/** @param {import('./slot-engine-types.js').ElideOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
export function applyElide(op, elapsed, ctx) {
    const { cubes } = ctx;
    if (elapsed < op.start) return;
    const cube = cubes[op.at];
    if (!cube || op._done) return;
    // Плавная easeInOutCubic-кривая имеет нулевую производную в t=0 —
    // первые кадры движения визуально неразличимы, без отдельного сигнала
    // момент начала реакции не читается вообще. Ровно в момент op.start —
    // вспышка (spawnPulseRing) и мгновенный скачок масштаба на самой S, тот
    // же язык, что уже использует merge в момент слияния. Скачок считается
    // КАЖДЫЙ кадр ОТДЕЛЬНО от ветвления ниже (rise/hold/fade) — класс бага
    // «спад заблокирован общим guard'ом финализации» (см. applyTransform,
    // applyMerge) — здесь заранее вынесен за пределы веток, не внутрь них.
    if (!op._impactAt) {
      op._impactAt = elapsed;
      spawnPulseRing(frontAnchor(cube.mesh), 700, op.impactColor ?? GROUP_RGB, ctx);
    }
    const riseDur = op.riseDur ?? 1300; // тот же темп, что у split — общий язык, не изобретённый заново
    const holdDur = op.holdDur ?? 800;
    const fadeDur = op.fadeDur ?? 1100;
    // Пилюля-подпись — ПОД рядом (elide = «вниз, пропадает без следа»),
    // на всю видимую жизнь буквы (rise+hold+fade целиком), не только на
    // саму вспышку в начале.
    if (op.label && !op._labelSpawned) {
      op._labelSpawned = true;
      spawnLabelPill(op.label, op.at, false, riseDur + holdDur + fadeDur, ctx);
    }
    // НАЙДЕННЫЙ И ИСПРАВЛЕННЫЙ БАГ (предыдущая версия): перепутан ВЕРХНИЙ
    // КРАЙ отстойника с его ЦЕНТРОМ. FLOOR_Y (нижний край слотов, -0.55)
    // минус зазор (минимум CUBE_SIZE, «минимум 1 кубик вниз» по прямому
    // запросу пользователя, не CUBE_SIZE/2) даёт верхний край отстойника
    // (-1.65); минус ещё CUBE_SIZE/2 (половина высоты самого кубика в
    // отстойнике) даёт его ЦЕНТР — то, что реально нужно в holdOffset.y:
    // -2.2. Предыдущая правка ошибочно записала в holdOffset.y значение
    // ВЕРХНЕГО КРАЯ (-1.1) вместо центра — верх кубика в отстойнике
    // оказывался ровно на уровне низа ряда, зазора не было вообще, кубик
    // визуально стоял впритык (реальная находка пользователя по
    // скриншоту). x — «немного сбоку», без изменений. Проверено
    // THREE.Vector3.project на новой глубине: NDC y=-0.817, край кадра
    // -1.0 — запас есть, но заметно меньше прежнего (было -0.654 на
    // y=-1.65) — глубже уже не стоит без повторной проверки.
    const holdOffset = op.holdOffset ?? { x: -0.45, y: -2.2, z: -0.4 };
    const basePos = new THREE.Vector3(slotX(op.at), 0, 0);
    const holdPos = basePos.clone().add(new THREE.Vector3(holdOffset.x, holdOffset.y, holdOffset.z));
    const riseEnd = op.start + riseDur;
    const fadeStart = riseEnd + holdDur;
    // Прозрачность держится ПОЛНОЙ на всём погружении+паузе (было — тает
    // уже по дороге вниз, до 0.5 к концу подъёма) — прямой запрос
    // пользователя: буква тонет отчётливо видимой, весь эффект «пропадания»
    // сосредоточен в самом конце (fade), не размазан по всему пути.
    if (elapsed <= riseEnd) {
      const t = clamp01((elapsed - op.start) / riseDur);
      const te = easeInOutCubic(t);
      cube.mesh.position.lerpVectors(basePos, holdPos, te);
      setOpacity(cube.mesh, 1);
    } else if (elapsed <= fadeStart) {
      cube.mesh.position.copy(holdPos);
      const idle = (elapsed - riseEnd) * 0.0022;
      cube.mesh.position.y += Math.sin(idle) * 0.06; // то же лёгкое покачивание, что у split
      setOpacity(cube.mesh, 1);
    } else {
      // РОССЫПЬ ИСКР + ускоренное сжатие — ТОЛЬКО когда это исчезновение
      // само является содержанием правила (śādhi/rule55: s→∅ — это и есть
      // весь смысл примера). op.quiet:true — противоположный случай:
      // исчезновение ПОБОЧНОЕ, спутник другого, уже отыгранного главного
      // события в том же шаге (rule42: «a» — nimitta вриддхи, сама
      // вриддхи уже показана золотым вращением e→ai; яркий эффект здесь
      // отвлекал бы внимание от уже показанной кульминации). Критерий
      // закреплён в реестре, CLAUDE.md Часть 4. Флаг тот же приём, что и у
      // op._impactAt (устанавливается один раз, независимо от ветвления
      // ниже) — вспышка-удар В МОМЕНТ НАЧАЛА реакции (op.start, выше) не
      // затронута этим флагом вообще, это отдельный обязательный сигнал,
      // не декоративный эффект.
      if (!op._fadeStartedAt) {
        op._fadeStartedAt = elapsed;
        if (!op.quiet) spawnSparkleBurst(frontAnchor(cube.mesh), ctx, undefined, ringColorFrom(colorFor(cube.tr)));
      }
      const t = clamp01((elapsed - fadeStart) / fadeDur);
      if (op.quiet) {
        // Тихий вариант: плавное угасание на ВЕСЬ fadeDur, без ускорения и
        // без сжатия масштабом — буква просто истаивает, ничего не
        // «стреляет» и не «схлопывается».
        setOpacity(cube.mesh, lerp(1, 0, t));
      } else {
        // Сам кубик исчезает (прозрачность+масштаб) НА ТОМ ЖЕ темпе, что и
        // недолгие искры (~450-850мс), а не растянуто на весь fadeDur —
        // иначе получается «искры разлетелись и погасли, а кубик, целый,
        // ещё какое-то время просто тает отдельно» (прямая формулировка
        // пользователя: «стреляет из точки, потом исчезает» — визуально
        // ДВА разъединённых события вместо одного распада). fadeDur как
        // ОБЩАЯ длительность (влияет на step.end/settle у уже готовых
        // примеров) не меняется — только КРИВАЯ визуального исчезновения
        // внутри неё ускорена (×1.8) и держится на 0 остаток fadeDur.
        const visT = clamp01(t * 1.8);
        setOpacity(cube.mesh, lerp(1, 0, visT));
        cube.mesh.scale.setScalar(lerp(1, 0.12, easeOutCubic(visT)));
      }
      if (t >= 1) {
        op._done = true;
        cube.mesh.visible = false;
        // Финальное кольцо-вспышка ПОСЛЕ угасания убрано по прямой обратной
        // связи — россыпь искр уже полностью читает момент исчезновения,
        // отдельное кольцо следом было лишним, отвлекающим повтором сигнала.
        delete cubes[op.at];
      }
    }
    // Скачок масштаба в момент удара, спадающий за 350мс — ВНЕ веток
    // rise/hold/fade выше, идёт каждый кадр независимо от того, в какой
    // из них мы сейчас находимся (см. комментарий про класс бага вверху).
    // elapsed<fadeStart — ТОЛЬКО до начала fade: дальше масштабом управляет
    // сама fade-ветка (сжатие синхронно с исчезновением, см. выше), эти
    // два источника не должны писать в один и тот же кадр — иначе fade-
    // ветка отрабатывает первой, а этот блок (идёт ПОСЛЕ неё в коде)
    // тут же перезаписывал бы её обратно в lerp(1.25,1,1)=1 каждый кадр.
    if (op._impactAt != null && !op._done && elapsed < fadeStart) {
      const pt = clamp01((elapsed - op._impactAt) / 350);
      cube.mesh.scale.setScalar(lerp(1.25, 1, easeOutCubic(pt)));
    }
}

/* RESIST — попытка elide блокируется правилом-исключением: кубик начинает
   уходить вниз (та же визуальная грамматика начала реакции, что у самой
   `elide` — вспышка+скачок масштаба РОВНО в момент старта, движение по
   easeInOutCubic), но НЕ долетает до отстойника — на пике коротко
   задерживается и пружинисто отскакивает НАЗАД, на своё место
   (easeOutBack, тот же характер отскока, что уже несёт этот смысл у
   `approach` — «наткнулось на невидимую преграду»), не исчезая и не
   превращаясь. Показывает ИСКЛЮЧЕНИЕ (правило блокирует ДРУГОЕ правило от
   применения к этому звуку), не собственное сандхи-событие — реальный
   найденный случай: rule 8 (Whitney §150b) не производит звукового
   перехода само по себе, оно НЕ ДАЁТ правилу 9 отбросить корневой
   согласный после r; зритель должен увидеть саму попытку и её провал, а
   не только текст об этом (прямая правка пользователя: «этого эффекта
   нет — попробуй как будто буква начинает отделяться, но пружинит и
   возвращается»).
   `groupSlots` (необязательно, строка/{word}/массив — тот же формат, что
   и `influence.from`) — рамка GROUP_COLOR под ВСЕЙ защищающей группой на
   всё время попытки, переиспользует `updateGroupFrame` БЕЗ изменений
   (тот же приём, что уже несёт этот смысл у `influence` с несколькими
   источниками — «вот что объединено, вот что действует как одно целое»).
   Здесь смысл зеркальный: не «источник влияния», а «то, что защищает» —
   тот же визуальный язык, честно другая причина.
   { type:'resist', at, start, groupSlots, dipOffset=-0.6, dipDur=700,
     holdDur=300, retreatDur=700, label } */

/** @param {import('./slot-engine-types.js').ResistOp} op @param {number} elapsed @param {import('./slot-engine-types.js').Ctx} ctx */
export function applyResist(op, elapsed, ctx) {
  const { cubes, wordGroupsList } = ctx;
  const cube = cubes[op.at];
  if (!cube || elapsed < op.start || op._done) return;
  const dipOffset = op.dipOffset ?? -0.6; // вниз, заметно меньше riseDur-пути elide — это ПОПЫТКА, не полноценный уход
  const dipDur = op.dipDur ?? 700;
  const holdDur = op.holdDur ?? 300;
  const retreatDur = op.retreatDur ?? 700;
  const dipEnd = op.start + dipDur;
  const holdEnd = dipEnd + holdDur;
  const retreatEnd = holdEnd + retreatDur;

  // Рамка-опора под защищающей группой — на всё время попытки (растёт
  // прямо из updateGroupFrame, та же функция, что уже используют
  // несколько источников `influence`; op._frameHoldEnd — тот же контракт
  // поля, что и там).
  if (op.groupSlots) {
    op._frameHoldEnd = retreatEnd;
    const groupCubes = resolveSlotRef(op.groupSlots, wordGroupsList).map(s => cubes[s]).filter(Boolean);
    updateGroupFrame(op, groupCubes, elapsed, ctx);
  }

  // Вспышка+скачок масштаба РОВНО в момент начала попытки — тот же язык,
  // что у elide (см. выше) и merge: момент начала реакции нуждается в
  // отдельном сигнале, не только конец.
  if (!op._impactAt) {
    op._impactAt = elapsed;
    spawnPulseRing(frontAnchor(cube.mesh), 700, GROUP_RGB, ctx);
  }

  if (op.label && !op._labelSpawned) {
    op._labelSpawned = true;
    spawnLabelPill(op.label, op.at, false, dipDur + holdDur + retreatDur, ctx, op.labelY, op.labelX);
  }

  if (elapsed > retreatEnd) {
    cube.mesh.position.y = 0;
    cube.mesh.scale.setScalar(1);
    op._done = true;
    return;
  }

  if (elapsed <= dipEnd) {
    const t = clamp01((elapsed - op.start) / dipDur);
    cube.mesh.position.y = dipOffset * easeInOutCubic(t);
  } else if (elapsed <= holdEnd) {
    cube.mesh.position.y = dipOffset; // краткая пауза на пике попытки — «вот-вот получится»
  } else {
    const t = clamp01((elapsed - holdEnd) / retreatDur);
    const te = easeOutBack(t); // пружина — тот же характер, что и у отскока approach
    cube.mesh.position.y = dipOffset * (1 - te);
  }

  // Скачок масштаба в момент удара, спадающий за 350мс — тот же приём,
  // что и у elide (см. выше), тем же классом бага НЕ затронут: здесь
  // всего одна ветка позиции (нет отдельного «fade», который мог бы
  // конфликтовать), масштаб можно спокойно считать в общем месте.
  if (op._impactAt != null && !op._done) {
    const pt = clamp01((elapsed - op._impactAt) / 350);
    cube.mesh.scale.setScalar(lerp(1.2, 1, easeOutCubic(pt)));
  }
}

/* ПУЛЬС В ТЕКСТУРЕ ГРАНИ — та же эталонная техника, что в rule71-vak-asti.js
   (перенесена из docs/effects/rule-assimilation-varga-t-d.html). Отличие
   от spawnPulseRing: тот — отдельный
   DOM-слой поверх сцены, позиционируется проекцией 3D→экран каждый кадр;
   этот — кольцо нарисовано ПРЯМО в canvas передней грани кубика, жёстко
   часть самой геометрии, поворачивается/масштабируется вместе с кубиком
   без всякой проекционной математики. Две функции: build — один раз при
   первой необходимости (готовит холст-эталон без кольца, чтобы каждый
   кадр рисовать поверх чистой копии, не поверх предыдущего кольца),
   redraw — каждый кадр с текущим радиусом/прозрачностью. Использование:
   buildPulseFace на кубике один раз (лениво, кешируется в cube._pulseFace),
   на время пульсации — cube.mesh.material меняется на КОПИЮ matsMain с
   подменённым индексом 4 (не мутирует сам matsMain — иначе после возврата
   к обычному виду грань осталась бы с кольцом навсегда), после —
   возвращается обычный matsMain как есть. */
