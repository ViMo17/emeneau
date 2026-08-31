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
// ПЕРВАЯ версия (нарисованный градиентом блик поверх плоской заливки, даже
// размытый) была отвергнута пользователем по скриншоту — читалась как
// «мраморная пятнистая текстура», не металл: рисованный блик на матовом
// материале физически не может выглядеть как отражение, только как
// размазанная краска. Настоящий металлический вид требует НАСТОЯЩЕГО
// отражения окружения (envMap) — без него `metalness` в MeshStandardMaterial
// просто дал бы тёмный, безжизненный материал (нечему отражаться). envMap
// генерируется процедурно через THREE.PMREMGenerator из маленькой сцены
// (см. getMetallicEnvMap ниже) — НЕ внешняя картинка/HDR-файл, ноль новых
// ассетов и зависимостей, тот же принцип минимализма, что и везде в
// проекте. Буква на грани остаётся ЧЁРНОЙ (тот же paintGlyph, что и у
// обычных кубиков) — на металле она читается как гравировка (тёмный,
// малоотражающий участок на блестящей поверхности), не теряет
// разборчивости, ради которой кубики вообще существуют.
let _metallicEnvMap = null;
function getMetallicEnvMap() {
  if (_metallicEnvMap) return _metallicEnvMap;
  // Временный рендерер — нужен PMREMGenerator ТОЛЬКО чтобы скомпилировать
  // шейдер запекания, к реальной сцене примера отношения не имеет и в неё
  // не добавляется. Строится и запекается один раз на всю страницу
  // (ленивый модульный кэш, тот же приём, что у _cubeGeo/_shadowGeo в
  // slot-engine-cube.js), результат — обычная текстура, переживает любое
  // количество mount()/unmount() отдельных примеров.
  const tempRenderer = new THREE.WebGLRenderer({ antialias: false });
  const pmrem = new THREE.PMREMGenerator(tempRenderer);
  pmrem.compileCubemapShader();

  // Процедурная «комната»: тёмная сфера-фон + три плоских панели разной
  // яркости/оттенка (тёплый яркий «потолок», холодная и тёмная боковые
  // панели) — металлу нужен КОНТРАСТ между яркими и тёмными участками
  // окружения, чтобы отражение вообще читалось как отражение, не как
  // ровный серый. Ровно то же, что даёт мягкий свет из окна в реальных
  // референс-фото металлических поверхностей.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 24, 12),
    new THREE.MeshBasicMaterial({ color: 0x2c2e35, side: THREE.BackSide })
  ));
  const panel = (x, y, z, w, h, color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  panel(0, 9, 0, 14, 5, 0xfff2dc);   // тёплая яркая полоса сверху
  panel(-7, 1, 5, 4, 7, 0xd6dde6);   // холодная светлая панель сбоку
  panel(7, -2, -5, 4, 7, 0x15161b);  // тёмная панель с другой стороны

  const rt = pmrem.fromScene(envScene, 0.035);
  pmrem.dispose();
  tempRenderer.dispose();
  _metallicEnvMap = rt.texture;
  return _metallicEnvMap;
}

function buildMetallicMaterials(baseColor, seed, glyph) {
  const SZ = 256;
  const envMap = getMetallicEnvMap();
  const faces = [0, 1, 2, 3, 4, 5];
  return faces.map((idx) => {
    const cv = paintFlatFace(SZ, baseColor); // плоская заливка — весь «металл» теперь даёт envMap, не рисунок
    if ((idx === 4 || idx === 5) && glyph) paintGlyph(cv, glyph);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({
      map: tex,
      envMap,
      envMapIntensity: 1.1,
      roughness: 0.24,
      metalness: 0.9,
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
