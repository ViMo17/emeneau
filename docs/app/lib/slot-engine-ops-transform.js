// ═══════════════════════════════════════════════════════════════════════════
// СЛОТ-ДВИЖОК — обработчики операций (apply*) и их прямые помощники.
// Часть модульного разбиения slot-engine.js (Стадия 5) — см. slot-engine.js.
// ═══════════════════════════════════════════════════════════════════════════

import { buildOpposingFaceMaterials, buildMetallicMaterials } from './chalk-module.js';
import {
  MS_PER_360, colorFor, clamp01, easeOutCubic, slotX,
} from './slot-engine-core.js';
import { regenMats, disposeMatSet } from './slot-engine-cube.js';
import { frontAnchor, spawnPulseRing, spawnSparkleBurst, spawnLabelPill } from './slot-engine-ops-shared.js';

/**
 * @typedef {import('./slot-engine-types.js').Ctx} Ctx
 * @typedef {import('./slot-engine-types.js').PulseFace} PulseFace
 * @typedef {import('./slot-engine-types.js').TransformOp} TransformOp
 * @typedef {import('./slot-engine-types.js').ElideOp} ElideOp
 * @typedef {import('./slot-engine-types.js').ResistOp} ResistOp
 * @typedef {import('./slot-engine-types.js').InfluenceOp} InfluenceOp
 * @typedef {import('./slot-engine-types.js').ApproachOp} ApproachOp
 * @typedef {import('./slot-engine-types.js').SplitOp} SplitOp
 * @typedef {import('./slot-engine-types.js').ArriveOp} ArriveOp
 * @typedef {import('./slot-engine-types.js').MergeOp} MergeOp
 * @typedef {import('./slot-engine-types.js').BudOp} BudOp
 * @typedef {import('./slot-engine-types.js').SettleOp} SettleOp
 * @typedef {import('./slot-engine-types.js').DimOp} DimOp
 */

/* ═══════════════════ ОПЕРАЦИИ ═══════════════════

   Каждый обработчик — функция уровня модуля с единой сигнатурой
   applyX(op, elapsed, ctx) (искл. applyStepDim(elapsed, ctx) — она не
   привязана к конкретной операции). ctx несёт всё, что обработчику нужно
   извне (cubes, camera, stageEl, labelsEl, wordGroupsList, scene,
   runtimeSteps, data) — один и тот же объект, не пересоздаётся под
   каждый вызов. Такая сигнатура делает функции тестируемыми настоящим
   импортом (см. tests/) без запуска рендера — рендера/браузера у автора
   движка нет вообще, только Node.js.

   1. TRANSFORM — превращение на месте (гуна/вриддхи/ассимиляция и т.п.).
      Подскок и оборот идут ОДНОВРЕМЕННО (не по очереди), буква на грани
      пропадает в начале оборота и наносится РАНО (около 15% пути, не в конце
      и не мгновенно) — та же хореография, что в rule3-agnayas.js.
      { type:'transform', at, toGlyph, toColor, start, spinTurns=1, bounceH=0.3 }
      Длительность НЕ вшивается — считается из spinTurns через MS_PER_360.
      В момент смены буквы ВСЕ наборы материалов кубика пересобираются под
      новый глиф (см. regenMats) — иначе более поздние операции (approach,
      influence), которые временно включают «сигнальный» материал, покажут
      исходную, уже неактуальную букву.

   2. SPLIT — распад на два звука через отстойник. Исходный кубик уходит В
      СТОРОНУ (не остаётся на месте!), поднимается, бледнеет и повисает —
      ПОКА он висит, прилетают оба результата как НОВЫЕ кубики (каждый со
      своими параметрами дуги/длительности/задержки).
      Только после паузы для сравнения исходный полностью растворяется.
      { type:'split', at, start,
        holdOffset:{x,y,z}, riseDur, holdOpacity, holdDur, fadeDur,
        arrivals: [
          { into, newSlot, from:{x,y,z}, delay, dur, arcHeight },
          ...
        ] }

   3. SETTLE — финальная волна READY_COLOR слева направо по всем указанным
      слотам, с подскоком на каждом — сигнал «весь процесс завершён».
      { type:'settle', slots:[...], start, stepDelay=150, bounceDur=500 }
*/
// Верхняя граница по elapsed (`elapsed > op.start+dur`) НЕ используется для
// раннего выхода — при обычной частоте кадров (~60fps, шаг ~16.7мс) шанс,
// что elapsed окажется РОВНО равен op.start+dur, практически нулевой:
// кадр либо ещё до границы, либо уже за ней, и такая проверка почти
// никогда не даёт финализации сработать на кадре, где реально t достиг 1.
// Вместо неё — guard по уже выставленному `op._done` (дешёвый выход после
// того, как всё уже сделано); t считается через clamp01, который сам
// ограничит переполёт значением 1 — финализация гарантированно происходит
// РОВНО ОДИН РАЗ, на первом же кадре, где elapsed достиг или превысил конец.
//
// Три явные фазы окраски: (1) кубик получает импульс — материал сразу
// переключается на сигнальный (серебро/нейтраль, см. op.signal ниже),
// СТАРАЯ буква ещё видна — понятно, КТО меняется; (2) на ~15% оборота
// буква меняется, но материал остаётся сигнальным — уже пересобранный под
// НОВУЮ букву (см. regenMats) — кубик «стал» новой буквой, но переход
// цветом ещё не завершён; (3) в момент приземления (t=1, тот же кадр, что
// и сброс поворота/позиции — не отдельная пауза) — переключение на
// matsMain, истинный цвет столбца. Серебро закреплено ИМЕННО за гунацией,
// не за самим фактом трансформации — см. op.signal ниже.
/** @param {TransformOp} op @param {number} elapsed @param {Ctx} ctx */
export function applyTransform(op, elapsed, ctx) {
    const { cubes } = ctx;
    const cube = cubes[op.at];
    if (!cube) return;
    if (elapsed < op.start) return;
    if (op._done) return;
    const spinTurns = op.spinTurns ?? 1;
    // Полуоборот (0.5, 1.5, 2.5...) — к зрителю в конце разворота выходит
    // ПРОТИВОЛЕЖАЩАЯ грань кубика (TRANSFORM_KIND.vargaPair). Для этого
    // случая буква нового звука наносится на противолежащую грань ЗАРАНЕЕ,
    // до начала вращения (см. buildOpposingFaceMaterials в chalk-module.js)
    // — без промежуточного «слепого» материала и без перерисовки на
    // середине пути, когда грань ещё обращена к зрителю. Портировано из
    // проверенного эталона (docs/effects/rule-assimilation-varga-t-d.html,
    // buildDentalVarga) — там же и более медленный, «тяжёлый» оборот
    // (1800мс на 180°, не по общей формуле spinTurns×MS_PER_360) и меньший
    // подскок (0.16 вместо 0.3).
    const landsOnOppositeFace = Math.round(spinTurns * 2) % 2 !== 0;
    // op.dur — теперь общее переопределение длительности вращения, не
    // только для landsOnOppositeFace (было раньше). Дефолт для обычного
    // оборота не меняется (spinTurns×MS_PER_360) — ни один существующий
    // пример его не передаёт (проверено), рег регрессии нет. Нужно
    // rule50: аваграха — обычный 360°-оборот, но должна идти медленнее
    // общей формулы (внимание зрителя отвлечено на соседний split), а
    // трогать MS_PER_360 глобально означало бы замедлить ВСЕ гунации/
    // вриддхи во всём приложении ради одного примера.
    const dur = op.dur ?? (landsOnOppositeFace ? 1800 : Math.abs(spinTurns) * MS_PER_360);
    const bounceH = op.bounceH ?? (landsOnOppositeFace ? 0.16 : 0.3);
    const clearance = op.clearance ?? 0.35; // боковой отъезд от соседа на время вращения
    // homeX — мировая позиция, вокруг которой идёт вращение и куда кубик
    // садится. По умолчанию slotX(op.at) (кубик крутится на своём слоте,
    // как всегда) — op.atX нужен ТОЛЬКО когда кубик перед transform'ом
    // физически переехал (например, слился с соседом посреди зазора через
    // merge) и теперь стоит не там, куда указывает его slot-ключ в cubes{}
    // (ключ не меняется от approach/merge — см. rule1, слияние a+au на
    // общем зазоре).
    const homeX = op.atX ?? slotX(op.at);
    const holdDur = op.holdDur ?? 700; // пауза-фиксация ПОСЛЕ посадки — общий дефолт, читает и label ниже, и блок приземления
    // signalHoldDur — сигнальный цвет (серебро/золото/нейтраль) держится
    // ЕЩЁ signalHoldDur ПОСЛЕ остановки вращения, прежде чем кубик
    // перекрасится в истинный цвет столбца — раньше переключение было
    // МГНОВЕННЫМ ровно в кадр посадки (t>=1), из-за чего сам факт «шла
    // огласовка» читался только во время вращения, ни секундой дольше
    // (прямая правка пользователя: «процесс гуна/вриддхи должен быть
    // виден — окрашивание длится и после остановки, потом перекрашивается
    // в цвет алфавита»). НЕ трогает позицию/вращение (те уже зафиксированы
    // в момент посадки) — только момент возврата material=matsMain и,
    // соответственно, момент op._done (holdDur теперь отсчитывается ПОСЛЕ
    // signalHoldDur, не вместо него — общая пауза после посадки длиннее).
    const signalHoldDur = op.signalHoldDur ?? 250; // было 500 — по прямой обратной связи «долго»

    // transform получает ТУ ЖЕ симметричную пару пауз, что уже есть у split
    // (anticipateDur до, holdDur после) — почти каждый значимый шаг
    // нуждается в паузе-фиксации для осознания результата, те же имена
    // параметров и тот же характер сигнала, не изобретаются заново для
    // каждой операции отдельно. Для гунации отдельной approach-стадии
    // «столкновение/невозможность соседства» не нужно — уже существующая
    // последовательность influence→transform (подчёркиваем влияющие
    // кубики, даём импульс, начинаем гунирование) — это и есть смысловой
    // эквивалент, без исключения для грамматических шагов.
    const anticipateDur = op.anticipateDur ?? 900; // тот же дефолт, что у split — единообразие, не случайное число
    const activeStart = op.start + anticipateDur;
    if (elapsed < activeStart) {
      // Пауза-осознание: пульс масштабом (два удара, как у split), два
      // кольца — БЕЗ смены цвета (серебро/нейтраль включается только в
      // активной фазе, не здесь — тот же принцип, что у split: «держать
      // сигнальный цвет ещё и на паузе означало бы два разных события
      // одним и тем же сигналом»).
      const t = clamp01((elapsed - op.start) / anticipateDur);
      const beat = Math.abs(Math.sin(t * Math.PI * 2)) * 0.06;
      cube.mesh.scale.setScalar(1 + beat);
      if (!op._pulse0 && t >= 0.15) { op._pulse0 = true; spawnPulseRing(frontAnchor(cube.mesh), anticipateDur * 0.6, undefined, ctx); }
      if (!op._pulse1 && t >= 0.6) { op._pulse1 = true; spawnPulseRing(frontAnchor(cube.mesh), anticipateDur * 0.6, undefined, ctx); }
      return;
    }
    if (!op._anticipateDone) {
      op._anticipateDone = true;
      cube.mesh.scale.setScalar(1);
      // Пилюля-подпись — НАД кубиком (transform = «превращается, продолжается
      // в новой форме»), с самого начала активного вращения. РЕАЛЬНЫЙ
      // НАЙДЕННЫЙ БАГ (прямая обратная связь: «надпись должна исчезнуть,
      // когда взаимодействие закончилось — золото/серебро сменилось
      // истинным цветом»): длительность БЫЛА dur+holdDur — пилюля
      // держалась ещё holdDur (700мс) ПОСЛЕ того, как cube.mesh.material
      // уже вернулся в matsMain (это происходит РОВНО в момент посадки,
      // t>=1, см. ниже, holdDur — просто пауза-фиксация уже готового
      // результата, к сигнальному цвету отношения не имеет). Исправлено —
      // длительность строго `dur`, пилюля гаснет ровно к посадке.
      // op.labelY — то же необязательное переопределение высоты, что и у
      // SplitOp (см. applySplit) — нужно, когда два события одного шага
      // (rule50: этот transform + соседний split) должны читаться как ОДИН
      // уровень, а не как два вразнобой, одна выше другой. xWorldOverride —
      // homeX (та же, что использует само вращение/посадка), не slotX(at) —
      // если кубик уже физически переехал до transform'а (см. atX), пилюля
      // должна висеть НАД НИМ, не над его номинальным слотом-ключом.
      // op.labelX — необязательное горизонтальное смещение ПОВЕРХ homeX
      // (аддитивно, см. spawnLabelPill) — нужно, когда в том же шаге ЕЩЁ
      // есть пилюля другого события (merge на этом же кубике, см. rule1/
      // rule2) и обе должны читаться НА ОДНОЙ ЛИНИИ (одинаковый labelY),
      // разведёнными по горизонтали, а не друг над другом.
      if (op.label) spawnLabelPill(op.label, op.at, true, dur, ctx, op.labelY, op.labelX, homeX);
    }

    // matsSignal (серебро) — не единственный вариант промежуточной фазы:
    // серебро/золото годится ТОЛЬКО для гунации/вриддхи, где сам их смысл —
    // «идёт огласовка»; для любого другого transform (парная замена внутри
    // варги, ассимиляция под соседа) серебро ложно намекало бы на ту же
    // природу. op.signal ('silver' — дефолт, обратная совместимость с
    // agnayas; 'gold' — вриддхи, matsGold; 'blank' — нейтральная грань БЕЗ
    // буквы, тот же цвет кубика, никакого намёка на гуну/вриддхи)
    // переключает это через общий параметр движка, не отдельным куском
    // кода внутри примера.
    const signalMats = op.signal === 'blank' ? 'matsBlank' : op.signal === 'gold' ? 'matsGold' : 'matsSignal';
    if (!op._began) {
      op._began = true;
      if (landsOnOppositeFace) {
        // Оба глифа — сразу, ДО начала вращения: idx4 (лицевая) держит
        // ТЕКУЩУЮ букву, idx5 (противолежащая) — БУДУЩУЮ. Никакой
        // перерисовки на середине пути не требуется — «превращение»
        // целиком получается из самой геометрии разворота.
        const newColor = op.toColor ?? colorFor(op.toGlyph);
        cube._oppositeMats = buildOpposingFaceMaterials(cube.color, cube.seed + 5, cube.tr, op.toGlyph);
        cube.mesh.material = cube._oppositeMats;
        op._pendingColor = newColor; // нужен после приземления, см. ниже
      } else if (op.startBlank) {
        // РЕАЛЬНЫЙ НАЙДЕННЫЙ БАГ (rule2, живая проверка: «перед вращением
        // на серебристой грани опять появляется И»). По умолчанию сигнальная
        // фаза красит грань ТЕКУЩЕЙ буквой кубика (matsSignal/matsGold лениво
        // пересобираются через defineMatsSlot, используя cube.tr на момент
        // первого обращения) — верно для обычного transform (agnayas), где
        // старая буква ДОЛЖНА быть видна первую половину оборота. Но если
        // кубик уже был явно погашен ДО этого transform (approach/merge с
        // blankAtProgress — механика rule1/rule2, «буквы исчезают на
        // полпути сближения»), merge на своём последнем кадре ВСЁ РАВНО
        // пересобирает matsMain с буквой при завершении (сам момент
        // слияния — самостоятельное, обязательное событие), и он же
        // сбрасывает лениво собранные matsSignal/matsGold (regenMats) —
        // следующее обращение к ним (здесь) пересобирает их ЗАНОВО, снова с
        // буквой, потому что строятся они от cube.tr, не от того, был ли
        // кубик только что погашен. Итог — уже спрятанная буква на мгновение
        // «оживает» на сигнальной грани, прежде чем разворот вообще начался.
        // op.startBlank — явный флаг «эта грань уже пуста, не перерисовывай
        // старую букву» — сразу берёт ТОТ ЖЕ временный безбуквенный набор,
        // что и штатная фаза ожидания (см. `_blankSignalMats` ниже), и сразу
        // отмечает `_disappeared`, чтобы не пытаться погасить второй раз.
        // Дефолт false — ни один существующий transform (agnayas, rule42,
        // rule50, rule70/71) его не передаёт, их поведение не меняется.
        if (op.signal === 'blank') {
          cube.mesh.material = cube.matsBlank;
        } else {
          op._blankSignalMats = buildMetallicMaterials(op.signal === 'gold' ? 'gold' : 'silver', cube.seed, null);
          cube.mesh.material = op._blankSignalMats;
        }
        op._disappeared = true;
      } else {
        cube.mesh.material = cube[signalMats];
      }
    }
    const t = clamp01((elapsed - activeStart) / dur);
    // ТОЛЬКО пока не приземлился — иначе НАЙДЕННЫЙ РЕАЛЬНЫЙ БАГ (поймано
    // численной симуляцией): t остаётся зажатым в 1 и на КАЖДОМ следующем
    // кадре формула ниже пересчитывает rotation.y заново — для целых
    // оборотов (spinTurns:1,2 — 360°/720°) результат (-360°/-720°)
    // визуально неотличим от 0°, поэтому оставался незамеченным, но для
    // половинного оборота (0.5 — 180°) даёт ЗАМЕТНО другой угол (-180°,
    // не 0°), затирая явный сброс в блоке приземления ниже уже на
    // СЛЕДУЮЩЕМ кадре после самого приземления.
    if (!op._landed) {
      cube.mesh.position.y = Math.sin(t * Math.PI) * bounceH;
      cube.mesh.position.x = homeX + Math.sin(t * Math.PI) * clearance;
      // clearanceZ — выдвижение НА ЗРИТЕЛЯ (+Z) на время вращения, тот же
      // колокол sin(t·π), что и bounceH/clearance (0 в начале/конце, пик
      // на середине). НАЙДЕННЫЙ РЕАЛЬНЫЙ БАГ (rule2, живая проверка): при
      // соседе ВПЛОТНУЮ (без зазора — см. «ī и t падают слитно») угловая
      // точка вращающегося куба на диагональных углах (~45°/135°) реально
      // дальше от центра (CUBE_SIZE·√2/2), чем его же грань в состоянии
      // покоя (CUBE_SIZE/2) — при зазоре меньше этой разницы (СУЩЕСТВЕННО
      // меньше SLOT-CUBE_SIZE) угол физически проходит СКВОЗЬ текстуру
      // соседа. Раздвигание по X (clearance) не спасает — сосед стоит по
      // ДРУГУЮ сторону, чем куда качается X. Дефолт 0 — ни один
      // существующий пример его не передаёт, поведение не меняется.
      cube.mesh.position.z = Math.sin(t * Math.PI) * (op.clearanceZ ?? 0);
      cube.mesh.rotation.y = -1 * easeOutCubic(t) * Math.PI * 2 * spinTurns;
      // Золотая россыпь искр — только вриддхи (signal:'gold'), только пока
      // кубик активно крутится. Период (280мс) — примерно втрое чаще, чем
      // сустейн-кольца influence (тот же порядок числа, что и остальные
      // движковые интервалы, не отдельно подобранное магическое число).
      // count=15 (не общий дефолт 200, тот — под elide, где нужен один
      // насыщенный распад) — прямая правка по обратной связи: «феерия
      // выстрелов из каждой грани не даёт понять, что происходит» — на
      // вращении бургст повторяется ~14 раз за весь оборот, крупный count
      // на каждом накапливался в избыток. Здесь — «плавное ненавязчивое
      // сопровождение», в 10-15 раз меньше, не главный сигнал события.
      if (op.signal === 'gold') {
        const sparkleGap = 280;
        const idx = Math.floor((elapsed - activeStart) / sparkleGap);
        const key = '_sparkle' + idx;
        if (idx >= 0 && !op[key]) {
          op[key] = true;
          spawnSparkleBurst(frontAnchor(cube.mesh), ctx, 15);
        }
      }
    }
    // ТОЧНАЯ СХЕМА по прямой раскладке пользователя «по позициям» (шаги по
    // 90°, позиция N = (N-1)×90°): позиции 1-2 (0-90°) — старая буква,
    // позиция 3 (180°, «зад» первого оборота) — граница. Для ОДНОГО оборота
    // (гунация, spinTurns:1) — ПРЯМАЯ замена: старая буква исчезает и
    // НОВАЯ появляется в ОДИН и тот же момент, позиция 3 (180°), не раньше
    // и не позже — сам момент появления зада кубика И ЕСТЬ момент показа
    // новой буквы, никакого разрыва. Для ДВУХ оборотов (вриддхи,
    // spinTurns:2) — старая буква исчезает В ПУСТОТУ на той же позиции 3
    // (180°, конец первого оборота), и ничего не нанесено на грань вплоть
    // до позиции 7 (540°, «зад» уже ВТОРОГО оборота) — только там
    // наносится результат вриддхи. Общая формула: disappearDeg=180
    // (всегда), revealDeg=(spinTurns-1)×360+180 (180 для одного оборота —
    // совпадает с disappearDeg, разрыва нет; 540 для двух — разрыв в целый
    // оборот). НАЙДЕННЫЙ БАГ предыдущей версии (порог 90°/130° от доли
    // времени через easeOutCubic) — грань была видна из-за наклона камеры
    // ДО официального момента, а при двух оборотах новая буква после
    // подмены показывалась ПОВТОРНО (на каждом развороте) — читалось как
    // мельтешение готового ответа, не единый момент реакции.
    const rotatedDeg = easeOutCubic(t) * 360 * Math.abs(spinTurns);
    const disappearDeg = 180;
    const revealDeg = (Math.abs(spinTurns) - 1) * 360 + 180;
    const needsBlankStage = revealDeg > disappearDeg;
    if (needsBlankStage && !landsOnOppositeFace && !op._disappeared && rotatedDeg >= disappearDeg) {
      op._disappeared = true;
      // «Пустая» грань на время ожидания — того же оттенка (серебро/
      // золото/нейтраль), что и сигнальная фаза, просто БЕЗ буквы. Для
      // signal:'blank' это буквально matsBlank (уже без глифа, ничего
      // нового строить не нужно); для 'silver'/'gold' — отдельный набор,
      // построенный на месте (glyph=null у buildMetallicMaterials просто
      // не рисует ничего на торцевых гранях) и уничтоженный сразу после
      // того, как реальный результат нанесён (см. reveal ниже) — тот же
      // класс временных наборов, что и _oppositeMats у landsOnOppositeFace.
      if (op.signal === 'blank') {
        cube.mesh.material = cube.matsBlank;
      } else {
        op._blankSignalMats = buildMetallicMaterials(op.signal === 'gold' ? 'gold' : 'silver', cube.seed, null);
        cube.mesh.material = op._blankSignalMats;
      }
    }
    if (!landsOnOppositeFace && !op._revealed && rotatedDeg >= revealDeg) {
      op._revealed = true;
      const newColor = op.toColor ?? colorFor(op.toGlyph);
      // Пересобираем ВСЕ наборы материалов кубика (matsMain/matsBlank/
      // matsReady/matsSignal), не только текущий — фикс бага, из-за которого
      // «сигнальный»/«финальный» материал ещё долго хранил исходную,
      // добуквенную версию (см. комментарий в regenMats). Материал
      // остаётся тем же промежуточным (silver/gold/blank, см. выше), не
      // matsMain: буква уже новая, цвет ещё не вернулся, это следующая,
      // отдельная фаза (см. ниже). НЕ применяется, когда кубик садится на
      // противолежащую грань — там оба глифа уже нанесены заранее (см.
      // op._began выше), перерисовывать нечего.
      regenMats(cube, op.toGlyph, newColor);
      cube.mesh.material = cube[signalMats];
      if (op._blankSignalMats) { disposeMatSet(op._blankSignalMats); op._blankSignalMats = null; }
    }
    if (t >= 1 && !op._landed) {
      op._landed = true;
      cube.mesh.rotation.y = 0;
      cube.mesh.position.y = 0;
      cube.mesh.position.z = 0;
      cube.mesh.position.x = homeX;
      if (landsOnOppositeFace) {
        // matsMain/matsBlank/... пересобираются под новую букву ТОЛЬКО
        // теперь, после приземления — нужно для будущих операций на этом
        // же кубике (повторный transform, settle и т.п.), а не для самого
        // текущего разворота (тот уже полностью показан через _oppositeMats
        // выше). Временный набор граней уничтожается — иначе утечка
        // текстур, тот же класс бага, что уже был найден и исправлен для
        // regenMats/lazily-собираемых наборов. У landsOnOppositeFace НЕТ
        // отдельной сигнальной фазы (весь разворот уже показан через
        // _oppositeMats, не через matsSignal/matsGold) — signalHoldDur ей
        // не подходит: material переключается на matsMain СРАЗУ, а
        // _oppositeMats уничтожается тут же (не спустя signalHoldDur —
        // иначе material ссылался бы на уже уничтоженный набор).
        regenMats(cube, op.toGlyph, op._pendingColor);
        disposeMatSet(cube._oppositeMats);
        cube._oppositeMats = null;
        cube.mesh.material = cube.matsMain;
        op._colorReverted = true; // блок signalHoldDur ниже её не касается
      }
      // Для НЕ landsOnOppositeFace material НЕ возвращается к matsMain
      // здесь — сигнальный цвет держится ещё signalHoldDur (см. блок
      // ниже), позиция/вращение уже зафиксированы, менять больше нечего.
      op._rotationEnd = elapsed;
    }
    // Сигнальный цвет держится ЕЩЁ signalHoldDur после остановки вращения
    // — ровно один раз переключается на истинный цвет столбца.
    if (op._landed && !op._colorReverted && elapsed - op._rotationEnd >= signalHoldDur) {
      op._colorReverted = true;
      cube.mesh.material = cube.matsMain; // возвращает себе истинный цвет столбца
    }
    // Пауза-фиксация: кубик уже полностью финализирован (позиция/вращение
    // с момента посадки, цвет — с момента signalHoldDur выше), держится в
    // истинном цвете ещё holdDur — op._done откладывается на
    // signalHoldDur+holdDur суммарно, не срабатывает мгновенно в момент
    // посадки. Даёт зрителю время увидеть результат, прежде чем следующий
    // шаг/операция начнёт что-то ещё менять — тот же смысл, что у holdDur
    // в split, просто без отдельной активности во время паузы.
    if (op._landed) {
      if (elapsed - op._rotationEnd >= signalHoldDur + holdDur) op._done = true;
    }
}

