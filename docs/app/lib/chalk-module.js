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
  ctx.font = `700 ${Math.round(sz*0.58)}px 'Helvetica Neue', Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(ch, sz/2, sz/2);
  ctx.restore();
}

// buildChalkMaterials — имя сохранено ради совместимости с вызывающим кодом (16 мест
// в rule3-agnayas.js), реализация теперь простая гладкая заливка без процедурного шума:
// быстрее в разы, цвет предсказуем (что задано, то и на кубике, без компенсаций).
function buildChalkMaterials(baseColor, seed, glyph) {
  const SZ = 256;
  const faces = [0,1,2,3,4,5]; // порядок BoxGeometry: +X -X +Y -Y +Z(перёд, глиф) -Z
  return faces.map((idx)=>{
    const cv = paintFlatFace(SZ, baseColor);
    if (idx === 4 && glyph) paintGlyph(cv, glyph);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.55,
      metalness: 0.0,
      envMapIntensity: 0,
      fog: false,
    });
  });
}

// makeChalkGeo — имя сохранено ради совместимости с вызывающим кодом; реализация теперь
// просто гладкое скругление рёбер (без органического шума по вершинам/нормалям — это и
// была единственная причина «мелового» неровного вида геометрии).
function makeChalkGeo(W, H, D, seed) {
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

export { CW, paintGlyph, buildChalkMaterials, makeChalkGeo, makeShadowBlobTexture };
