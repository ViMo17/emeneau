// Общий модуль материала/геометрии кубика — гладкая заливка (без процедурного мелового
// шума: убрана после перехода на плоский цвет — быстрее и предсказуемее по цвету).
// Используется всеми анимациями-примерами через mount()/unmount().
import * as THREE from 'three';

// Направление вращения для всех «оборотных» эффектов — по часовой стрелке
// (подтверждено на демо ассимиляции). Если понадобится — меняется одной строкой.
const CW = -1;

function paintFlatFace(sz, baseHex) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#' + baseHex.toString(16).padStart(6,'0');
  ctx.fillRect(0, 0, sz, sz);
  return cv;
}

function paintGlyph(cv, ch) {
  const sz = cv.width;
  const ctx = cv.getContext('2d');
  ctx.save();
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Авто-подгонка шрифта: для сжатых крайних блоков (несколько букв на
  // одном кубике — инертный контекст типа «yam», «yati») размер
  // уменьшается, пока строка не поместится по ширине грани с запасом по
  // краям. Одиночная буква проходит цикл без изменений — 58% от стороны
  // холста ей и так подходит с первой итерации.
  let fontSize = Math.round(sz * 0.58);
  ctx.font = `700 ${fontSize}px 'Helvetica Neue', Arial, sans-serif`;
  const maxWidth = sz * 0.86;
  while (ctx.measureText(ch).width > maxWidth && fontSize > sz * 0.12) {
    fontSize -= 2;
    ctx.font = `700 ${fontSize}px 'Helvetica Neue', Arial, sans-serif`;
  }
  ctx.fillText(ch, sz/2, sz/2);
  ctx.restore();
}

// buildChalkMaterials — имя сохранено ради совместимости с вызывающим кодом (16 мест
// в rule3-agnayas.js), реализация теперь простая гладкая заливка без процедурного шума:
// быстрее в разы, цвет предсказуем (что задано, то и на кубике, без компенсаций).
//
// Буква красится на ОБЕИХ торцевых гранях (idx 4 И 5), не только на idx4 —
// решение уже было найдено и явно задокументировано в старом эталонном
// модуле (examples/rule71-vak-asti.js, buildDualFaceMaterials): при повороте
// РОВНО на 180° (TRANSFORM_KIND.vargaPair, spinTurns:0.5 — парная замена
// внутри варги, k↔g/t↔d и т.п.) к зрителю после разворота оказывается
// ПРОТИВОПОЛОЖНАЯ грань (idx5), а не та, что была видна вначале (idx4) —
// если новую букву красить только на idx4 (как раньше), после разворота
// на 180° зритель видит пустую, без буквы, грань idx5 — кубик выглядит
// «пропавшим», хотя реальные данные (буква/цвет) верны. Для поворотов на
// целое число оборотов (360°/720° — гуна/вриддхи/ассимиляция) idx5 всё
// равно никогда не виден напрямую — красить его тоже безвредно, лишняя
// подстраховка на будущее (custom spinTurns), не только фикс для 0.5.
function buildChalkMaterials(baseColor, seed, glyph) {
  const SZ = 256;
  const faces = [0,1,2,3,4,5]; // порядок BoxGeometry: +X -X +Y -Y +Z(перёд, глиф) -Z
  return faces.map((idx)=>{
    const cv = paintFlatFace(SZ, baseColor);
    if ((idx === 4 || idx === 5) && glyph) paintGlyph(cv, glyph);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      metalness: 0.0,
      envMapIntensity: 0,
      fog: false,
      // side:DoubleSide — по умолчанию (FrontSide) рендерятся только
      // ВНЕШНИЕ треугольники геометрии, внутренняя сторона каждой грани
      // не рисуется вообще. У непрозрачного кубика это незаметно (свои же
      // внешние грани всё закрывают), но у притенённого (opacity<1)
      // означает, что сквозь грань физически нечего увидеть, кроме фона
      // страницы — плоское затемнение вместо ощущения прозрачности.
      // Найдено и подтверждено экспериментом (диагностическая страница
      // test-slot-engine-asymmetric-dim.html, независимая от этого кода
      // реализация) — см. CLAUDE.md, Часть 6, «незакрытое расследование
      // прозрачности».
      side: THREE.DoubleSide,
      // НЕ добавлять depthWrite:false сюда без веской причины — уже
      // пробовали как фикс асимметричной прозрачности притенённых
      // кубиков, гипотеза не подтвердилась визуальной проверкой (проблема
      // осталась почти везде) и добавила новый баг (кубики с более
      // поздним слотом рисовались поверх более ранних, депth-buffer
      // переставал быть источником истины для порядка отрисовки). История
      // и текущий статус расследования — в CHANGELOG.md и CLAUDE.md
      // (Часть 6, «незакрытое расследование прозрачности»).
    });
  });
}

// Материал с РАЗНЫМИ буквами на противолежащих торцевых гранях (idx4 —
// текущий звук, idx5 — будущий) — для transform-поворотов ровно на
// нечётное число полуоборотов (0.5, 1.5... TRANSFORM_KIND.vargaPair), где
// к зрителю после разворота выходит ПРОТИВОЛЕЖАЩАЯ грань. В отличие от
// buildChalkMaterials (та же буква на обеих гранях — годится, когда кубик
// возвращается к СВОЕЙ ЖЕ грани после целого числа оборотов), здесь буква
// нового звука должна быть НАНЕСЕНА ЗАРАНЕЕ, до начала вращения, а не
// дорисована посреди пути — портировано из проверенного эталона
// (docs/effects/rule-assimilation-varga-t-d.html, buildDentalVarga: там
// же не regenMats на середине оборота, а сразу два глифа на одном
// материале с самого начала).
function buildOpposingFaceMaterials(baseColor, seed, frontGlyph, backGlyph) {
  const SZ = 256;
  const faces = [0,1,2,3,4,5];
  return faces.map((idx)=>{
    const cv = paintFlatFace(SZ, baseColor);
    if (idx === 4 && frontGlyph) paintGlyph(cv, frontGlyph);
    if (idx === 5 && backGlyph) paintGlyph(cv, backGlyph);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({
      map: tex, roughness: 0.55, metalness: 0.0, envMapIntensity: 0, fog: false, transparent: true,
    });
  });
}

// Металлический вариант — ТОЛЬКО для сигнальной фазы transform (серебро/
// золото гунации/вриддхи), не общая замена buildChalkMaterials. Обычные
// кубики намеренно плоские (см. комментарий выше в этом файле — процедурный
// шум убрали ради скорости и предсказуемости цвета) — трогать это решение
// не нужно, серебро/золото просят другого эффекта не потому что решение
// про плоскую заливку было неверным, а потому что у НИХ, в отличие от
// обычной буквы, сам смысл — «сейчас что-то особенное» (см. CLAUDE.md,
// «Серебро»/«Золото» в реестре зарезервированных значений), и плоская
// заливка этот смысл не поддерживает.
//
// ИСТОРИЯ ДВУХ ОТВЕРГНУТЫХ ПОПЫТОК (обе — реальные находки, не гипотезы):
// 1) Нарисованный градиентом блик поверх плоской заливки, даже размытый —
//    отвергнуто по скриншоту, читалось как «мраморная пятнистая текстура»
//    (слишком мало опорных цветов — 2-3 стопа градиента недостаточно, чтобы
//    прочитаться как металл, не как пятно).
// 2) Настоящий envMap (THREE.PMREMGenerator + metalness) — физически
//    правильный путь, но кубики выходили тёмными/безжизненными: без
//    возможности видеть рендер вживую подобрать контрастную процедурную
//    «комнату» для отражения оказалось недостижимо за разумное число
//    скриншот-раундов (сам механизм при этом рабочий, баг с WebGL-
//    контекстом на разных рендерерах был найден и исправлен — просто
//    итоговая картинka всё равно не устроила).
//
// ВТОРАЯ версия пользователя (доп.) — уже не один градиент на все грани,
// а ТРИ разные роли (та же логика, что различает top/left/right в
// исходном SVG-кубе): верхняя/лицевая грань — самая яркая, диагональный
// градиент + мягкий радиальный блик; «блик-полоса» — узкая почти-белая
// полоса посреди грани (имитация изогнутой отражающей поверхности); тень —
// равномерно тёмная грань. Плюс ambient occlusion (затемнение к низу) —
// на ВСЕХ гранях. Портировано hex-в-hex, только позиция блика-полосы
// (userSpaceOnUse x=15..50 в исходном SVG) заменена на растяжку через всю
// ширину грани — там это часть композиции всего изометрического куба
// (грань показана не целиком в кадре), здесь грань — весь кадр текстуры.
// Буква (idx4/5) — на «верхней»-роли: самая светлая и ровная, наименьший
// риск потерять контраст с чёрным глифом.
/**
 * @typedef {[number, string]} ColorStop
 * @typedef {{top: ColorStop[], topSpec: ColorStop[], highlight: ColorStop[], shadow: ColorStop[], aoAlpha: number}} MetallicPalette
 */
/** @type {{silver: MetallicPalette, gold: MetallicPalette}} */
const METALLIC = {
  silver: {
    top: [[0, '#edf3f7'], [0.30, '#d2dfe8'], [0.65, '#b4c8d4'], [1, '#96b0be']],
    topSpec: [[0, 'rgba(255,255,255,0.6)'], [0.5, 'rgba(255,255,255,0.08)'], [1, 'rgba(255,255,255,0)']],
    highlight: [
      [0, '#6e8fa0'], [0.18, '#aac4d2'], [0.32, '#ddedf6'], [0.42, '#f6fbfe'],
      [0.52, '#ccdde8'], [0.66, '#88a6b6'], [0.82, '#6a8898'], [1, '#58788a'],
    ],
    shadow: [[0, '#607888'], [0.45, '#4e6472'], [1, '#3a4e5c']],
    aoAlpha: 0.16,
  },
  gold: {
    top: [[0, '#f4e070'], [0.25, '#e0c040'], [0.60, '#c8a018'], [1, '#ae8808']],
    topSpec: [[0, 'rgba(255,252,210,0.7)'], [0.5, 'rgba(255,240,140,0.1)'], [1, 'rgba(255,220,0,0)']],
    highlight: [
      [0, '#8a5c00'], [0.16, '#b88010'], [0.30, '#e0b828'], [0.42, '#f8e868'], [0.50, '#fdf6c0'],
      [0.60, '#eac830'], [0.72, '#c09018'], [0.88, '#9a7008'], [1, '#7c5400'],
    ],
    shadow: [[0, '#7a5000'], [0.45, '#5e3c00'], [1, '#402800']],
    aoAlpha: 0.18,
  },
};

/** @param {number} sz @param {'silver'|'gold'} variant @param {'top'|'highlight'|'shadow'} role */
function paintMetallicFace(sz, variant, role) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = sz;
  const ctx = cv.getContext('2d');
  const p = METALLIC[variant];

  if (role === 'top') {
    const g = ctx.createLinearGradient(0, 0, sz, sz);
    p.top.forEach(([pos, c]) => g.addColorStop(pos, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
    const spec = ctx.createRadialGradient(sz * 0.30, sz * 0.25, 0, sz * 0.30, sz * 0.25, sz * 0.55);
    p.topSpec.forEach(([pos, c]) => spec.addColorStop(pos, c));
    ctx.fillStyle = spec;
    ctx.fillRect(0, 0, sz, sz);
  } else if (role === 'highlight') {
    const g = ctx.createLinearGradient(0, 0, sz, 0);
    p.highlight.forEach(([pos, c]) => g.addColorStop(pos, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, sz);
    p.shadow.forEach(([pos, c]) => g.addColorStop(pos, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, sz, sz);
  }

  // Ambient occlusion — темнее к низу грани, одинаково на всех трёх ролях.
  const ao = ctx.createLinearGradient(0, 0, 0, sz);
  ao.addColorStop(0.55, 'rgba(0,0,0,0)');
  ao.addColorStop(1, `rgba(0,0,0,${p.aoAlpha})`);
  ctx.fillStyle = ao;
  ctx.fillRect(0, 0, sz, sz);

  return cv;
}

// Порядок граней BoxGeometry: 0=+X, 1=-X, 2=+Y(верх), 3=-Y(низ),
// 4=+Z(перед, глиф), 5=-Z(зад, глиф) — см. тот же порядок в
// buildChalkMaterials выше. Роль по грани — не одна на всех: верх и обе
// глифовые грани светлые (лучшая разборчивость буквы), одна боковая —
// блик-полоса, другая боковая и низ — тень.
const METALLIC_ROLE_BY_FACE = { 0: 'highlight', 1: 'shadow', 2: 'top', 3: 'shadow', 4: 'top', 5: 'top' };

// Буква — ТОЛЬКО на фасаде (idx4), НЕ на противолежащей грани (idx5),
// в отличие от buildChalkMaterials выше. Прямое уточнение пользователя:
// движок красил ОБЕ торцевые грани одним и тем же глифом (приём,
// оправданный для landsOnOppositeFace — там при повороте ровно на 180°
// именно противолежащая грань становится новой лицевой) — но для этой,
// сигнальной фазы (гунация/вриддхи, полный оборот, к зрителю ВСЕГДА
// возвращается ИСХОДНАЯ, не противолежащая грань) задняя грань никогда
// не должна нести букву: пользователь наблюдала «мельтешение» именно
// потому, что задняя грань, тоже расписанная, становилась видна в своих
// собственных окнах поворота (90–270°/450–630° при двух оборотах) —
// показывая то старую, то (после подмены) уже новую букву ВТОРОЙ раз,
// помимо фасада. Задняя грань теперь остаётся тем же металлом БЕЗ буквы
// всегда — «пропадание» на позиции 3 (180°, applyTransform) не требует
// отдельного «пустого» состояния этой грани, она и так им уже была.
/** @param {'silver'|'gold'} variant @param {number} seed @param {string} glyph */
function buildMetallicMaterials(variant, seed, glyph) {
  const SZ = 256;
  const faces = [0, 1, 2, 3, 4, 5];
  return faces.map((idx) => {
    const cv = paintMetallicFace(SZ, variant, METALLIC_ROLE_BY_FACE[idx]);
    if (idx === 4 && glyph) paintGlyph(cv, glyph);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.32,
      metalness: 0.0, // без envMap повышенный metalness просто затемнил бы материал — см. историю выше
      envMapIntensity: 0,
      fog: false,
      side: THREE.DoubleSide,
      transparent: true,
    });
  });
}

// makeChalkGeo — имя сохранено ради совместимости с вызывающим кодом; реализация теперь
// просто гладкое скругление рёбер (без органического шума по вершинам/нормалям — это и
// была единственная причина «мелового» неровного вида геометрии).
function makeChalkGeo(W, H, D) {
  const chamfer = 0.045;
  const geo = new THREE.BoxGeometry(W,H,D, 12,12,12);
  const pos = geo.attributes.position;
  for(let v=0;v<pos.count;v++){
    let x=pos.getX(v), y=pos.getY(v), z=pos.getZ(v);
    const hW=W/2, hH=H/2, hD=D/2;
    const ox=Math.abs(x)-(hW-chamfer), oy=Math.abs(y)-(hH-chamfer), oz=Math.abs(z)-(hD-chamfer);
    if(ox>0 && oy>0 && oz>0){
      const cL=Math.sqrt(ox*ox+oy*oy+oz*oz), ex=cL-chamfer;
      if(ex>0){ x-=(ox/cL*Math.sign(x))*ex*0.6; y-=(oy/cL*Math.sign(y))*ex*0.6; z-=(oz/cL*Math.sign(z))*ex*0.6; }
    } else if(ox>0 && oy>0){
      const eL=Math.sqrt(ox*ox+oy*oy), ex=eL-chamfer;
      if(ex>0){ x-=(ox/eL*Math.sign(x))*ex*0.6; y-=(oy/eL*Math.sign(y))*ex*0.6; }
    } else if(ox>0 && oz>0){
      const eL=Math.sqrt(ox*ox+oz*oz), ex=eL-chamfer;
      if(ex>0){ x-=(ox/eL*Math.sign(x))*ex*0.6; z-=(oz/eL*Math.sign(z))*ex*0.6; }
    } else if(oy>0 && oz>0){
      const eL=Math.sqrt(oy*oy+oz*oz), ex=eL-chamfer;
      if(ex>0){ y-=(oy/eL*Math.sign(y))*ex*0.6; z-=(oz/eL*Math.sign(z))*ex*0.6; }
    }
    pos.setXYZ(v, x, y, z);
  }
  pos.needsUpdate=true;
  geo.computeVertexNormals();
  return geo;
}

function makeShadowBlobTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S/2,S/2,0, S/2,S/2,S/2);
  g.addColorStop(0,   'rgba(0,0,0,0.45)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.22)');
  g.addColorStop(1,   'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,S,S);
  const tx = new THREE.CanvasTexture(cv);
  tx.encoding = THREE.sRGBEncoding;
  return tx;
}

export { CW, paintGlyph, buildChalkMaterials, buildOpposingFaceMaterials, buildMetallicMaterials, makeChalkGeo, makeShadowBlobTexture };
