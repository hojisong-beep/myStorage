// Ashen Vigil — M0 skeleton: isometric camera, lit ground, braziers with
// flames, the Ash Warden walking to where you click, drifting ash.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { setupInventory } from './inventory';
import { setupLoot } from './loot';
import { player } from './stats';
import { loadGame, saveNow, startAutosave, wipeSave } from './save';
import { makeItem, makeUnique, rollDrop } from './items';
import { XP } from './data/balance';
import { toast } from './ui';
import { setupSkillBar, type SlotModel } from './skillbar';
import { setupSkills, skillDef } from './skills';
import { setupSkillTree } from './skilltree';
import { sfx } from './audio';
import { setupCombat } from './combat';

const TILE = 2;           // world units per floor tile
const GRID = 24;          // tiles per side
const VIEW = 18;          // orthographic view height in world units

const renderer = new THREE.WebGLRenderer({ antialias: true });
const pixelRatio = Math.min(window.devicePixelRatio, 2);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0b0d);
scene.fog = new THREE.Fog(0x0a0b0d, 32, 62);

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
// Cool, neutral fill so stone away from the fires reads as grey, not brown.
scene.add(new THREE.HemisphereLight(0x6c7688, 0x15171b, 0.6));
const moon = new THREE.DirectionalLight(0x8a9ab8, 0.4);
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
    col[i * 3] = v * 0.95; col[i * 3 + 1] = v * 0.98; col[i * 3 + 2] = v;   // slightly cool; warmth comes from the fires only
  }
  floorGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
const floor = new THREE.Mesh(floorGeo, groundMaterial('tex_chapel_floor', 9, GRID * TILE, 1.6, { vertexColors: true, color: new THREE.Color(1.45, 1.45, 1.45) }));
scene.add(floor);

// Invisible plane used for click picking.
const pickPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID * TILE, GRID * TILE).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ visible: false }),
);
scene.add(pickPlane);

// World props: Grok-painted cut-outs (tools/postprocess.py prop) on upright
// quads that lean back to face the camera, pivoting on their bottom edge so
// they stand on the floor. They are lit by the braziers like everything else;
// a weak emissive copy of the image keeps the dark side from going black.
const PROP_IDS = ['brazier_stone', 'pillar_broken_a', 'pillar_broken_b', 'rubble_pile', 'bone_pile', 'gravestone', 'statue_hooded', 'barrel', 'dead_tree'] as const;
type PropId = typeof PROP_IDS[number];
const propMats = new Map<PropId, THREE.MeshStandardMaterial>();
for (const id of PROP_IDS) {
  const tex = texLoader.load(`assets/props/${id}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  propMats.set(id, new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.45, roughness: 0.95, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25,
  }));
}
const CAM_DIR = CAM_OFFSET.clone().normalize();                       // from the scene toward the camera
const PROP_YAW = Math.atan2(CAM_DIR.x, CAM_DIR.z);
const PROP_TILT = Math.atan2(Math.hypot(CAM_DIR.x, CAM_DIR.z), CAM_DIR.y) - Math.PI / 2; // lean back so the quad faces the camera
const PROP_UP = new THREE.Vector3(0, 1, 0).applyEuler(new THREE.Euler(PROP_TILT, PROP_YAW, 0, 'YXZ'));
function addProp(id: PropId, x: number, z: number, height: number, aspect: number, flip = false) {
  const geo = new THREE.PlaneGeometry(height * aspect, height);
  geo.translate(0, height / 2, 0);                                    // bottom-centre anchor
  const m = new THREE.Mesh(geo, propMats.get(id)!);
  m.rotation.set(PROP_TILT, PROP_YAW, 0, 'YXZ');
  if (flip) m.scale.x = -1;
  m.position.set(x, 0, z);
  scene.add(m);
  return m;
}

// Stone braziers: the painted pedestal, glowing coals, layered flame
// sprites, a halo, rising sparks and a flickering point light.
interface Torch {
  light: THREE.PointLight;
  flames: THREE.Sprite[];
  halo: THREE.Sprite;
  coals: THREE.SpriteMaterial;
  base: number;
  phase: number;
  x: number; y: number; z: number;
}
const torches: Torch[] = [];
const braziers: [number, number][] = [[-8, -8], [8, -8], [-8, 8], [8, 8], [0, -14], [-14, 2], [14, -2]];
const BRAZIER_H = 2.4;
const SPARKS_PER = 12;
const SPARKS = braziers.length * SPARKS_PER;
const sparkPos = new Float32Array(SPARKS * 3);
const sparkLife = new Float32Array(SPARKS);
const sparkVel = new Float32Array(SPARKS * 3);

function placeBraziers(aspect: number) {
  for (const [x, z] of braziers) {
    addProp('brazier_stone', x, z, BRAZIER_H, aspect);
    // Centre of the bowl opening sits ~80% up the image; nudge toward the camera so the fire draws over the rim.
    const bowl = new THREE.Vector3(x, 0, z).addScaledVector(PROP_UP, BRAZIER_H * 0.8).addScaledVector(CAM_DIR, 0.4);
    const coalMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(0.9, 0.25, 0.05), blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const coals = new THREE.Sprite(coalMat);
    coals.scale.set(0.95, 0.4, 1);
    coals.position.copy(bowl);
    scene.add(coals);

    const flames: THREE.Sprite[] = [];
    for (let k = 0; k < 3; k++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: flameTex, color: new THREE.Color(1.0, 0.4 + k * 0.1, 0.1), blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      }));
      scene.add(sp);
      flames.push(sp);
    }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: new THREE.Color(1.3, 0.45, 0.12), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.2, fog: false,
    }));
    halo.scale.set(4.2, 4.2, 1);
    halo.position.copy(bowl).y += 0.5;
    scene.add(halo);

    const light = new THREE.PointLight(0xff9548, 34, 11, 2);   // short reach: warm pools, cool stone between them
    light.position.copy(bowl).add(new THREE.Vector3(0.6, 0.6, 0.6));    // a little toward the camera so the painted face is lit
    scene.add(light);
    torches.push({ light, flames, halo, coals: coalMat, base: 34, phase: rand() * 10, x: bowl.x, y: bowl.y - 0.55, z: bowl.z });
  }
  for (let i = 0; i < SPARKS; i++) { respawnSpark(i, torches[Math.floor(i / SPARKS_PER)]); sparkLife[i] = rand() * 2; }
  sparks.visible = true;
}

// Scatter: ruins near the braziers and along the floor edge, trees out on
// the moor. Fixed seed so the layout is the same every load; the middle of
// the floor stays open for walking.
function placeScatter(aspect: Record<string, number>) {
  let s = 1234;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const sizes: Record<PropId, number> = {
    brazier_stone: BRAZIER_H, pillar_broken_a: 3.6, pillar_broken_b: 1.7, rubble_pile: 1.0, bone_pile: 0.9,
    gravestone: 1.5, statue_hooded: 3.3, barrel: 1.3, dead_tree: 5.0,
  };
  const spots: [number, number][] = [];
  const free = (x: number, z: number, d: number) =>
    Math.hypot(x, z) > 6 && spots.every(([a, b]) => Math.hypot(a - x, b - z) > d) && braziers.every(([a, b]) => Math.hypot(a - x, b - z) > 1.6);
  const put = (id: PropId, x: number, z: number, scale = 1) => {
    spots.push([x, z]);
    addProp(id, x, z, sizes[id] * scale, aspect[id], r() < 0.5);
  };
  // Beside each brazier: a bit of rubble or bones, sometimes a barrel.
  for (const [bx, bz] of braziers) {
    for (const id of ['rubble_pile', 'bone_pile', 'barrel'] as PropId[]) {
      if (id === 'barrel' && r() < 0.5) continue;
      for (let t = 0; t < 10; t++) {
        const ang = r() * Math.PI * 2, d = 1.8 + r() * 1.2;
        const x = bx + Math.cos(ang) * d, z = bz + Math.sin(ang) * d;
        if (free(x, z, 1.3) && Math.abs(x) < half - 1 && Math.abs(z) < half - 1) { put(id, x, z, 0.85 + r() * 0.3); break; }
      }
    }
  }
  // Floor edge: broken pillars, statues, graves.
  const edge: PropId[] = ['pillar_broken_a', 'pillar_broken_b', 'statue_hooded', 'gravestone', 'pillar_broken_a', 'gravestone', 'pillar_broken_b',
    'rubble_pile', 'statue_hooded', 'gravestone', 'pillar_broken_b', 'bone_pile', 'pillar_broken_a', 'gravestone'];
  for (const id of edge) {
    for (let t = 0; t < 20; t++) {
      const side = Math.floor(r() * 4), along = (r() - 0.5) * 2 * (half - 2), inset = half - 1.2 - r() * 2.5;
      const [x, z] = side === 0 ? [along, -inset] : side === 1 ? [along, inset] : side === 2 ? [-inset, along] : [inset, along];
      if (free(x, z, 2.2)) { put(id, x, z, 0.85 + r() * 0.3); break; }
    }
  }
  // Dead trees on the moor just outside the floor.
  for (let i = 0; i < 9; i++) {
    for (let t = 0; t < 20; t++) {
      const ang = r() * Math.PI * 2, d = half + 3 + r() * 10;
      const x = Math.cos(ang) * d, z = Math.sin(ang) * d;
      if (free(x, z, 4)) { put('dead_tree', x, z, 0.8 + r() * 0.5); break; }
    }
  }
}

fetch('assets/props/props.json')
  .then((res) => res.json())
  .then((meta: Record<string, { aspect: number }>) => {
    const aspect = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, v.aspect]));
    placeBraziers(aspect.brazier_stone);
    placeScatter(aspect);
  });

const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
  color: new THREE.Color(1.6, 0.6, 0.18), size: 2.6 * pixelRatio, sizeAttenuation: false, map: glowTex, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
}));
sparks.frustumCulled = false;
sparks.visible = false;                            // until the braziers are placed
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
// Hero: the Ash Warden, two Grok paintings (three-quarter front and back)
// on a camera-facing quad like the props; mirroring gives the other two
// directions. The walk is driven by distance travelled, not time, so the
// stride matches the ground speed: the quad is subdivided and a vertex
// shader swings the lower body (legs in opposite phase, the swinging foot
// lifted) and lets the cloak trail behind; plus bounce, lean, ash puffs at
// each footfall and a breathing shadow. Everything eases out on stopping.
const HERO_H = 2.6;
const STRIDE = 1.6;                                // world units per footfall (two per full cycle); per view below
const hero = new THREE.Group();                   // sits at the feet; never rotated
const heroPivot = new THREE.Group();              // leans back to face the camera, pivot at the feet
heroPivot.rotation.set(PROP_TILT, PROP_YAW, 0, 'YXZ');
hero.add(heroPivot);
const walkUniforms = { uWalk: { value: 0 }, uPhase: { value: 0 }, uCloak: { value: 0 }, uTime: { value: 0 } };
// legs: the painted stills get the scissoring legs; the walk sheets already
// contain real leg motion, so they only get the idle cloak flutter.
function heroMaterial(tex: THREE.Texture, legs: boolean) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const m = new THREE.MeshStandardMaterial({
    map: tex, alphaTest: 0.45, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide,
    emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.25,
  });
  if (legs) m.defines = { HERO_LEGS: '' };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, walkUniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWalk;\nuniform float uPhase;\nuniform float uCloak;\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // uv.y: 0 at the feet, 1 at the top. side: -1 left half, +1 right half, 0 at the centre (no tear).
        float h = uv.y;
        float side = clamp((uv.x - 0.5) * 5.0, -1.0, 1.0);
        float cloak = (1.0 - smoothstep(0.05, 0.62, h)) * abs(side);
        #ifdef HERO_LEGS
        float legs = 1.0 - smoothstep(0.0, 0.36, h);          // fades out by the hips
        float feet = 1.0 - smoothstep(0.0, 0.14, h);
        float sw = sin(uPhase);
        transformed.x += side * sw * 0.085 * legs * uWalk;              // legs scissor
        transformed.y += max(0.0, -side * sw) * 0.06 * feet * uWalk;   // the swinging foot lifts
        transformed.x += sin(uPhase - 1.3) * 0.03 * cloak * uWalk;      // cloak trails the stride
        #endif
        // idle flutter: a slow wave running down the cloak hem
        transformed.x += sin(uTime * 2.1 - h * 6.0) * uCloak * cloak;
      }`);
  };
  return m;
}
const heroMat = (id: string) => heroMaterial(texLoader.load(`assets/props/${id}.png`), true);
// Walk sheets (tools/walksheet.py, from Grok image-to-video): one row of
// frames, played by distance travelled. Until they load, or if they fail
// to, the painted stills with the vertex-shader walk above are used.
type UV = [number, number];   // across the image, and up from its bottom
interface WalkSheet { mat: THREE.MeshStandardMaterial; tex: THREE.Texture; frames: number; idle: number; aspect: number; hands: UV[] }
// facesRight: which way the source image faces on screen (mirroring flips it).
// stride: world units per footfall for this view's walk sheet, measured from
// how far its feet travel per step, so feet do not slide.
interface HeroView { mat: THREE.MeshStandardMaterial; aspect: number; hand: UV; facesRight: boolean; stride: number; sheet?: WalkSheet }
type ViewId = 'front' | 'back' | 'side';
const HERO_VIEWS: Record<ViewId, HeroView> = {
  front: { mat: heroMat('hero_front'), aspect: 0.494, hand: [0.92, 0.61], facesRight: true, stride: STRIDE },
  back: { mat: heroMat('hero_back'), aspect: 0.51, hand: [0.11, 0.67], facesRight: true, stride: STRIDE },
  side: { mat: heroMat('hero_side'), aspect: 0.444, hand: [0.07, 0.58], facesRight: false, stride: 1.3 },
};
const heroSprite = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 6, 12).translate(0, 0.5, 0), HERO_VIEWS.front.mat);
heroPivot.add(heroSprite);
fetch('assets/props/props.json').then((r) => r.json()).then((meta: Record<string, { aspect: number; hand?: UV }>) => {
  for (const view of ['front', 'back', 'side'] as const) {
    const m = meta[`hero_${view}`];
    if (m) { HERO_VIEWS[view].aspect = m.aspect; if (m.hand) HERO_VIEWS[view].hand = m.hand; }
  }
});
for (const view of ['front', 'back', 'side'] as const) {
  fetch(`assets/props/walk_${view}.json`)
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((meta: { frames: number; idle: number; aspect: number; hand?: UV[] }) => {
      texLoader.load(`assets/props/walk_${view}.png`, (tex) => {
        tex.repeat.set(1 / meta.frames, 1);
        const mat = heroMaterial(tex, false);
        const hands = meta.hand ?? Array.from({ length: meta.frames }, () => HERO_VIEWS[view].hand);
        HERO_VIEWS[view].sheet = { mat, tex, frames: meta.frames, idle: meta.idle, aspect: meta.aspect, hands };
      });
    })
    .catch(() => { /* keep the painted fallback */ });
}
// Screen directions on the ground plane: right, and "down" (toward the camera).
const SCREEN_RIGHT = new THREE.Vector3(CAM_DIR.z, 0, -CAM_DIR.x).normalize();
const SCREEN_DOWN = new THREE.Vector3(CAM_DIR.x, 0, CAM_DIR.z).normalize();

// Ash puffs kicked up at each footfall.
const PUFFS = 10;
const puffs: { s: THREE.Sprite; life: number }[] = [];
for (let i = 0; i < PUFFS; i++) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x8a8580, transparent: true, opacity: 0, depthWrite: false }));
  s.visible = false;
  scene.add(s);
  puffs.push({ s, life: 0 });
}
let nextPuff = 0;
function puffAt(x: number, z: number) {
  const p = puffs[nextPuff++ % PUFFS];
  p.life = 0.6;
  p.s.position.set(x, 0.15, z);
  p.s.visible = true;
}

// Live ember in the off hand: the painted flame is static, so a small
// procedural flame (the brazier flame texture, additive) sits on the hand
// anchor of the current image/frame, with a flickering light and the odd
// spark drifting up.
const handFlames: THREE.Sprite[] = [0, 1].map((k) => {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: flameTex, color: new THREE.Color(1.0, 0.45 + k * 0.15, 0.12), blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sp.renderOrder = 5;
  scene.add(sp);
  return sp;
});
const handGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: new THREE.Color(1.2, 0.45, 0.12), blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35, fog: false,
}));
handGlow.renderOrder = 5;
handGlow.scale.set(0.9, 0.9, 1);
scene.add(handGlow);
const HAND_SPARKS = 10;
const handSparkPos = new Float32Array(HAND_SPARKS * 3);
const handSparkVel = new Float32Array(HAND_SPARKS * 3);
const handSparkLife = new Float32Array(HAND_SPARKS);
const handSparkGeo = new THREE.BufferGeometry();
handSparkGeo.setAttribute('position', new THREE.BufferAttribute(handSparkPos, 3));
const handSparks = new THREE.Points(handSparkGeo, new THREE.PointsMaterial({
  color: new THREE.Color(1.6, 0.6, 0.18), size: 2.0 * pixelRatio, sizeAttenuation: false, map: glowTex, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
}));
handSparks.frustumCulled = false;
handSparks.renderOrder = 5;
scene.add(handSparks);
const handPos = new THREE.Vector3();
let heroTime = 0;

// Crossfade on a change of view or facing: a copy of the previous look fades
// out over ~100 ms on top of the new one.
const ghostMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material>(heroSprite.geometry, new THREE.MeshBasicMaterial({ visible: false }));
heroPivot.add(ghostMesh);
let ghostLife = 0;
let ghostTex: THREE.Texture | null = null;
const GHOST_TIME = 0.1;
let lastView: ViewId = 'front';
let lastFlip = false;
function startCrossfade() {
  const src = heroSprite.material as THREE.MeshStandardMaterial;
  ghostMesh.material.dispose();
  ghostTex?.dispose();
  const g = src.clone();
  ghostTex = src.map ? src.map.clone() : null;                           // freeze the sheet frame it was showing
  if (ghostTex) { g.map = ghostTex; g.emissiveMap = ghostTex; }
  g.transparent = true;
  g.alphaTest = 0.02;
  g.depthWrite = false;
  ghostMesh.material = g;
  ghostMesh.position.copy(heroSprite.position);
  ghostMesh.rotation.copy(heroSprite.rotation);
  ghostMesh.scale.copy(heroSprite.scale);
  ghostMesh.renderOrder = 1;
  ghostLife = GHOST_TIME;
}
const heroAnim = { view: 'front' as ViewId, faceRight: true, flip: false, walk: 0, phase: 0, lean: 0, freeze: null as number | null };
const lastDir = new THREE.Vector3(1, 0, 1).normalize();
function faceToward(dir: THREE.Vector3) {
  if (dir.lengthSq() > 1e-6) lastDir.copy(dir).setY(0).normalize();
  const sx = dir.dot(SCREEN_RIGHT), sy = dir.dot(SCREEN_DOWN);
  // Screen angle above the horizontal: within about 35 degrees use the side
  // view, otherwise front (moving down) or back (moving up). The band edge
  // shifts by 5 degrees depending on the current view so it does not flicker.
  const elev = Math.asin(Math.min(1, Math.abs(sy) / Math.hypot(sx, sy)));
  const edge = THREE.MathUtils.degToRad(heroAnim.view === 'side' ? 40 : 30);
  heroAnim.view = elev < edge ? 'side' : sy > 0 ? 'front' : 'back';
  if (Math.abs(sx) > 0.15) heroAnim.faceRight = sx > 0;               // straight up/down keeps the last facing
}
function updateHero(dir: THREE.Vector3 | null, moved: number, dt: number) {
  if (dir) faceToward(dir);
  heroAnim.flip = heroAnim.faceRight !== HERO_VIEWS[heroAnim.view].facesRight;
  if (heroAnim.view !== lastView || heroAnim.flip !== lastFlip) startCrossfade();
  lastView = heroAnim.view;
  lastFlip = heroAnim.flip;
  const k = 1 - Math.exp(-dt * 8);
  heroAnim.walk += ((dir ? 1 : 0) - heroAnim.walk) * k;
  heroAnim.lean += ((dir ? -dir.dot(SCREEN_RIGHT) * 0.06 : 0) - heroAnim.lean) * k;
  // Phase follows distance: half a cycle (PI) per footfall. When stopped, ease
  // the phase to the nearest contact pose so the legs settle together.
  const before = Math.floor(heroAnim.phase / Math.PI);
  if (moved > 0) heroAnim.phase += (moved / HERO_VIEWS[heroAnim.view].stride) * Math.PI;
  else {
    const rest = Math.round(heroAnim.phase / Math.PI) * Math.PI;
    heroAnim.phase += (rest - heroAnim.phase) * k;
  }
  if (moved > 0 && Math.floor(heroAnim.phase / Math.PI) !== before) {
    const side = (Math.floor(heroAnim.phase / Math.PI) % 2 ? 1 : -1) * 0.25;
    puffAt(hero.position.x + SCREEN_RIGHT.x * side, hero.position.z + SCREEN_RIGHT.z * side);
  }
  if (heroAnim.freeze !== null) { heroAnim.walk = 1; heroAnim.phase = heroAnim.freeze; }   // ?debug: pin a pose
  const v = HERO_VIEWS[heroAnim.view];
  const bob = Math.abs(Math.sin(heroAnim.phase)) * heroAnim.walk;          // 0 at foot contact, 1 mid-stride
  const sh = v.sheet;
  heroTime += dt;
  const idle = 1 - heroAnim.walk;
  const breath = Math.sin(heroTime * (Math.PI * 2 / 2.5)) * idle;          // ~2.5 s breathing cycle when standing
  walkUniforms.uTime.value = heroTime;
  walkUniforms.uCloak.value = 0.012 * idle;                                // gentle hem flutter, fades in as he stops
  let hand: UV = v.hand;
  if (sh) {
    // One loop of the sheet = one full gait cycle = two footfalls (phase 2*PI).
    const f = heroAnim.walk > 0.05
      ? Math.floor((((heroAnim.phase / (Math.PI * 2)) % 1) + 1) % 1 * sh.frames) % sh.frames
      : sh.idle;
    sh.tex.offset.x = f / sh.frames;
    hand = sh.hands[f] ?? hand;
    heroSprite.material = sh.mat;
    walkUniforms.uWalk.value = 0;                                           // the frames carry the motion
    heroSprite.scale.set(HERO_H * sh.aspect * (heroAnim.flip ? -1 : 1), HERO_H * (1 + 0.012 * breath), 1);
    heroSprite.position.y = 0.012 * breath;
  } else {
    walkUniforms.uWalk.value = heroAnim.walk;
    walkUniforms.uPhase.value = heroAnim.phase;
    heroSprite.material = v.mat;
    heroSprite.scale.set(HERO_H * v.aspect * (heroAnim.flip ? -1 : 1), HERO_H * (1 - 0.015 * (1 - bob) * heroAnim.walk + 0.012 * breath), 1);
    heroSprite.position.y = bob * 0.07 + 0.012 * breath;
  }
  heroSprite.rotation.z = heroAnim.lean;
  heroShadow.scale.setScalar(1 - 0.12 * bob - 0.02 * breath);              // tightens as the body rises / breathes in

  // Ember hand: anchor (u, v) on the quad -> world, nudged toward the camera.
  heroSprite.updateWorldMatrix(true, false);
  handPos.set(hand[0] - 0.5, hand[1], 0.02);
  heroSprite.localToWorld(handPos).addScaledVector(CAM_DIR, 0.2);
  const n = 0.5 + 0.5 * Math.sin(heroTime * 13.1) * Math.sin(heroTime * 7.7 + 1.3) + 0.2 * Math.sin(heroTime * 29.0);
  const flick = 0.8 + 0.3 * n;
  handFlames.forEach((f, k) => {
    const w = Math.sin(heroTime * (10 + k * 4.3) + k * 2.0);
    const hgt = 0.34 + 0.1 * flick + 0.05 * w - k * 0.08;
    f.scale.set(0.2 - k * 0.05 + 0.02 * Math.cos(heroTime * 9 + k), hgt, 1);
    f.position.set(handPos.x + 0.02 * Math.sin(heroTime * 8 + k), handPos.y + hgt * 0.32, handPos.z);
    f.material.rotation = 0.15 * w;
  });
  handGlow.position.copy(handPos);
  handGlow.material.opacity = 0.22 + 0.15 * flick;
  heroLight.position.copy(handPos).sub(hero.position).addScaledVector(CAM_DIR, 0.5);
  heroLight.intensity = 14 * flick;
  for (let i = 0; i < HAND_SPARKS; i++) {
    handSparkLife[i] -= dt;
    if (handSparkLife[i] <= 0) {
      if (Math.random() > dt * 2.5) { handSparkPos[i * 3 + 1] = -100; continue; }   // about 2-3 sparks a second
      handSparkPos[i * 3] = handPos.x + (Math.random() - 0.5) * 0.12;
      handSparkPos[i * 3 + 1] = handPos.y + 0.1;
      handSparkPos[i * 3 + 2] = handPos.z + (Math.random() - 0.5) * 0.12;
      handSparkVel[i * 3] = (Math.random() - 0.5) * 0.3;
      handSparkVel[i * 3 + 1] = 0.7 + Math.random() * 0.8;
      handSparkVel[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      handSparkLife[i] = 0.5 + Math.random() * 0.7;
    }
    handSparkPos[i * 3] += (handSparkVel[i * 3] + Math.sin(heroTime * 5 + i) * 0.2) * dt;
    handSparkPos[i * 3 + 1] += handSparkVel[i * 3 + 1] * dt;
    handSparkPos[i * 3 + 2] += handSparkVel[i * 3 + 2] * dt;
  }
  handSparkGeo.attributes.position.needsUpdate = true;
  ghostLife = Math.max(0, ghostLife - dt);
  ghostMesh.visible = ghostLife > 0;
  (ghostMesh.material as THREE.Material).opacity = ghostLife / GHOST_TIME;
  for (const p of puffs) {
    if (p.life <= 0) continue;
    p.life -= dt;
    const t = 1 - p.life / 0.6;
    p.s.scale.setScalar(0.35 + t * 0.6);
    p.s.position.y = 0.15 + t * 0.25;
    p.s.material.opacity = 0.35 * (1 - t);
    if (p.life <= 0) p.s.visible = false;
  }
}
const heroLight = new THREE.PointLight(0xffb070, 14, 9, 2);
heroLight.position.copy(CAM_DIR).multiplyScalar(1.2).setY(2.3);   // just in front of the painted figure
hero.add(heroLight);
const heroShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 2.2).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }),
);
heroShadow.position.y = 0.03;
hero.add(heroShadow);
updateHero(null, 0, 0);
// ?debug exposes the walk state so screenshots can pin a phase.
if (location.search.includes('debug')) (window as unknown as Record<string, unknown>).__walk = { heroAnim, walkUniforms, hero, get target() { return target; } };
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
function groundAt(ev: PointerEvent) {
  pointer.set((ev.clientX / window.innerWidth) * 2 - 1, -(ev.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObject(pickPlane)[0]?.point ?? null;
}
function moveTo(p: THREE.Vector3, showMarker: boolean) {
  const lim = half - 1;
  target.set(THREE.MathUtils.clamp(p.x, -lim, lim), 0, THREE.MathUtils.clamp(p.z, -lim, lim));
  moving = true;
  if (showMarker) {
    marker.position.set(target.x, 0.02, target.z);
    (marker.material as THREE.MeshBasicMaterial).opacity = 1;
  }
}
// Click: a ghoul -> attack it (walk into range, then swing); the floor -> walk.
// Holding the button keeps attacking the same ghoul, or keeps steering the walk.
// Ground loot under the cursor wins over ghouls, which win over the floor.
function pick(ev: PointerEvent, first: boolean) {
  if (combat.isDead()) return;
  const ground = groundAt(ev);
  if (first) {
    const item = loot.pickAt(ev.clientX, ev.clientY);
    if (item) { combat.setTarget(null); loot.setTarget(item); return; }
    loot.setTarget(null);
    const g = combat.pickGhoul(ev.clientX, ev.clientY, ground);
    combat.setTarget(g);
    if (g) return;
  } else if (combat.hasTarget() || loot.hasTarget()) return;
  if (ground) moveTo(ground, true);
}
renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 0) { mouseDown = true; pick(e, true); }
  else if (e.button === 2) castRmb();
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointermove', (e) => { if (mouseDown) pick(e, false); });
window.addEventListener('pointerup', () => { mouseDown = false; });

const HERO_START = new THREE.Vector3(0, 0, 0);
let bar: ReturnType<typeof setupSkillBar> | null = null;
function renderBar() {
  if (!bar) return;
  const ms: SlotModel[] = [];
  for (let i = 0; i < 4; i++) {
    const id = player.slots[i];
    if (!id) { ms.push({ icon: null, name: '', desc: '', cd: 0, cdTotal: 0, disabled: true }); continue; }
    const d = skillDef(id), lv = player.skillLevel(id);
    ms.push({ icon: d.icon, name: `${d.name} (${lv}레벨)`, desc: `${d.desc}<br><span class="b">마나 ${d.mp[lv - 1]} · 재사용 ${d.cd[lv - 1]}초</span>`, cd: skills.cdLeft(id), cdTotal: skills.cdTotal(id), noMana: player.mp < d.mp[lv - 1] });
  }
  const pot = (k: number, kind: 'potion_hp' | 'potion_mp', name: string, desc: string): SlotModel => {
    const n = player.count(kind);
    return { icon: kind === 'potion_hp' ? 'icon_potion_hp' : 'icon_potion_mp', name, desc, count: n, cd: Math.max(0, potionReady[k] - clock.elapsedTime), cdTotal: POTION_CD, disabled: n <= 0 };
  };
  ms.push(pot(0, 'potion_hp', '체력 물약', '체력 60 회복 (가방의 물약 사용, 재사용 8초)'), pot(1, 'potion_mp', '마나 물약', '마나 40 회복 (가방의 물약 사용, 재사용 8초)'));
  const r = player.rmbSkill();
  bar.render(ms, r ? `우클릭: ${skillDef(r).name}` : '');
}
const loadedFrom = loadGame();
const loot = setupLoot({
  scene, camera, texLoader, glowTex, hero,
  moveHeroTo: (p) => moveTo(p, false),
  stopHero: () => { moving = false; },
});
const combat = setupCombat({
  scene, camera, texLoader, maxAnisotropy: renderer.capabilities.getMaxAnisotropy(), glowTex, shadowTex,
  camDir: CAM_DIR, propTilt: PROP_TILT, propYaw: PROP_YAW, screenRight: SCREEN_RIGHT, screenDown: SCREEN_DOWN,
  hero, heroPivot, heroStart: HERO_START,
  moveHeroTo: (p) => moveTo(p, false),
  stopHero: () => { moving = false; },
  faceHero: (dir) => faceToward(dir),
  onKill: (at, level) => {
    const r = rollDrop(level);
    const item = r.drops.find((d) => d.kind === 'item');
    const gold = r.drops.find((d) => d.kind === 'gold');
    loot.log.push({
      outcome: r.outcome,
      rarity: item?.kind === 'item' ? item.item.rarity : undefined,
      gold: gold?.kind === 'gold' ? gold.amount : undefined,
      name: r.drops.map((d) => (d.kind === 'item' ? d.item.name : `금화 ${d.amount}`)).join(', '),
    });
    loot.spawn(r.drops, at);
    player.gainXp(XP.ghoul * level);
  },
});
player.onChange((why) => {
  if (why !== 'levelup') return;
  combat.levelUpFx();
  // first level-up: point the way to the skill tree
  if (Object.keys(player.skills).length === 0) toast('스킬 점수 +1 — S 키로 기술 창을 여세요', 3200);
});
const skills = setupSkills({ scene, world: combat.world, hero, glowTex, screenRight: SCREEN_RIGHT, screenDown: SCREEN_DOWN, floorHalf: half });
// aim: the floor under the mouse; over UI (or off the floor) the facing direction
let mouseX = -1, mouseY = -1, mouseOverCanvas = false;
window.addEventListener('pointermove', (e) => { mouseX = e.clientX; mouseY = e.clientY; mouseOverCanvas = e.target === renderer.domElement; });
function aim() {
  let at: THREE.Vector3 | null = null;
  if (mouseOverCanvas) {
    pointer.set((mouseX / window.innerWidth) * 2 - 1, -(mouseY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    at = raycaster.intersectObject(pickPlane)[0]?.point ?? null;
  }
  if (!at || Math.hypot(at.x - hero.position.x, at.z - hero.position.z) < 0.2) at = hero.position.clone().addScaledVector(lastDir, 3);
  return { at, dir: at.clone().sub(hero.position).setY(0).normalize() };
}
function castSkill(id: Parameters<typeof skills.cast>[0] | null, slot: number) {
  if (!id) { bar?.deny(slot); sfx.denied(); return; }
  const a = aim();
  const r = skills.cast(id, a.at, a.dir);
  if (r === 'ok') bar?.used(slot);
  else {
    bar?.deny(slot);
    sfx.denied();
    if (r === 'mana') toast('마나가 부족합니다', 700);
  }
}
function castRmb() { if (!combat.isDead()) castSkill(player.rmbSkill(), Math.max(0, player.slots.indexOf(player.rmbSkill()))); }
let moveSpeed = player.derived().moveSpeed;
player.onChange(() => { moveSpeed = player.derived().moveSpeed; });

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
function frame() {
  const realDt = Math.min(clock.getDelta(), 0.05);
  const dt = realDt * combat.timeScale(realDt);
  const t = clock.elapsedTime;

  let step = 0;
  if (moving && (combat.isLocked() || skills.isCharging())) step = 0;           // cast animation: hold still
  else if (moving) {
    tmp.subVectors(target, hero.position).setY(0);
    const dist = tmp.length();
    if (dist < 0.05) {
      moving = false;
    } else {
      step = Math.min(dist, moveSpeed * dt);
      hero.position.addScaledVector(tmp.normalize(), step);
    }
  }
  updateHero(moving ? tmp : null, step, dt);
  combat.update(dt, realDt);
  loot.update(dt);
  skills.update(dt);
  renderBar();

  const mm = marker.material as THREE.MeshBasicMaterial;
  mm.opacity = Math.max(0, mm.opacity - dt * 1.5);

  for (const tr of torches) {
    const n = 0.5 + 0.5 * Math.sin(t * 11 + tr.phase) * Math.sin(t * 5.3 + tr.phase * 2) + 0.25 * Math.sin(t * 23 + tr.phase * 3);
    const flick = 0.82 + 0.28 * n;
    tr.light.intensity = tr.base * flick;
    tr.halo.material.opacity = 0.13 + 0.1 * flick;
    tr.coals.color.setRGB(0.6 + 0.4 * flick, 0.15 + 0.1 * flick, 0.03);
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
  for (let i = 0; i < SPARKS && torches.length; i++) {
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
  camera.position.add(combat.shakeOffset);

  composer.render();
  requestAnimationFrame(frame);
}
frame();
const inventory = setupInventory({
  onDropToWorld: (it) => loot.dropAtHero(it),
  onNewGame: () => { wipeSave(); player.reset(); hero.position.copy(HERO_START); moving = false; saveNow(); },
});
// skill bar: 1-4 skills, 5/6 potions (8 s cooldown each)
const POTION_CD = 8;
const potionReady = [0, 0];
let tree: ReturnType<typeof setupSkillTree> | null = null;
bar = setupSkillBar({
  onUse(i) {
    if (i < 4) { castSkill(player.slots[i], i); return; }
    const k = i - 4, kind = k === 0 ? 'potion_hp' : 'potion_mp';
    if (clock.elapsedTime < potionReady[k]) { bar?.deny(i); sfx.denied(); return; }
    if (combat.drinkPotion(kind)) { potionReady[k] = clock.elapsedTime + POTION_CD; bar?.used(i); }
    else { bar?.deny(i); sfx.denied(); }
  },
  onSlotClick: (i) => tree?.slotClicked(i) ?? false,
});
tree = setupSkillTree({
  assign(slot, id) {
    const j = player.slots.indexOf(id);
    if (j >= 0) player.slots[j] = player.slots[slot];       // swap if already on the bar
    player.slots[slot] = id;
    player.emit('skill');
  },
  setPicking: (on) => bar?.setPicking(on),
  slotAt: (x, y) => bar?.slotAt(x, y) ?? -1,
});
startAutosave();
if (location.search.includes('debug')) {
  // test hooks only (not reachable from the UI)
  Object.assign(window as unknown as Record<string, unknown>, {
    __combat: combat.debug, __renderer: renderer,
    __av: { player, skills, skillsLog: skills.log, tree, aim, loot: loot.debug, lootApi: loot, combat, lootLog: loot.log, inventory, saveNow, makeItem, makeUnique, rollDrop, loadedFrom },
  });
}
