// Ashen Vigil — M0 skeleton: isometric camera, lit ground, braziers with
// flames, a placeholder hero that walks to where you click, drifting ash.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { setupInventory } from './inventory';
import { setupSkillBar } from './skillbar';

const TILE = 2;           // world units per floor tile
const GRID = 24;          // tiles per side
const MOVE_SPEED = 6;     // units per second
const VIEW = 18;          // orthographic view height in world units

const renderer = new THREE.WebGLRenderer({ antialias: true });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a09);
scene.fog = new THREE.Fog(0x0b0a09, 32, 62);

// Isometric-style orthographic camera, kept at a fixed offset from the hero.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(20, 22, 20);

// Post-processing: HDR render target (flames exceed 1.0), bloom, then tone mapping.
const hdrTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, hdrTarget);
composer.setPixelRatio(pixelRatio);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.4, 0.55, 1.15);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW * aspect) / 2;
  camera.right = (VIEW * aspect) / 2;
  camera.top = VIEW / 2;
  camera.bottom = -VIEW / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// Dim ambient light: the world should be dark outside light sources.
scene.add(new THREE.HemisphereLight(0x5a5c70, 0x1a1410, 0.45));
const moon = new THREE.DirectionalLight(0x8090b0, 0.35);
moon.position.set(-10, 30, 5);
scene.add(moon);

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// Textures (Grok-generated, made seamless by tools/postprocess.py; normal maps
// are derived from their brightness so torchlight rakes across the surface).
const texLoader = new THREE.TextureLoader();
function loadTex(file: string, repX: number, repY: number, srgb: boolean) {
  const tex = texLoader.load(`assets/textures/${file}`);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repX, repY);
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}
function groundMaterial(name: string, units: number, extent: number, normal: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  const rep = extent / units;
  return new THREE.MeshStandardMaterial({
    map: loadTex(`${name}.jpg`, rep, rep, true),
    normalMap: loadTex(`${name}_n.png`, rep, rep, false),
    normalScale: new THREE.Vector2(normal, normal),
    roughness: 0.92,
    ...extra,
  });
}

// Procedural sprite textures.
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const glowTex = canvasTex(128, 128, (c) => {
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
});
const flameTex = canvasTex(64, 128, (c) => {
  c.translate(32, 92);
  c.scale(1, 2);                                    // tall soft ellipse, hot at its base
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 30);
  g.addColorStop(0, 'rgba(255,245,200,1)');
  g.addColorStop(0.35, 'rgba(255,170,60,0.95)');
  g.addColorStop(0.7, 'rgba(230,70,10,0.45)');
  g.addColorStop(1, 'rgba(160,30,0,0)');
  c.fillStyle = g;
  c.fillRect(-32, -46, 64, 92);
});
const shadowTex = canvasTex(64, 64, (c) => {
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
});
const heatTex = canvasTex(4, 64, (c) => {          // warm glow fading down the pillar shaft
  const g = c.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgb(150,78,30)');
  g.addColorStop(0.55, 'rgb(64,30,11)');
  g.addColorStop(1, 'rgb(18,8,3)');
  c.fillStyle = g;
  c.fillRect(0, 0, 4, 64);
});

// Ash moor around the chapel floor, reaching past the fog.
const moor = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), groundMaterial('tex_moor_ground', 8, 160, 1.4, { color: new THREE.Color(1.8, 1.8, 1.8) }));
moor.position.y = -0.05;
scene.add(moor);

// Chapel floor: one continuous slab layer. Vertex colours give large-scale
// brightness patches (hides texture repetition) and darken the outer edge.
const half = (GRID * TILE) / 2;
const floorGeo = new THREE.PlaneGeometry(GRID * TILE, GRID * TILE, 48, 48).rotateX(-Math.PI / 2);
{
  const pos = floorGeo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const patch = 0.7 + 0.45 * (0.5 + 0.25 * Math.sin(x * 0.31 + 1.3) + 0.25 * Math.sin(z * 0.27 + x * 0.11)) + (rand() - 0.5) * 0.12;
    const edge = THREE.MathUtils.smoothstep(half - Math.max(Math.abs(x), Math.abs(z)), 0, 4);
    const v = patch * (0.25 + 0.75 * edge);
    col[i * 3] = v; col[i * 3 + 1] = v * 0.97; col[i * 3 + 2] = v * 0.93;
  }
  floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const floor = new THREE.Mesh(floorGeo, groundMaterial('tex_chapel_floor', 6, GRID * TILE, 1.6, { vertexColors: true, color: new THREE.Color(2.0, 2.0, 2.0) }));
scene.add(floor);

// Invisible plane used for click picking.
const pickPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID * TILE, GRID * TILE).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ visible: false }),
);
scene.add(pickPlane);

// Stone braziers: tapered shaft, iron bowl, glowing coals, layered flame
// sprites, a halo, rising sparks and a flickering point light.
interface Torch {
  light: THREE.PointLight;
  flames: THREE.Sprite[];
  halo: THREE.Sprite;
  coals: THREE.MeshBasicMaterial;
  shaft: THREE.MeshStandardMaterial;
  base: number;
  phase: number;
  x: number; y: number; z: number;
}
const torches: Torch[] = [];
const stoneMap = loadTex('tex_chapel_floor.jpg', 1, 1, true);
const stoneNormal = loadTex('tex_chapel_floor_n.png', 1, 1, false);
const ironMat = new THREE.MeshStandardMaterial({ color: 0x1c1a19, roughness: 0.55, metalness: 0.8, side: THREE.DoubleSide });
const pillarSpots: [number, number, number][] = [
  [-8, -8, 4], [8, -8, 2.5], [-8, 8, 3], [8, 8, 4.5], [0, -14, 3.5], [-14, 2, 2], [14, -2, 3],
];
const SPARKS_PER = 12;
const SPARKS = pillarSpots.length * SPARKS_PER;
const sparkPos = new Float32Array(SPARKS * 3);
const sparkLife = new Float32Array(SPARKS);
const sparkVel = new Float32Array(SPARKS * 3);

for (const [x, z, h] of pillarSpots) {
  const shaftMap = stoneMap.clone();
  shaftMap.repeat.set(1.2, h / 3);
  shaftMap.needsUpdate = true;
  const shaftNormal = stoneNormal.clone();
  shaftNormal.repeat.set(1.2, h / 3);
  shaftNormal.needsUpdate = true;
  const shaft = new THREE.MeshStandardMaterial({
    map: shaftMap, normalMap: shaftNormal, normalScale: new THREE.Vector2(1.5, 1.5), color: new THREE.Color(2.1, 2.0, 1.9), roughness: 0.95,
    emissive: 0xffffff, emissiveMap: heatTex, emissiveIntensity: 0.5,
  });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.78, h, 10), shaft);
  body.position.set(x, h / 2, z);
  scene.add(body);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.08, 0.3, 10), shaft);
  foot.position.set(x, 0.15, z);
  scene.add(foot);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.6, 0.28, 10), shaft);
  rim.position.set(x, h + 0.14, z);
  scene.add(rim);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.38, 0.42, 14, 1, true), ironMat);
  bowl.position.set(x, h + 0.42, z);
  scene.add(bowl);
  const coalMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.28, 0.06) });
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.62, 14).rotateX(-Math.PI / 2), coalMat);
  coals.position.set(x, h + 0.55, z);
  scene.add(coals);

  const flames: THREE.Sprite[] = [];
  for (let k = 0; k < 3; k++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flameTex, color: new THREE.Color(1.0, 0.4 + k * 0.1, 0.1), blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    sp.position.set(x, h + 1.15, z);
    scene.add(sp);
    flames.push(sp);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: new THREE.Color(1.3, 0.45, 0.12), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.2, fog: false,
  }));
  halo.scale.set(4.2, 4.2, 1);
  halo.position.set(x, h + 1.1, z);
  scene.add(halo);

  const light = new THREE.PointLight(0xff8a3a, 36, 18, 2);
  light.position.set(x + 1.0, h + 0.8, z + 1.0);   // offset toward the camera so the visible side of the shaft is lit
  scene.add(light);
  torches.push({ light, flames, halo, coals: coalMat, shaft, base: 36, phase: rand() * 10, x, y: h + 0.6, z });
}
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  color: new THREE.Color(1.6, 0.6, 0.18), size: 2.6 * pixelRatio, sizeAttenuation: false, map: glowTex, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
}));
sparks.frustumCulled = false;
scene.add(sparks);
function respawnSpark(i: number, torch: Torch) {
  sparkPos[i * 3] = torch.x + (rand() - 0.5) * 0.6;
  sparkPos[i * 3 + 1] = torch.y + 0.6;
  sparkPos[i * 3 + 2] = torch.z + (rand() - 0.5) * 0.6;
  sparkVel[i * 3] = (rand() - 0.5) * 0.5;
  sparkVel[i * 3 + 1] = 1.2 + rand() * 1.6;
  sparkVel[i * 3 + 2] = (rand() - 0.5) * 0.5;
  sparkLife[i] = 0.8 + rand() * 1.6;
}
for (let i = 0; i < SPARKS; i++) { respawnSpark(i, torches[Math.floor(i / SPARKS_PER)]); sparkLife[i] = rand() * 2; }

// Placeholder hero: a capsule with a small ember light that follows them.
const hero = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.45, 1.1, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 0.6, metalness: 0.3 }),
);
body.position.y = 1;
hero.add(body);
const facing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xe8873a }));
facing.rotation.x = Math.PI / 2;
facing.position.set(0, 1.1, 0.55);
hero.add(facing);
const heroLight = new THREE.PointLight(0xffb070, 9, 9, 2);
heroLight.position.y = 2.5;
hero.add(heroLight);
const heroShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
);
heroShadow.position.y = 0.03;
hero.add(heroShadow);
scene.add(hero);

// Click target marker.
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.3, 0.45, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xe8873a, transparent: true, opacity: 0 }),
);
marker.position.y = 0.04;
scene.add(marker);

// Drifting ash particles around the camera focus.
const ASH = 350;
const ashPos = new Float32Array(ASH * 3);
for (let i = 0; i < ASH; i++) {
  ashPos[i * 3] = (rand() - 0.5) * 40;
  ashPos[i * 3 + 1] = rand() * 14;
  ashPos[i * 3 + 2] = (rand() - 0.5) * 40;
}
const ashGeo = new THREE.BufferGeometry();
ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: 0x9a9088, size: 1.5 * pixelRatio, sizeAttenuation: false, transparent: true, opacity: 0.2 }));
scene.add(ash);

// Input: left click (or hold) sets the walk target.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const target = new THREE.Vector3();
let moving = false;
let mouseDown = false;
function pick(ev: PointerEvent) {
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(pickPlane)[0];
  if (!hit) return;
  const lim = half - 1;
  target.set(THREE.MathUtils.clamp(hit.point.x, -lim, lim), 0, THREE.MathUtils.clamp(hit.point.z, -lim, lim));
  moving = true;
  marker.position.set(target.x, 0.02, target.z);
  (marker.material as THREE.MeshBasicMaterial).opacity = 1;
}
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.button === 0) { mouseDown = true; pick(e); } });
renderer.domElement.addEventListener('pointermove', (e) => { if (mouseDown) pick(e); });
window.addEventListener('pointerup', () => { mouseDown = false; });

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (moving) {
    tmp.subVectors(target, hero.position).setY(0);
    const dist = tmp.length();
    if (dist < 0.05) {
      moving = false;
    } else {
      const step = Math.min(dist, MOVE_SPEED * dt);
      hero.position.addScaledVector(tmp.normalize(), step);
      hero.rotation.y = Math.atan2(tmp.x, tmp.z);
    }
  }
  body.position.y = 1 + (moving ? Math.abs(Math.sin(t * 10)) * 0.08 : 0);

  const mm = marker.material as THREE.MeshBasicMaterial;
  mm.opacity = Math.max(0, mm.opacity - dt * 1.5);

  for (const tr of torches) {
    const n = 0.5 + 0.5 * Math.sin(t * 11 + tr.phase) * Math.sin(t * 5.3 + tr.phase * 2) + 0.25 * Math.sin(t * 23 + tr.phase * 3);
    const flick = 0.82 + 0.28 * n;
    tr.light.intensity = tr.base * flick;
    tr.halo.material.opacity = 0.13 + 0.1 * flick;
    tr.coals.color.setRGB(0.7 + 0.5 * flick, 0.2 + 0.12 * flick, 0.05);
    tr.shaft.emissiveIntensity = 0.3 + 0.3 * flick;
    tr.flames.forEach((f, k) => {
      const w = Math.sin(t * (9 + k * 3.7) + tr.phase * (k + 1));
      const hgt = 2.0 + 0.7 * flick + 0.4 * w;
      f.scale.set(1.15 - k * 0.2 + 0.12 * Math.cos(t * 8 + k), hgt - k * 0.3, 1);
      f.position.x = tr.x + 0.08 * Math.sin(t * (7 + k) + tr.phase);
      f.position.z = tr.z + 0.08 * Math.cos(t * (6 + k) + tr.phase);
      f.position.y = tr.y + 0.55 + hgt * 0.32;
      (f.material as THREE.SpriteMaterial).rotation = 0.15 * w;
    });
  }
  for (let i = 0; i < SPARKS; i++) {
    sparkLife[i] -= dt;
    if (sparkLife[i] <= 0) { respawnSpark(i, torches[Math.floor(i / SPARKS_PER)]); continue; }
    sparkPos[i * 3] += sparkVel[i * 3] * dt + Math.sin(t * 6 + i) * dt * 0.3;
    sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
    sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
  }
  sparkGeo.attributes.position.needsUpdate = true;

  const p = ashGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < ASH; i++) {
    let y = p.getY(i) - dt * 0.4;
    if (y < 0) y += 14;
    p.setY(i, y);
    p.setX(i, p.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.2);
  }
  p.needsUpdate = true;
  ash.position.set(hero.position.x, 0, hero.position.z);

  camera.position.copy(hero.position).add(CAM_OFFSET);
  camera.lookAt(hero.position);

  composer.render();
  requestAnimationFrame(frame);
}
frame();
setupInventory();
setupSkillBar();
