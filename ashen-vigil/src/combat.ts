// M1 combat: Ash Ghouls, click-to-attack, hit feedback, health, death.
//
// The hero walks into range of the clicked ghoul, stops, and swings every
// 0.55 s while the target lives. Ghouls idle near their group's anchor,
// chase within 9 units, wind up for 0.6 s behind a red ground telegraph and
// strike. Hits get hit-stop, a white flash, knockback, sparks, screen shake,
// floating numbers and a procedural sound.
import * as THREE from 'three';
import { sfx } from './audio';
import { SKILLS, SPELL, xpToNext, XP } from './data/balance';
import { player } from './stats';

export interface CombatCtx {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  texLoader: THREE.TextureLoader;
  maxAnisotropy: number;
  glowTex: THREE.Texture;
  shadowTex: THREE.Texture;
  camDir: THREE.Vector3;
  propTilt: number;
  propYaw: number;
  screenRight: THREE.Vector3;
  screenDown: THREE.Vector3;
  hero: THREE.Group;
  heroPivot: THREE.Group;
  heroStart: THREE.Vector3;
  moveHeroTo(p: THREE.Vector3): void;
  onKill(at: THREE.Vector3, monsterLevel: number): void;
  stopHero(): void;
  faceHero(dir: THREE.Vector3): void;
}

// --- tuning --------------------------------------------------------------
const HERO_RANGE = 1.8;
const SWING_IMPACT = 0.11;          // seconds into the swing when the blade lands
// Hero damage, swing period, crit, defence and max HP/MP come from stats.ts (player.derived()).
const RESPAWN_TIME = 90;
const STATUS_TICK = 0.5;     // burn tick (s)
const RESPAWN_MIN_DIST = 20;

const GHOUL_HP = 60;
const GHOUL_SPEED = 2.4;
const GHOUL_SIGHT = 9;
const GHOUL_LEASH = 15;
const GHOUL_RANGE = 1.6;
const GHOUL_WINDUP = 0.6;
const GHOUL_RECOVER = 1.4;
const GHOUL_DMG: [number, number] = [8, 12];
const GHOUL_H = 2.86;               // 1.1x the hero
const GHOUL_STRIDE = 1.2;
const KNOCKBACK = 0.5;
const GROUPS: { at: [number, number]; n: number }[] = [
  { at: [-14, -12], n: 3 }, { at: [15, 8], n: 2 }, { at: [-6, 17], n: 1 },
];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const irnd = (a: number, b: number) => Math.floor(rnd(a, b + 1));

// --- procedural textures --------------------------------------------------
function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const slashTex = () => canvasTex(256, 256, (c) => {
  // a crescent: big disc minus an offset disc, white-hot inner edge to orange
  const g = c.createRadialGradient(128, 150, 40, 128, 128, 120);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,250,230,1)');
  g.addColorStop(0.8, 'rgba(255,150,40,0.9)');
  g.addColorStop(1, 'rgba(200,60,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(128, 128, 120, Math.PI * 1.05, Math.PI * 1.95);
  c.arc(128, 165, 100, Math.PI * 1.9, Math.PI * 1.1, true);
  c.closePath();
  c.fill();
});

// --- particle pool ----------------------------------------------------------
class Burst {
  pos: Float32Array; vel: Float32Array; life: Float32Array; geo: THREE.BufferGeometry; pts: THREE.Points; next = 0;
  constructor(scene: THREE.Scene, public n: number, mat: THREE.PointsMaterial, public gravity: number) {
    this.pos = new Float32Array(n * 3).fill(-1000);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.pts = new THREE.Points(this.geo, mat);
    this.pts.frustumCulled = false;
    scene.add(this.pts);
  }
  emit(at: THREE.Vector3, count: number, speed: number, up: number, life: number) {
    for (let k = 0; k < count; k++) {
      const i = this.next++ % this.n;
      this.pos[i * 3] = at.x; this.pos[i * 3 + 1] = at.y; this.pos[i * 3 + 2] = at.z;
      const a = Math.random() * Math.PI * 2, s = speed * rnd(0.3, 1);
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = up * rnd(0.4, 1.2); this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = life * rnd(0.5, 1);
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -1000; continue; }
      this.vel[i * 3 + 1] -= this.gravity * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] = Math.max(0.03, this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt);
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
    }
    this.geo.attributes.position.needsUpdate = true;
  }
}

// --- monsters --------------------------------------------------------------
type GView = 'front' | 'back';
interface SheetInfo { tex: THREE.Texture; frames: number; idle: number; aspect: number }
interface Ghoul {
  root: THREE.Group; pivot: THREE.Group; mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  mats: Record<GView, THREE.MeshStandardMaterial>; texs: Record<GView, THREE.Texture | null>;
  view: GView; faceRight: boolean; phase: number; walk: number; breathT: number;
  hp: number; state: 'idle' | 'chase' | 'windup' | 'recover' | 'dead';
  timer: number; group: number; anchor: THREE.Vector3; wander: THREE.Vector3; wanderT: number;
  knock: THREE.Vector3; stagger: number; flash: number; lunge: number;
  tele: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  bar: HTMLDivElement; barFill: HTMLDivElement; barT: number; deathT: number; shadow: THREE.Mesh;
  home: THREE.Vector3; respawnT: number; ember: THREE.Sprite | null;
  // status effects (M2-b)
  stun: number; stars: THREE.Sprite;
  slowT: number; slowMul: number; weakT: number; weakMul: number;
  burnT: number; burnTick: number; burnDmg: number;
}

export function setupCombat(ctx: CombatCtx) {
  const { scene, camera } = ctx;

  // ---------- DOM: orbs, numbers, bars, vignette, death overlay ----------
  const style = document.createElement('style');
  style.textContent = `
  #orbs { position: fixed; left: calc(16px + env(safe-area-inset-left, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    display: flex; gap: 10px; pointer-events: none; user-select: none; z-index: 3; }
  .orb { position: relative; width: 74px; height: 74px; border-radius: 50%; overflow: hidden; background: #0c0a09;
    border: 2px solid #4a4038; box-shadow: 0 0 0 1px #000, inset 0 0 14px #000; }
  .orb .fill { position: absolute; left: 0; right: 0; bottom: 0; transition: height 0.15s; }
  .orb.hp .fill { background: radial-gradient(circle at 40% 30%, #e0503a, #7a0f0a 70%); }
  .orb.mp .fill { background: radial-gradient(circle at 40% 30%, #4f6fe0, #121c5a 70%); }
  #orbs .lvl { align-self: flex-end; min-width: 26px; padding: 3px 6px; font: 700 13px/1 Georgia, serif; color: #f0c060;
    background: rgba(10, 8, 7, 0.85); border: 1px solid #5a4838; text-align: center; }
  #xpbar { position: fixed; left: 0; right: 0; bottom: 0; height: 4px; background: rgba(0,0,0,0.6); z-index: 3; pointer-events: none; }
  #xpbar > div { height: 100%; width: 0; background: linear-gradient(90deg, #8a6a20, #f0c060); transition: width 0.2s; }
  .dmg.lvl { color: #ffd870; font-size: 30px; letter-spacing: 0.08em; }
  .dmg.dot { color: #ff9a50; font-size: 14px; }
  .orb .v { position: absolute; inset: 0; display: grid; place-items: center; font: 600 13px/1 system-ui, sans-serif; color: #f0e4d4; text-shadow: 0 1px 2px #000; }
  .dmg { position: fixed; left: 0; top: 0; pointer-events: none; font: 700 18px/1 Georgia, serif; color: #f2ece4;
    text-shadow: 0 1px 2px #000, 0 0 6px #000; white-space: nowrap; z-index: 4; will-change: transform, opacity; }
  .dmg.crit { color: #ff9a3a; font-size: 28px; }
  .dmg.hurt { color: #ff5a4a; }
  .gbar { position: fixed; left: 0; top: 0; width: 64px; height: 6px; background: #1a0d0b; border: 1px solid #000; overflow: hidden;
    pointer-events: none; z-index: 2; display: none; }
  .gbar > div { height: 100%; background: linear-gradient(#e0583a, #8a1e10); }
  #vignette { position: fixed; inset: 0; pointer-events: none; z-index: 5; opacity: 0;
    background: radial-gradient(ellipse at center, rgba(120,0,0,0) 45%, rgba(170,10,0,0.75) 100%); }
  #fallen { position: fixed; inset: 0; display: none; place-items: center; z-index: 6; pointer-events: none;
    background: rgba(10,0,0,0.55); font: 600 34px/1.2 Georgia, serif; letter-spacing: 0.15em; color: #d84a2a; text-shadow: 0 2px 8px #000; }
  #mute { position: fixed; right: calc(16px + env(safe-area-inset-right, 0px)); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    font: 12px/1.4 system-ui, sans-serif; color: #8a7e70; pointer-events: none; z-index: 3; }
  /* narrow screens: the centred skill bar reaches the left edge, so lift the orbs above it */
  @media (max-width: 1000px) { #orbs { bottom: calc(92px + env(safe-area-inset-bottom, 0px)); } }
  @media (max-width: 520px) { .orb { width: 52px; height: 52px; } #orbs { bottom: calc(80px + env(safe-area-inset-bottom, 0px)); } }
  `;
  document.head.appendChild(style);
  const orbs = document.createElement('div');
  orbs.id = 'orbs';
  orbs.innerHTML = '<div class="orb hp"><div class="fill"></div><div class="v"></div></div><div class="orb mp"><div class="fill"></div><div class="v"></div></div><div class="lvl"></div>';
  document.body.appendChild(orbs);
  const hpFill = orbs.querySelector('.hp .fill') as HTMLDivElement, hpText = orbs.querySelector('.hp .v') as HTMLDivElement;
  const mpFill = orbs.querySelector('.mp .fill') as HTMLDivElement, mpText = orbs.querySelector('.mp .v') as HTMLDivElement;
  const lvlEl = orbs.querySelector('.lvl') as HTMLDivElement;
  const xpBar = document.createElement('div');
  xpBar.id = 'xpbar';
  xpBar.innerHTML = '<div></div>';
  document.body.appendChild(xpBar);
  const xpFill = xpBar.firstElementChild as HTMLDivElement;
  const vignette = document.createElement('div');
  vignette.id = 'vignette';
  document.body.appendChild(vignette);
  const fallen = document.createElement('div');
  fallen.id = 'fallen';
  fallen.textContent = '쓰러졌습니다';
  document.body.appendChild(fallen);
  const muteEl = document.createElement('div');
  muteEl.id = 'mute';
  document.body.appendChild(muteEl);
  const setMuteText = () => { muteEl.textContent = sfx.muted ? 'M: 소리 꺼짐' : 'M: 소리 켜짐'; };
  setMuteText();
  window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M' || e.key === 'ㅡ') { sfx.toggle(); setMuteText(); } });

  const nums: { el: HTMLDivElement; pos: THREE.Vector3; t: number; dx: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const el = document.createElement('div');
    el.className = 'dmg';
    el.style.display = 'none';
    document.body.appendChild(el);
    nums.push({ el, pos: new THREE.Vector3(), t: 0, dx: 0 });
  }
  let nextNum = 0;
  function popNumber(at: THREE.Vector3, text: string, kind: '' | 'crit' | 'hurt' | 'lvl' | 'dot') {
    const n = nums[nextNum++ % nums.length];
    n.el.textContent = text;
    n.el.className = 'dmg' + (kind ? ' ' + kind : '');
    n.el.style.display = 'block';
    n.pos.copy(at);
    n.t = kind === 'lvl' ? 1.6 : kind === 'crit' ? 1.0 : 0.8;
    n.dx = rnd(-14, 14);
  }
  const v3 = new THREE.Vector3();
  function toScreen(p: THREE.Vector3) {
    v3.copy(p).project(camera);
    return [(v3.x * 0.5 + 0.5) * window.innerWidth, (-v3.y * 0.5 + 0.5) * window.innerHeight];
  }

  // ---------- effects ----------
  const sparks = new Burst(scene, 160, new THREE.PointsMaterial({
    color: new THREE.Color(1.8, 0.75, 0.25), size: 3, sizeAttenuation: false, map: ctx.glowTex, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }), 7);
  const ashBurst = new Burst(scene, 180, new THREE.PointsMaterial({
    color: 0x6a6460, size: 3.5, sizeAttenuation: false, map: ctx.glowTex, transparent: true, opacity: 0.8, depthWrite: false,
  }), -0.6);
  const slashMat = new THREE.SpriteMaterial({ map: slashTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
  const slash = new THREE.Sprite(slashMat);
  slash.visible = false;
  scene.add(slash);
  let slashT = 0;
  const embers: THREE.Sprite[] = [];
  let hitstop = 0, shake = 0, vignetteT = 0;
  const shakeOffset = new THREE.Vector3();

  // ---------- hero state ----------
  let dead = false, deadT = 0;
  let target: Ghoul | null = null;
  let swingT = -1, swingCd = 0, swingDir = new THREE.Vector3(1, 0, 0), swingResolved = false;
  let orbKey = '';
  function drawOrbs() {
    const d = player.derived();
    const key = `${Math.ceil(player.hp)}/${d.maxHp}/${Math.floor(player.mp)}/${d.maxMp}/${player.level}/${Math.floor(player.xp)}`;
    if (key === orbKey) return;
    orbKey = key;
    hpFill.style.height = `${(player.hp / d.maxHp) * 100}%`;
    hpText.textContent = `${Math.ceil(player.hp)}`;
    mpFill.style.height = `${(player.mp / d.maxMp) * 100}%`;
    mpText.textContent = `${Math.floor(player.mp)}`;
    lvlEl.textContent = `${player.level}`;
    lvlEl.title = `레벨 ${player.level}`;
    xpFill.style.width = player.level >= XP.maxLevel ? '100%' : `${Math.min(100, (player.xp / xpToNext(player.level)) * 100)}%`;
  }
  player.onChange(() => drawOrbs());
  drawOrbs();
  let lastHit = { dmg: 0, crit: false, min: 0, max: 0 };

  // ---------- ghoul assets ----------
  const sheets: Partial<Record<GView, SheetInfo>> = {};
  const stills: Partial<Record<GView, { tex: THREE.Texture; aspect: number }>> = {};
  const ghouls: Ghoul[] = [];
  function prepTex(t: THREE.Texture) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = ctx.maxAnisotropy;
    return t;
  }
  function ghoulMat() {
    return new THREE.MeshStandardMaterial({
      alphaTest: 0.45, roughness: 0.85, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.25,
    });
  }
  function applyLook(g: Ghoul, view: GView) {
    // per-ghoul texture clones (shared image) so each can show its own frame
    const sh = sheets[view], st = stills[view];
    const base = sh?.tex ?? st?.tex;
    if (!base || g.texs[view]) return;
    const t = base.clone();
    if (sh) t.repeat.set(1 / sh.frames, 1);
    g.texs[view] = t;
    g.mats[view].map = t;
    g.mats[view].emissiveMap = t;
    g.mats[view].needsUpdate = true;
  }
  for (const view of ['front', 'back'] as const) {
    fetch(`assets/props/walk_ghoul_${view}.json`).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((meta: { frames: number; idle: number; aspect: number }) => {
        ctx.texLoader.load(`assets/props/walk_ghoul_${view}.png`, (tex) => {
          sheets[view] = { tex: prepTex(tex), frames: meta.frames, idle: meta.idle, aspect: meta.aspect };
          for (const g of ghouls) { g.texs[view] = null; applyLook(g, view); }
        });
      })
      .catch(() => { /* still images below are the fallback */ });
    ctx.texLoader.load(`assets/props/ghoul_${view}.png`, (tex) => {
      const img = tex.image as { width: number; height: number };
      stills[view] = { tex: prepTex(tex), aspect: img.width / img.height };
      if (!sheets[view]) for (const g of ghouls) applyLook(g, view);
    });
  }

  // stun stars: a ring of little stars drawn once
  const starMat = new THREE.SpriteMaterial({ map: canvasTex(128, 64, (c) => {
    c.fillStyle = '#ffe680';
    for (let i = 0; i < 4; i++) {
      const x = 20 + i * 29, y = 32 + (i % 2 ? -8 : 8);
      c.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 4 : 10, a = (k / 10) * Math.PI * 2 - Math.PI / 2; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      c.fill();
    }
  }), depthWrite: false, transparent: true, fog: false });
  const teleGeo = new THREE.CircleGeometry(1.95, 28, -Math.PI * 0.32, Math.PI * 0.64).rotateX(-Math.PI / 2);
  const barLayer = document.body;
  let gi = 0;
  GROUPS.forEach((grp, gidx) => {
    for (let k = 0; k < grp.n; k++) {
      const a = (k / grp.n) * Math.PI * 2 + gidx;
      const pos = new THREE.Vector3(grp.at[0] + Math.cos(a) * 1.4 * Math.min(1, grp.n - 1), 0, grp.at[1] + Math.sin(a) * 1.4 * Math.min(1, grp.n - 1));
      const root = new THREE.Group();
      root.position.copy(pos);
      const pivot = new THREE.Group();
      pivot.rotation.set(ctx.propTilt, ctx.propYaw, 0, 'YXZ');
      root.add(pivot);
      const mats = { front: ghoulMat(), back: ghoulMat() };
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0), mats.front);
      mesh.userData.ghoul = gi++;
      pivot.add(mesh);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: ctx.shadowTex, transparent: true, depthWrite: false }));
      shadow.position.y = 0.03;
      root.add(shadow);
      const tele = new THREE.Mesh(teleGeo, new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      tele.position.y = 0.05;
      tele.visible = false;
      scene.add(tele);
      scene.add(root);
      const stars = new THREE.Sprite(starMat);
      stars.scale.set(0.9, 0.45, 1);
      stars.position.y = GHOUL_H + 0.35;
      stars.visible = false;
      root.add(stars);
      const bar = document.createElement('div');
      bar.className = 'gbar';
      const barFill = document.createElement('div');
      bar.appendChild(barFill);
      barLayer.appendChild(bar);
      ghouls.push({
        root, pivot, mesh, mats, texs: { front: null, back: null }, view: 'front', faceRight: Math.random() < 0.5, phase: 0, walk: 0, breathT: Math.random() * 3,
        hp: GHOUL_HP, state: 'idle', timer: 0, group: gidx, anchor: new THREE.Vector3(grp.at[0], 0, grp.at[1]),
        wander: pos.clone(), wanderT: rnd(1, 4), knock: new THREE.Vector3(), stagger: 0, flash: 0, lunge: 0,
        tele, bar, barFill, barT: 0, deathT: 0, shadow, home: pos.clone(), respawnT: 0, ember: null,
        stun: 0, stars, slowT: 0, slowMul: 0, weakT: 0, weakMul: 0, burnT: 0, burnTick: 0, burnDmg: 0,
      });
    }
  });

  // ---------- helpers ----------
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  /** Weapon hit value: weapon roll (str and +damage% included) + gear fire roll. */
  function weaponRoll() {
    const d = player.derived();
    return irnd(d.dmgMin, d.dmgMax) + (d.fireMax > 0 ? irnd(d.fireMin, d.fireMax) : 0);
  }
  /** Spell value: (base roll + energy x perEne) x (1 + damage%). */
  function spellRoll() {
    return (irnd(SPELL.base[0], SPELL.base[1]) + player.attrs.ene * SPELL.perEne) * (1 + player.modTotal('dmgPct') / 100);
  }
  function critRoll() { return Math.random() * 100 < player.derived().crit; }
  interface HitOpts { crit?: boolean; dir?: THREE.Vector3 | null; knock?: number; stun?: number; dot?: boolean; feel?: number }
  /** Apply damage to a ghoul with the hit feedback that fits (DoT ticks are quiet). */
  function damageGhoul(g: Ghoul, raw: number, o: HitOpts = {}) {
    if (g.state === 'dead') return 0;
    const crit = !!o.crit && !o.dot;
    const dmg = Math.max(1, Math.round(raw * (crit ? player.derived().critMult : 1)));
    g.hp = Math.max(0, g.hp - dmg);
    g.barT = 3;
    if (g.state === 'idle') aggroGroup(g.group);
    tmp.copy(g.root.position).setY(GHOUL_H + 0.2);
    if (o.dot) {
      popNumber(tmp, `${dmg}`, 'dot');
    } else {
      g.flash = 0.08;
      if (o.knock && o.dir) g.knock.copy(o.dir).setY(0).normalize().multiplyScalar(o.knock / 0.12);
      if (o.stun) stunGhoul(g, o.stun);
      else if (g.state === 'windup') g.timer += 0.15;                     // a hit delays the swing, it does not cancel it
      else g.stagger = 0.25;
      const feel = o.feel ?? 1;
      hitstop = Math.max(hitstop, (crit ? 0.07 : 0.05) * feel);
      shake = Math.max(shake, (crit ? 0.22 : 0.09) * feel);
      tmp2.copy(g.root.position).setY(1.5);
      sparks.emit(tmp2, Math.round((crit ? 26 : 14) * feel), crit ? 5 : 3.5, 3, 0.45);
      popNumber(tmp, `${dmg}`, crit ? 'crit' : '');
      if (crit) sfx.crit(); else sfx.hit();
    }
    if (g.hp <= 0) killGhoul(g);
    return dmg;
  }
  function stunGhoul(g: Ghoul, t: number) {
    if (g.state === 'dead') return;
    g.stun = Math.max(g.stun, t);
    if (g.state === 'windup') { g.state = 'chase'; g.tele.visible = false; }   // a stun cancels a wind-up
  }
  function hurtGhoul(g: Ghoul, dir: THREE.Vector3) {
    const d = player.derived();
    const crit = critRoll();
    const raw = weaponRoll();
    const dmg = damageGhoul(g, raw, { crit, dir, knock: KNOCKBACK });
    lastHit = { dmg, crit, min: d.dmgMin + d.fireMin, max: Math.round((d.dmgMax + d.fireMax) * d.critMult) };
  }
  function killGhoul(g: Ghoul) {
    g.state = 'dead';
    g.deathT = 0;
    g.tele.visible = false;
    g.bar.style.display = 'none';
    sfx.death();
    g.respawnT = RESPAWN_TIME;
    if (target === g) { target = null; swingT = -1; }
    ctx.onKill(g.root.position.clone(), 1);
  }
  function aggroGroup(group: number) {
    for (const o of ghouls) if (o.group === group && o.state === 'idle') o.state = 'chase';
  }
  let invulnT = 0;
  let lockT = 0;
  let armorUntil = 0, armorAbsorb = 0;
  let vigilReadyAt = 0;
  function hurtHero(raw: number) {
    if (dead || invulnT > 0) return;
    // physical damage: defence (incl. Ash Armour) then physical resistance
    const d = player.derived();
    let dmg = Math.max(1, Math.round(raw * d.dmgTaken * (1 - d.res.phys / 100)));
    // Ash Armour: a share of the hit is paid with mana instead
    if (performance.now() < armorUntil && player.mp > 0) {
      const soak = Math.min(player.mp, Math.round(dmg * armorAbsorb));
      player.mp -= soak;
      dmg -= soak;
    }
    // Last Vigil (passive): survive a killing blow
    const vigil = player.skillLevel('last_vigil');
    if (vigil > 0 && player.hp - dmg <= 0 && performance.now() >= vigilReadyAt) {
      const def = SKILLS.find((x) => x.id === 'last_vigil')!;
      vigilReadyAt = performance.now() + def.cd[vigil - 1] * 1000;
      player.hp = Math.round(d.maxHp * def.extra![vigil - 1]);
      lastVigilFx(def.radius![vigil - 1], def.dur![vigil - 1]);
      drawOrbs();
      return;
    }
    player.hp = Math.max(0, player.hp - dmg);
    drawOrbs();
    shake = Math.max(shake, 0.16);
    vignetteT = 0.35;
    tmp.copy(ctx.hero.position).setY(2.9);
    popNumber(tmp, `${dmg}`, 'hurt');
    sfx.hurt();
    if (player.hp <= 0) {
      dead = true;
      deadT = 2;
      target = null;
      swingT = -1;
      ctx.stopHero();
      fallen.style.display = 'grid';
    }
  }
  function lastVigilFx(radius: number, stun: number) {
    for (const g of ghouls) {
      if (g.state === 'dead') continue;
      tmp2.subVectors(g.root.position, ctx.hero.position).setY(0);
      if (tmp2.length() <= radius) { g.knock.copy(tmp2).normalize().multiplyScalar(1.0 / 0.12); stunGhoul(g, stun); g.flash = 0.1; }
    }
    waveT = 1.0;
    wave.visible = true;
    waveMat.color.setRGB(1.8, 0.9, 0.4);
    hitstop = 0.12;
    shake = 0.35;
    tmp.copy(ctx.hero.position).setY(1.4);
    sparks.emit(tmp, 60, 7, 4, 0.7);
    tmp.y = 3.3;
    popNumber(tmp, '마지막 파수!', 'lvl');
    sfx.vigil();
  }
  function respawn(g: Ghoul) {
    if (g.ember) { scene.remove(g.ember); g.ember.material.dispose(); embers.splice(embers.indexOf(g.ember), 1); g.ember = null; }
    g.root.position.copy(g.home);
    g.root.visible = true;
    g.hp = GHOUL_HP;
    g.state = 'idle';
    g.deathT = 0;
    g.wanderT = 0;
    g.knock.set(0, 0, 0);
    g.stun = 0; g.slowT = 0; g.weakT = 0; g.burnT = 0; g.stars.visible = false;
    for (const m of [g.mats.front, g.mats.back]) { m.opacity = 1; m.transparent = false; }
    g.shadow.scale.setScalar(1);
  }
  /** Gold shock-wave, glow and floating text at the hero. */
  const waveMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.15, 0.4), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const wave = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.0, 48).rotateX(-Math.PI / 2), waveMat);
  wave.visible = false;
  scene.add(wave);
  const waveGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: new THREE.Color(1.4, 1.0, 0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
  scene.add(waveGlow);
  let waveT = 0;
  function levelUpFx() {
    waveT = 1.0;
    wave.visible = true;
    waveMat.color.setRGB(1.6, 1.15, 0.4);
    tmp.copy(ctx.hero.position).setY(3.3);
    popNumber(tmp, '레벨 업!', 'lvl');
    sfx.levelUp();
    drawOrbs();
  }
  function setGhoulView(g: Ghoul, dir: THREE.Vector3) {
    const sx = dir.dot(ctx.screenRight), sy = dir.dot(ctx.screenDown);
    if (Math.abs(sy) > 0.15) g.view = sy > 0 ? 'front' : 'back';
    if (Math.abs(sx) > 0.15) g.faceRight = sx > 0;
  }
  const RIGHT = new THREE.Vector3();

  function updateGhoul(g: Ghoul, dt: number) {
    const heroPos = ctx.hero.position;
    if (g.state === 'dead') {
      // crumble: fade, sink and shrink, shed ash, leave an ember
      g.deathT += dt;
      const k = Math.min(1, g.deathT / 0.8);
      g.mesh.material.opacity = 1 - k;
      g.mesh.material.transparent = true;
      g.mesh.scale.y = (1 - 0.6 * k) * GHOUL_H;
      g.shadow.scale.setScalar(1 - k);
      if (g.deathT < 0.8 && Math.random() < dt * 40) {
        tmp.copy(g.root.position).setY(rnd(0.2, GHOUL_H * (1 - k)));
        ashBurst.emit(tmp, 3, 0.8, 0.9, 1.4);
      }
      if (g.deathT >= 0.8 && g.root.visible) {
        g.root.visible = false;
        const e = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: new THREE.Color(1.5, 0.5, 0.12), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        e.position.copy(g.root.position).setY(0.12);
        e.scale.set(0.45, 0.45, 1);
        e.userData.phase = Math.random() * 10;
        scene.add(e);
        embers.push(e);
        g.ember = e;
      }
      // come back after a while, unseen: only when the hero is far from the spawn spot
      if (!g.root.visible) {
        g.respawnT -= dt;
        if (g.respawnT <= 0 && heroPos.distanceTo(g.home) >= RESPAWN_MIN_DIST) respawn(g);
      }
      return;
    }
    const toHero = tmp.subVectors(heroPos, g.root.position).setY(0);
    const dist = toHero.length();
    let move: THREE.Vector3 | null = null;
    let speed = 0;

    if (g.stagger > 0) g.stagger -= dt;
    // status effects
    if (g.slowT > 0) g.slowT -= dt;
    if (g.weakT > 0) g.weakT -= dt;
    if (g.burnT > 0) {
      g.burnT -= dt;
      g.burnTick -= dt;
      if (g.burnTick <= 0) { g.burnTick += STATUS_TICK; damageGhoul(g, g.burnDmg, { dot: true }); if ((g.state as string) === 'dead') return; }
      if (Math.random() < dt * 12) { tmp2.copy(g.root.position).setY(rnd(0.5, GHOUL_H)); sparks.emit(tmp2, 1, 0.6, 1.5, 0.5); }
    }
    g.stars.visible = g.stun > 0;
    if (g.stun > 0) {
      g.stun -= dt;
      g.stars.material.rotation = 0;
      g.stars.position.x = Math.sin(g.breathT * 6) * 0.08;
    }
    if (g.knock.lengthSq() > 0) {
      g.root.position.addScaledVector(g.knock, dt);
      g.knock.multiplyScalar(Math.max(0, 1 - dt / 0.12));
      if (g.knock.lengthSq() < 0.01) g.knock.set(0, 0, 0);
    }

    switch (g.state) {
      case 'idle':
        if (!dead && dist < GHOUL_SIGHT) { aggroGroup(g.group); break; }
        g.wanderT -= dt;
        if (g.wanderT <= 0) {
          g.wanderT = rnd(3, 6);
          g.wander.set(g.anchor.x + rnd(-2.5, 2.5), 0, g.anchor.z + rnd(-2.5, 2.5));
        }
        tmp2.subVectors(g.wander, g.root.position).setY(0);
        if (tmp2.length() > 0.3) { move = tmp2.clone().normalize(); speed = 0.8; }   // clone: tmp2 is reused below
        break;
      case 'chase':
        if (dead || dist > GHOUL_LEASH) { g.state = 'idle'; g.wanderT = 0; break; }
        if (g.stagger > 0 || g.stun > 0) break;
        if (dist > GHOUL_RANGE - 0.2) { move = toHero.clone().normalize(); speed = GHOUL_SPEED * (g.slowT > 0 ? 1 - g.slowMul : 1); }
        else { g.state = 'windup'; g.timer = GHOUL_WINDUP; setGhoulView(g, toHero); }
        break;
      case 'windup': {
        if (g.stun > 0) { g.state = 'chase'; g.tele.visible = false; break; }
        g.timer -= dt;
        const dir = toHero.clone().normalize();
        g.tele.visible = true;
        g.tele.position.set(g.root.position.x, 0.05, g.root.position.z);
        g.tele.rotation.y = -Math.atan2(dir.z, dir.x);
        g.tele.material.opacity = 0.12 + 0.5 * (1 - Math.max(0, g.timer) / GHOUL_WINDUP);
        if (g.timer <= 0) {
          g.tele.visible = false;
          g.lunge = 0.15;
          // the swing goes where the hero stood when it was decided; dodge by stepping out of the fan's reach
          if (!dead && dist <= GHOUL_RANGE + 0.45) hurtHero(irnd(GHOUL_DMG[0], GHOUL_DMG[1]) * (g.weakT > 0 ? 1 - g.weakMul : 1));
          g.state = 'recover';
          g.timer = GHOUL_RECOVER;
        }
        break;
      }
      case 'recover':
        g.timer -= dt;
        if (g.timer <= 0) g.state = dead ? 'idle' : 'chase';
        break;
    }

    // separation from other ghouls and from the hero
    for (const o of ghouls) {
      if (o === g || o.state === 'dead') continue;
      tmp2.subVectors(g.root.position, o.root.position).setY(0);
      const d = tmp2.length();
      if (d < 1.1 && d > 0.0001) g.root.position.addScaledVector(tmp2.normalize(), (1.1 - d) * 0.5);
    }
    tmp2.subVectors(g.root.position, heroPos).setY(0);
    const dh = tmp2.length();
    if (dh < 0.9 && dh > 0.0001 && !dead) g.root.position.addScaledVector(tmp2.normalize(), 0.9 - dh);

    let moved = 0;
    if (move) {
      moved = speed * dt;
      g.root.position.addScaledVector(move, moved);
      setGhoulView(g, move);
    } else if (g.state !== 'idle' && !dead) {
      setGhoulView(g, toHero);
    }
    const kk = 1 - Math.exp(-dt * 6);
    g.walk += ((move ? 1 : 0) - g.walk) * kk;
    if (moved > 0) g.phase += (moved / GHOUL_STRIDE) * Math.PI;
    g.breathT += dt;

    // look: material/frame, mirroring, breathing, wind-up lean and lunge
    applyLook(g, g.view);
    const mat = g.mats[g.view];
    g.mesh.material = mat;
    const sh = sheets[g.view], st = stills[g.view];
    const tex = g.texs[g.view];
    let aspect = 0.5;
    if (sh && tex) {
      const f = g.walk > 0.05 ? Math.floor((((g.phase / (Math.PI * 2)) % 1) + 1) % 1 * sh.frames) % sh.frames : sh.idle;
      tex.offset.x = f / sh.frames;
      aspect = sh.aspect;
    } else if (st) {
      aspect = st.aspect;
    }
    const breath = Math.sin(g.breathT * 2.2) * (1 - g.walk);
    const bob = sh ? 0 : Math.abs(Math.sin(g.phase)) * 0.08 * g.walk;      // fallback still: code bob
    const wind = g.state === 'windup' ? 1 - Math.max(0, g.timer) / GHOUL_WINDUP : 0;
    g.lunge = Math.max(0, g.lunge - dt);
    const lungeK = g.lunge > 0 ? Math.sin((g.lunge / 0.15) * Math.PI) : 0;
    const side = g.faceRight ? 1 : -1;
    g.mesh.scale.set(GHOUL_H * aspect * side, GHOUL_H * (1 + 0.015 * breath), 1);
    g.mesh.rotation.z = (sh ? 0 : Math.sin(g.phase) * 0.05 * g.walk) + side * (0.14 * wind - 0.12 * lungeK);
    g.mesh.position.set(side * (-0.18 * wind + 0.35 * lungeK), bob + 0.015 * breath, 0);
    const flashing = g.flash > 0;
    g.flash = Math.max(0, g.flash - dt);
    mat.emissiveIntensity = flashing ? 2.4 : 0.25;
    if (!flashing && g.burnT > 0) { mat.emissiveIntensity = 0.45 + 0.25 * Math.sin(g.breathT * 23); mat.emissive.setRGB(1, 0.55, 0.2); }   // burning flicker
    else if (!flashing && g.slowT > 0 && g.state !== 'windup') mat.emissive.setRGB(0.55, 0.5, 0.75);                                  // dread: cold and dim
    else if (flashing || g.state !== 'windup') mat.emissive.setRGB(1, 1, 1);
    else mat.emissive.setRGB(1, 0.75 - 0.35 * wind, 0.6 - 0.4 * wind);   // smoulders hotter while winding up
    if (g.state !== 'windup') g.tele.visible = false;
    g.shadow.scale.setScalar(1 - 0.03 * breath);
  }

  // ---------- public API ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pickGhoul(clientX: number, clientY: number, ground: THREE.Vector3 | null): Ghoul | null {
    ndc.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const alive = ghouls.filter((g) => g.state !== 'dead');
    const hit = raycaster.intersectObjects(alive.map((g) => g.mesh), false)[0];
    if (hit) {
      // reject clicks on the transparent margin of the quad unless close to the body's axis
      const g = alive.find((x) => x.mesh === hit.object)!;
      const uv = hit.uv;
      if (!uv || Math.abs(uv.x - 0.5) < 0.38) return g;
    }
    if (ground) {
      let best: Ghoul | null = null, bd = 1.1;
      for (const g of alive) { const d = g.root.position.distanceTo(ground); if (d < bd) { bd = d; best = g; } }
      return best;
    }
    return null;
  }

  function update(dt: number, realDt: number) {
    // hero: approach, stop, swing
    if (!dead && target && target.state !== 'dead') {
      const to = tmp.subVectors(target.root.position, ctx.hero.position).setY(0);
      const d = to.length();
      if (swingT < 0 && d > HERO_RANGE) {
        ctx.moveHeroTo(target.root.position);
      } else {
        ctx.stopHero();
        if (d > 0.001) ctx.faceHero(to.clone().normalize());
        swingCd -= dt;
        if (swingT < 0 && swingCd <= 0 && lockT <= 0 && d <= HERO_RANGE + 0.1) {
          swingT = 0;
          swingCd = player.derived().period;
          swingResolved = false;
          swingDir.copy(to).normalize();
          sfx.swing();
          slashT = 0.15;
          slash.visible = true;
        }
      }
    } else if (target && target.state === 'dead') {
      target = null;
    }
    if (swingT >= 0) {
      swingT += dt;
      // dash: forward 0.25 and back over the swing's first 0.3 s
      const k = Math.min(1, swingT / 0.3);
      ctx.heroPivot.position.copy(swingDir).multiplyScalar(0.25 * Math.sin(k * Math.PI));
      if (!swingResolved && swingT >= SWING_IMPACT) {
        swingResolved = true;
        if (target && target.state !== 'dead' && target.root.position.distanceTo(ctx.hero.position) <= HERO_RANGE + 0.5) hurtGhoul(target, swingDir);
      }
      if (swingT >= 0.3) { swingT = -1; ctx.heroPivot.position.set(0, 0, 0); }
    } else {
      swingCd -= target ? 0 : dt;
    }
    if (slashT > 0) {
      slashT -= realDt;
      const k = 1 - Math.max(0, slashT) / 0.15;
      slash.position.copy(ctx.hero.position).addScaledVector(swingDir, 1.0).setY(1.35);
      RIGHT.copy(swingDir);
      const sx = RIGHT.dot(ctx.screenRight), sy = -RIGHT.dot(ctx.screenDown);
      slashMat.rotation = Math.atan2(sy, sx) - Math.PI / 2;
      slash.scale.setScalar(2.1 + 0.6 * k);
      slashMat.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI);
      if (slashT <= 0) slash.visible = false;
    }

    for (const g of ghouls) updateGhoul(g, dt);
    sparks.update(dt);
    ashBurst.update(dt);
    const now = performance.now() * 0.001;
    for (const e of embers) {
      const f = 0.75 + 0.25 * Math.sin(now * 5 + e.userData.phase) * Math.sin(now * 3.1 + e.userData.phase);
      e.material.opacity = f;
      e.scale.setScalar(0.4 + 0.1 * f);
    }

    // DOM: numbers and bars
    for (const n of nums) {
      if (n.t <= 0) continue;
      n.t -= realDt;
      if (n.t <= 0) { n.el.style.display = 'none'; continue; }
      const [x, y] = toScreen(n.pos);
      const life = n.el.classList.contains('lvl') ? 1.6 : n.el.classList.contains('crit') ? 1.0 : 0.8;
      const age = 1 - n.t / life;
      n.el.style.transform = `translate(${x + n.dx * age - 10}px, ${y - 46 * age - 10}px) scale(${age < 0.1 ? 1.4 - age * 4 : 1})`;
      n.el.style.opacity = `${Math.min(1, n.t / 0.25)}`;
    }
    for (const g of ghouls) {
      if (g.state === 'dead') continue;
      g.barT -= realDt;
      if (g.barT <= 0) { g.bar.style.display = 'none'; continue; }
      tmp2.copy(g.root.position).setY(GHOUL_H + 0.35);
      const [x, y] = toScreen(tmp2);
      g.bar.style.display = 'block';
      g.bar.style.transform = `translate(${x - 32}px, ${y}px)`;
      g.barFill.style.width = `${Math.max(0, Math.min(100, (g.hp / GHOUL_HP) * 100))}%`;
    }

    lockT = Math.max(0, lockT - dt);
    invulnT = Math.max(0, invulnT - dt);
    // regeneration
    if (!dead) {
      const d = player.derived();
      if (d.hpRegen) player.hp = Math.min(d.maxHp, player.hp + d.hpRegen * dt);
      if (d.mpRegen) player.mp = Math.min(d.maxMp, player.mp + d.mpRegen * dt);
      drawOrbs();
    }
    // level-up wave
    if (waveT > 0) {
      waveT = Math.max(0, waveT - realDt);
      const k = 1 - waveT;
      wave.position.copy(ctx.hero.position).setY(0.06);
      wave.scale.setScalar(0.5 + k * 4.5);
      waveMat.opacity = Math.sin(Math.min(1, k * 1.3) * Math.PI) * 0.9;
      waveGlow.position.copy(ctx.hero.position).setY(1.4);
      waveGlow.scale.setScalar(2 + k * 3);
      waveGlow.material.opacity = (1 - k) * 0.8;
      if (waveT <= 0) wave.visible = false;
    }
    // screen feedback
    vignetteT = Math.max(0, vignetteT - realDt);
    vignette.style.opacity = `${vignetteT / 0.35}`;
    shake *= Math.exp(-realDt * 14);
    shakeOffset.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(shake);

    if (dead) {
      deadT -= realDt;
      if (deadT <= 0) {
        dead = false;
        const d = player.derived();
        player.hp = d.maxHp;
        player.mp = d.maxMp;
        drawOrbs();
        fallen.style.display = 'none';
        ctx.hero.position.copy(ctx.heroStart);
        ctx.stopHero();
        for (const g of ghouls) if (g.state !== 'dead') { g.state = 'idle'; g.wanderT = 0; g.tele.visible = false; }
      }
    }
  }

  return {
    /** Real-time step -> scaled step (hit-stop freezes the world for ~60 ms). */
    timeScale(realDt: number) {
      if (hitstop > 0) { hitstop -= realDt; return 0.04; }
      return 1;
    },
    update,
    shakeOffset,
    pickGhoul,
    setTarget(g: Ghoul | null) { if (!dead) target = g; if (!g) { swingT = -1; ctx.heroPivot.position.set(0, 0, 0); } },
    hasTarget() { return target !== null; },
    isDead() { return dead; },
    /** Drink one potion of this kind from the bag (skill bar 5/6, right click). */
    drinkPotion(kind: 'potion_hp' | 'potion_mp' = 'potion_hp') {
      if (dead) return false;
      const hp0 = player.hp, mp0 = player.mp;
      if (!player.drink(kind)) return false;
      sfx.potion();
      drawOrbs();
      tmp.copy(ctx.hero.position).setY(2.9);
      popNumber(tmp, kind === 'potion_hp' ? `+${Math.round(player.hp - hp0)}` : `+${Math.round(player.mp - mp0)} 마나`, '');
      return true;
    },
    levelUpFx,
    /** Movement and swings pause while a skill's cast animation plays. */
    isLocked: () => lockT > 0,
    /** Interface for skills.ts. */
    world: {
      alive: () => ghouls.filter((g) => g.state !== 'dead'),
      posOf: (g: Ghoul) => g.root.position,
      damage: (g: Ghoul, raw: number, o?: HitOpts) => damageGhoul(g, raw, o),
      stun: (g: Ghoul, t: number) => stunGhoul(g, t),
      slow: (g: Ghoul, t: number, mul: number) => { g.slowT = Math.max(g.slowT, t); g.slowMul = mul; },
      weaken: (g: Ghoul, t: number, mul: number) => { g.weakT = Math.max(g.weakT, t); g.weakMul = mul; },
      burn: (g: Ghoul, t: number, perTick: number) => { if (g.burnT <= 0) g.burnTick = STATUS_TICK; g.burnT = t; g.burnDmg = perTick; },
      status: (g: Ghoul) => ({ stun: g.stun, slowT: g.slowT, slowMul: g.slowMul, weakT: g.weakT, weakMul: g.weakMul, burnT: g.burnT, burnDmg: g.burnDmg }),
      weaponRoll, spellRoll, critRoll,
      sparks: (at: THREE.Vector3, n: number, speed: number, up: number, life: number) => sparks.emit(at, n, speed, up, life),
      ash: (at: THREE.Vector3, n: number, speed: number, up: number, life: number) => ashBurst.emit(at, n, speed, up, life),
      shake: (v: number) => { shake = Math.max(shake, v); },
      hitstop: (v: number) => { hitstop = Math.max(hitstop, v); },
      lock: (t: number) => { lockT = Math.max(lockT, t); },
      invuln: (t: number) => { invulnT = Math.max(invulnT, t); },
      armor: (until: number, absorb: number) => { armorUntil = until; armorAbsorb = absorb; },
      armorLeft: () => Math.max(0, (armorUntil - performance.now()) / 1000),
      vigilLeft: () => Math.max(0, (vigilReadyAt - performance.now()) / 1000),
      isDead: () => dead,
      faceToward: (dir: THREE.Vector3) => ctx.faceHero(dir),
      stopHero: () => ctx.stopHero(),
      clearTarget: () => { target = null; swingT = -1; ctx.heroPivot.position.set(0, 0, 0); },
      drawOrbs,
    },
    debug: {
      ghouls,
      get hp() { return player.hp; },
      get lastHit() { return lastHit; },
      /** Test hook: bring every dead ghoul back now, wherever the hero is. */
      respawnAll() { for (const g of ghouls) if (g.state === 'dead') respawn(g); },
      /** Test hook: a monster hit of this raw size on the hero. */
      hurt: (raw: number) => hurtHero(raw),
      get target() { return target ? ghouls.indexOf(target) : -1; },
      screenOf(i: number) { const g = ghouls[i]; tmp2.copy(g.root.position).setY(GHOUL_H * 0.5); return toScreen(tmp2); },
    },
  };
}
