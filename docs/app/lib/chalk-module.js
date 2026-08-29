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

// Мягкая радиальная подсветка «пола» позади ряда кубиков — портировано
// дословно из старого рукописного эталона (examples/rule71-vak-asti.js,
// makeGroundTexture) при расследовании CLAUDE.md, Часть 6, п.0. У самого
// слот-движка такого элемента не было вообще (только маленькие тени под
// каждым кубиком, см. makeShadowBlobTexture выше) — из-за этого
// притенённому (opacity:0.22) кубику визуально было НЕЧЕГО «показывать
// сквозь себя», кроме плоского цвета страницы, и притенение читалось как
// «просто тёмный цвет», а не как настоящая прозрачность. С этим полом
// проверка на реальном экране (эталонный rule71-vak-asti.js) показывает
// однозначную прозрачность — пол темнеет, соседний кубик проглядывает.
function makeGroundTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  // ВРЕМЕННО ярче обычного (0.95 вместо 0.55) — диагностика: пользователь
  // подтвердил, что при прежних, приглушённых значениях пол не был виден
  // ВООБЩЕ даже после пересчёта позиции камеры — нужно сначала убедиться,
  // что сам элемент физически рендерится и виден хоть как-то, прежде чем
  // подбирать тонкую, малозаметную яркость. Вернуть приглушённые значения
  // после подтверждения, что позиция верна.
  const g = ctx.createRadialGradient(S / 2, S * 0.34, 0, S / 2, S * 0.34, S * 0.62);
  g.addColorStop(0, 'rgba(120,60,60,0.95)');
  g.addColorStop(0.55, 'rgba(100,50,50,0.6)');
  g.addColorStop(1, 'rgba(80,40,40,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tx = new THREE.CanvasTexture(cv);
  tx.encoding = THREE.sRGBEncoding;
  return tx;
}

export { CW, paintGlyph, buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture, makeGroundTexture };
