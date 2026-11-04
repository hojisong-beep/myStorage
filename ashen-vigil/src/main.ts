// Ashen Vigil — M0 skeleton: isometric camera, tiled ground, torches,
// a placeholder hero that walks to where you click, drifting ash.
import * as THREE from 'three';

const TILE = 2;           // world units per floor tile
const GRID = 24;          // tiles per side
const MOVE_SPEED = 6;     // units per second
const VIEW = 18;          // orthographic view height in world units

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0a09);
scene.fog = new THREE.Fog(0x0b0a09, 30, 60);

// Isometric-style orthographic camera, kept at a fixed offset from the hero.
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const CAM_OFFSET = new THREE.Vector3(20, 22, 20);
function resize() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = (-VIEW * aspect) / 2;
  camera.right = (VIEW * aspect) / 2;
  camera.top = VIEW / 2;
  camera.bottom = -VIEW / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// Dim ambient light: the world should be dark outside light sources.
scene.add(new THREE.HemisphereLight(0x5a5c70, 0x1a1410, 0.6));
const moon = new THREE.DirectionalLight(0x8090b0, 0.4);
moon.position.set(-10, 30, 5);
scene.add(moon);

// Floor: stone tiles with slight color variation (placeholder until Grok textures).
const tileGeo = new THREE.BoxGeometry(TILE * 0.96, 0.3, TILE * 0.96);
const half = (GRID * TILE) / 2;
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < GRID; i++) {
  for (let j = 0; j < GRID; j++) {
    const shade = 0.13 + rand() * 0.06;
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(shade, shade * 0.95, shade * 0.9), roughness: 0.95 });
    const t = new THREE.Mesh(tileGeo, mat);
    t.position.set(i * TILE - half + TILE / 2, -0.15 - rand() * 0.05, j * TILE - half + TILE / 2);
    t.receiveShadow = true;
    scene.add(t);
  }
}

// Invisible plane used for click picking.
const pickPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(GRID * TILE, GRID * TILE).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ visible: false }),
);
scene.add(pickPlane);

// Broken pillars and flickering torches.
const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.9 });
const torches: { light: THREE.PointLight; base: number; phase: number }[] = [];
const pillarSpots: [number, number, number][] = [
  [-8, -8, 4], [8, -8, 2.5], [-8, 8, 3], [8, 8, 4.5], [0, -14, 3.5], [-14, 2, 2], [14, -2, 3],
];
for (const [x, z, h] of pillarSpots) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, h, 8), pillarMat);
  p.position.set(x, h / 2, z);
  p.castShadow = true;
  p.receiveShadow = true;
  scene.add(p);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  flame.position.set(x, h + 0.4, z);
  scene.add(flame);
  const light = new THREE.PointLight(0xff8a30, 30, 14, 2);
  light.position.copy(flame.position);
  scene.add(light);
  torches.push({ light, base: 30, phase: rand() * 10 });
}

// Placeholder hero: a capsule with a small ember light that follows them.
const hero = new THREE.Group();
const body = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.45, 1.1, 4, 12),
  new THREE.MeshStandardMaterial({ color: 0x6e6a64, roughness: 0.6, metalness: 0.3 }),
);
body.position.y = 1;
body.castShadow = true;
hero.add(body);
const facing = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0xe8873a }));
facing.rotation.x = Math.PI / 2;
facing.position.set(0, 1.1, 0.55);
hero.add(facing);
const heroLight = new THREE.PointLight(0xffb070, 12, 9, 2);
heroLight.position.y = 2.5;
hero.add(heroLight);
scene.add(hero);

// Click target marker.
const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.3, 0.45, 24).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xe8873a, transparent: true, opacity: 0 }),
);
marker.position.y = 0.02;
scene.add(marker);

// Drifting ash particles around the camera focus.
const ASH = 600;
const ashPos = new Float32Array(ASH * 3);
for (let i = 0; i < ASH; i++) {
  ashPos[i * 3] = (rand() - 0.5) * 40;
  ashPos[i * 3 + 1] = rand() * 14;
  ashPos[i * 3 + 2] = (rand() - 0.5) * 40;
}
const ashGeo = new THREE.BufferGeometry();
ashGeo.setAttribute('position', new THREE.BufferAttribute(ashPos, 3));
const ash = new THREE.Points(ashGeo, new THREE.PointsMaterial({ color: 0x9a9088, size: 0.08, transparent: true, opacity: 0.7 }));
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
    tr.light.intensity = tr.base * (0.85 + 0.15 * Math.sin(t * 13 + tr.phase) * Math.sin(t * 7.3 + tr.phase * 2));
  }

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

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
