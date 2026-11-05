// Skill casting and effects (M2-b). Numbers come from SKILLS in data/balance.ts.
// All visuals are pooled sprites/meshes made up front (no lights are added, so
// no material ever has to recompile mid-fight).
import * as THREE from 'three';
import { sfx } from './audio';
import { SKILLS, SKILL_RULES, type SkillDef, type SkillId } from './data/balance';
import type { setupCombat } from './combat';
import { player } from './stats';

type World = ReturnType<typeof setupCombat>['world'];
type Ghoul = ReturnType<World['alive']>[number];

export interface SkillsCtx {
  scene: THREE.Scene;
  world: World;
  hero: THREE.Group;
  glowTex: THREE.Texture;
  screenRight: THREE.Vector3;
  screenDown: THREE.Vector3;
  floorHalf: number;
}
export type CastResult = 'ok' | 'cooldown' | 'mana' | 'unlearned' | 'passive' | 'dead';
export interface CastRecord { id: SkillId; level: number; mp: number; cd: number; radius?: number; mult?: number; hits: number[]; targets: number; t: number }

const DEF = new Map(SKILLS.map((s) => [s.id, s]));
export const skillDef = (id: SkillId) => DEF.get(id)!;
const val = (arr: number[] | undefined, lv: number) => (arr ? arr[Math.max(0, Math.min(arr.length - 1, lv - 1))] : 0);

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  draw(cv.getContext('2d')!);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function setupSkills(ctx: SkillsCtx) {
  const { scene, world } = ctx;
  let now = 0;
  const readyAt = new Map<SkillId, number>();
  const log: CastRecord[] = [];
  const v = new THREE.Vector3(), v2 = new THREE.Vector3();

  // ---------------- textures ----------------
  const crescent = canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 150, 40, 128, 128, 124);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.55, 'rgba(255,245,225,1)');
    g.addColorStop(0.82, 'rgba(255,140,40,0.9)'); g.addColorStop(1, 'rgba(180,50,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(128, 128, 124, Math.PI * 0.95, Math.PI * 2.05); c.arc(128, 170, 100, Math.PI * 2.0, Math.PI * 1.0, true); c.closePath(); c.fill();
  });
  const swirl = canvasTex(256, 256, (c) => {
    c.translate(128, 128);
    for (let i = 0; i < 3; i++) {
      c.rotate((Math.PI * 2) / 3);
      const g = c.createLinearGradient(0, -120, 0, -60);
      g.addColorStop(0, 'rgba(255,200,140,0.9)'); g.addColorStop(1, 'rgba(120,110,100,0)');
      c.strokeStyle = g; c.lineWidth = 14; c.beginPath(); c.arc(0, 0, 100, -Math.PI / 2, Math.PI * 0.2); c.stroke();
    }
  });
  const disk = canvasTex(256, 256, (c) => {
    const g = c.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,200,90,0.9)'); g.addColorStop(0.6, 'rgba(255,90,20,0.55)'); g.addColorStop(0.92, 'rgba(255,60,10,0.8)'); g.addColorStop(1, 'rgba(255,60,10,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  });
  const add = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 0) =>
    new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity, fog: false });

  // ---------------- pools ----------------
  const arcs = [0, 1, 2, 3].map(() => { const s = new THREE.Sprite(add(crescent, 0xffffff)); s.visible = false; scene.add(s); return { s, t: 0, life: 0.18 }; });
  const whirlMat = new THREE.MeshBasicMaterial({ map: swirl, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
  const whirlMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), whirlMat);
  whirlMesh.visible = false; scene.add(whirlMesh);
  const streaks = [0, 1, 2, 3, 4].map(() => { const s = new THREE.Sprite(add(ctx.glowTex, new THREE.Color(1.2, 0.9, 0.6))); s.visible = false; scene.add(s); return { s, t: 0 }; });
  const bolts = Array.from({ length: 8 }, () => { const s = new THREE.Sprite(add(ctx.glowTex, new THREE.Color(2, 0.8, 0.25), 1)); s.scale.set(0.7, 0.7, 1); s.visible = false; scene.add(s); return { s, dir: new THREE.Vector3(), dist: 0, lv: 0, live: false, rec: null as CastRecord | null }; });
  const flashes = [0, 1, 2, 3].map(() => { const s = new THREE.Sprite(add(ctx.glowTex, new THREE.Color(2, 0.9, 0.35))); s.visible = false; scene.add(s); return { s, t: 0 }; });
  const ringMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.6, 0.15), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
  const rings = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64).rotateX(-Math.PI / 2), ringMat()); m.visible = false; scene.add(m); return { m, t: 0, r: 0, lv: 0, hit: new Set<Ghoul>(), live: false, rec: null as CastRecord | null }; });
  const patches = [0, 1, 2].map(() => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: disk, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    m.visible = false; scene.add(m);
    const flames = [0, 1, 2, 3, 4, 5].map(() => { const s = new THREE.Sprite(add(ctx.glowTex, new THREE.Color(2, 0.7, 0.2))); s.visible = false; scene.add(s); return s; });
    return { m, flames, t: 0, dur: 0, r: 0, tick: 0, lv: 0, live: false, at: new THREE.Vector3(), rec: null as CastRecord | null };
  });
  const aura = Array.from({ length: 10 }, (_, i) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.glowTex, color: 0x8a8278, transparent: true, depthWrite: false, opacity: 0 })); s.scale.setScalar(0.35); s.visible = false; scene.add(s); return { s, a: (i / 10) * Math.PI * 2, h: 0.4 + (i % 5) * 0.45 }; });
  const dreadMat = new THREE.MeshBasicMaterial({ color: 0x150a1c, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide });
  const dreadRing = new THREE.Mesh(new THREE.RingGeometry(0.7, 1, 64).rotateX(-Math.PI / 2), dreadMat);
  dreadRing.visible = false; scene.add(dreadRing);
  let whirl: { t: number; hits: number; lv: number; rec: CastRecord } | null = null;
  let charge: { t: number; from: THREE.Vector3; to: THREE.Vector3; lv: number; hit: Set<Ghoul>; rec: CastRecord } | null = null;
  let dreadT = 0, dreadR = 0;

  // ---------------- helpers ----------------
  const heroPos = () => ctx.hero.position;
  function screenAngle(dir: THREE.Vector3) {
    return Math.atan2(-dir.dot(ctx.screenDown), dir.dot(ctx.screenRight));
  }
  function spawnArc(at: THREE.Vector3, dir: THREE.Vector3, scale: number) {
    const a = arcs.find((x) => !x.s.visible) ?? arcs[0];
    a.s.position.copy(at).setY(1.3);
    a.s.material.rotation = screenAngle(dir) - Math.PI / 2;
    a.s.scale.setScalar(scale);
    a.s.visible = true;
    a.t = 0;
  }
  function flashAt(at: THREE.Vector3, size: number) {
    const f = flashes.find((x) => !x.s.visible) ?? flashes[0];
    f.s.position.copy(at).setY(0.8);
    f.s.scale.setScalar(size);
    f.s.visible = true;
    f.t = 0;
  }
  const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

  // ---------------- casting ----------------
  function cast(id: SkillId, aim: THREE.Vector3, dirIn: THREE.Vector3): CastResult {
    const def = skillDef(id), lv = player.skillLevel(id);
    if (world.isDead()) return 'dead';
    if (def.passive) return 'passive';
    if (lv < 1) return 'unlearned';
    if (now < (readyAt.get(id) ?? 0)) return 'cooldown';
    const mp = val(def.mp, lv);
    if (player.mp < mp) return 'mana';
    player.mp -= mp;
    world.drawOrbs();
    const cd = val(def.cd, lv);
    readyAt.set(id, now + cd);
    const dir = dirIn.clone().setY(0);
    if (dir.lengthSq() < 1e-6) dir.set(1, 0, 0);
    dir.normalize();
    world.lock(SKILL_RULES.castLock);
    const rec: CastRecord = { id, level: lv, mp, cd, radius: val(def.radius, lv) || undefined, mult: val(def.mult, lv) || undefined, hits: [], targets: 0, t: now };
    log.push(rec);
    if (log.length > 60) log.shift();
    effects[id](def, lv, aim, dir, rec);
    return 'ok';
  }

  const effects: Record<SkillId, (def: SkillDef, lv: number, aim: THREE.Vector3, dir: THREE.Vector3, rec: CastRecord) => void> = {
    ash_slash(def, lv, _aim, dir, rec) {
      world.faceToward(dir);
      const r = val(def.radius, lv), mult = val(def.mult, lv), crit = world.critRoll();
      for (const g of world.alive()) {
        v.subVectors(world.posOf(g), heroPos()).setY(0);
        const d = v.length();
        if (d <= r && (d < 0.3 || v.normalize().dot(dir) >= Math.cos(Math.PI / 3))) {
          rec.hits.push(world.damage(g, world.weaponRoll() * mult, { crit, dir: v, knock: 0.35 }));
        }
      }
      rec.targets = rec.hits.length;
      spawnArc(v2.copy(heroPos()).addScaledVector(dir, 1.1), dir, 3.6);
      sfx.slashSkill();
    },
    whirl_cleave(_def, lv, _aim, _dir, rec) {
      whirl = { t: 0, hits: 0, lv, rec };
      whirlMesh.visible = true;
      sfx.whirl();
    },
    wardens_charge(def, lv, _aim, dir, rec) {
      world.faceToward(dir);
      world.clearTarget();
      world.stopHero();
      const lim = ctx.floorHalf - 1;
      const to = heroPos().clone().addScaledVector(dir, val(def.radius, lv));
      to.x = THREE.MathUtils.clamp(to.x, -lim, lim);
      to.z = THREE.MathUtils.clamp(to.z, -lim, lim);
      charge = { t: 0, from: heroPos().clone(), to, lv, hit: new Set(), rec };
      world.invuln(0.4);
      sfx.charge();
    },
    ember_throw(_def, lv, _aim, dir, rec) {
      world.faceToward(dir);
      const b = bolts.find((x) => !x.live) ?? bolts[0];
      b.live = true; b.lv = lv; b.dist = 0; b.rec = rec;
      b.dir.copy(dir);
      b.s.position.copy(heroPos()).addScaledVector(dir, 0.6).setY(1.4);
      b.s.visible = true;
      sfx.emberCast();
    },
    burning_ring(_def, lv, _aim, _dir, rec) {
      const r = rings.find((x) => !x.live) ?? rings[0];
      r.live = true; r.t = 0; r.lv = lv; r.hit.clear(); r.rec = rec;
      r.m.position.copy(heroPos()).setY(0.08);
      r.m.visible = true;
      sfx.ring();
    },
    purging_flame(def, lv, aim, _dir, rec) {
      const p = patches.find((x) => !x.live) ?? patches[0];
      v.subVectors(aim, heroPos()).setY(0);
      if (v.length() > 12) v.setLength(12);                     // cast range
      p.at.copy(heroPos()).add(v).setY(0);
      p.live = true; p.t = 0; p.dur = val(def.dur, lv); p.r = val(def.radius, lv); p.tick = 0.25; p.lv = lv; p.rec = rec;
      rec.radius = p.r;
      p.m.position.copy(p.at).setY(0.07);
      p.m.scale.setScalar(p.r);
      p.m.visible = true;
      p.flames.forEach((f) => { f.visible = true; });
      sfx.purge();
    },
    ash_armor(def, lv) {
      const until = performance.now() + val(def.dur, lv) * 1000;
      player.buffDef = val(def.extra, lv);
      player.buffDefUntil = until;
      world.armor(until, val(def.extra2, lv));
      player.emit('buff');
      aura.forEach((a) => { a.s.visible = true; });
      sfx.armor();
    },
    dread(def, lv, _aim, _dir, rec) {
      const r = val(def.radius, lv), t = val(def.dur, lv);
      for (const g of world.alive()) {
        if (flat(world.posOf(g), heroPos()) <= r) { world.slow(g, t, val(def.extra, lv)); world.weaken(g, t, val(def.extra2, lv)); rec.targets++; }
      }
      dreadT = 0.7; dreadR = r;
      dreadRing.visible = true;
      world.shake(0.08);
      sfx.dread();
    },
    last_vigil() { /* passive: handled in combat.ts when a killing blow lands */ },
  };

  // ---------------- per-frame ----------------
  function update(dt: number) {
    now += dt;
    for (const a of arcs) {
      if (!a.s.visible) continue;
      a.t += dt;
      const k = a.t / a.life;
      a.s.material.opacity = Math.sin(Math.min(1, k * 1.2) * Math.PI);
      if (k >= 1) a.s.visible = false;
    }
    for (const f of flashes) {
      if (!f.s.visible) continue;
      f.t += dt;
      f.s.material.opacity = Math.max(0, 1 - f.t / 0.25);
      if (f.t >= 0.25) f.s.visible = false;
    }
    // whirl: 3 hits 0.25 s apart, spinning swirl decal and arcs
    if (whirl) {
      const def = skillDef('whirl_cleave');
      whirl.t += dt;
      whirlMesh.position.copy(heroPos()).setY(0.1);
      whirlMesh.scale.setScalar(val(def.radius, whirl.lv));
      whirlMesh.rotation.y -= dt * 18;
      whirlMat.opacity = 0.9;
      while (whirl.hits < 3 && whirl.t >= whirl.hits * 0.25) {
        const r = val(def.radius, whirl.lv), mult = val(def.mult, whirl.lv);
        for (const g of world.alive()) {
          v.subVectors(world.posOf(g), heroPos()).setY(0);
          if (v.length() <= r) whirl.rec.hits.push(world.damage(g, world.weaponRoll() * mult, { crit: world.critRoll(), dir: v.clone(), knock: 0.15, feel: 0.6 }));
        }
        const ang = whirl.hits * 2.1;
        spawnArc(v2.copy(heroPos()).add(new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)).multiplyScalar(1.2)), new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang)), 3);
        whirl.hits++;
      }
      if (whirl.t > 0.65) { whirl.rec.targets = new Set(whirl.rec.hits).size; whirl = null; whirlMesh.visible = false; whirlMat.opacity = 0; }
    }
    // charge: 0.3 s dash; hit everyone near the path once
    if (charge) {
      const def = skillDef('wardens_charge');
      charge.t += dt;
      const k = Math.min(1, charge.t / 0.3);
      ctx.hero.position.lerpVectors(charge.from, charge.to, k);
      world.ash(v.copy(heroPos()).setY(0.2), 2, 1.2, 0.6, 0.6);
      const st = streaks[Math.floor(charge.t / 0.06) % streaks.length];
      if (!st.s.visible) { st.s.visible = true; st.t = 0; st.s.position.copy(heroPos()).setY(1.2); st.s.scale.set(1.2, 2.2, 1); }
      for (const g of world.alive()) {
        if (charge.hit.has(g) || flat(world.posOf(g), heroPos()) > 1.3) continue;
        charge.hit.add(g);
        v.subVectors(charge.to, charge.from).setY(0).normalize();
        charge.rec.hits.push(world.damage(g, world.weaponRoll() * val(def.mult, charge.lv), { crit: world.critRoll(), dir: v.clone(), knock: 0.4, stun: val(def.dur, charge.lv) }));
      }
      if (k >= 1) { charge.rec.targets = charge.hit.size; charge = null; world.shake(0.12); }
    }
    for (const s of streaks) {
      if (!s.s.visible) continue;
      s.t += dt;
      s.s.material.opacity = Math.max(0, 0.6 - s.t * 2);
      if (s.t > 0.3) s.s.visible = false;
    }
    // ember bolts
    for (const b of bolts) {
      if (!b.live) continue;
      const step = 14 * dt;
      b.s.position.addScaledVector(b.dir, step);
      b.dist += step;
      b.s.material.opacity = 0.85 + 0.15 * Math.sin(now * 40);
      if (Math.random() < 0.7) world.sparks(b.s.position, 1, 0.4, 0.4, 0.3);
      let hit: Ghoul | null = null;
      for (const g of world.alive()) if (flat(world.posOf(g), b.s.position) < 0.75) { hit = g; break; }
      if (hit || b.dist >= 10) {
        b.live = false; b.s.visible = false;
        const def = skillDef('ember_throw');
        if (hit) {
          const base = world.spellRoll() * val(def.mult, b.lv), crit = world.critRoll();
          b.rec!.hits.push(world.damage(hit, base, { crit, dir: b.dir, knock: 0.25 }));
          for (const g of world.alive()) if (g !== hit && flat(world.posOf(g), b.s.position) <= val(def.radius, b.lv)) b.rec!.hits.push(world.damage(g, base * 0.5, { dir: v.subVectors(world.posOf(g), b.s.position).clone(), knock: 0.2, feel: 0.4 }));
          b.rec!.targets = b.rec!.hits.length;
        }
        flashAt(b.s.position, hit ? 2.4 : 1.2);
        world.sparks(b.s.position, hit ? 22 : 8, 4, 2.5, 0.5);
        sfx.explode();
      }
    }
    // burning rings: expand to the radius over 0.35 s, hit each ghoul once as it passes
    for (const r of rings) {
      if (!r.live) continue;
      const def = skillDef('burning_ring');
      r.t += dt;
      const R = val(def.radius, r.lv), k = Math.min(1, r.t / 0.35);
      r.r = Math.max(0.3, R * k);
      r.m.scale.setScalar(r.r);
      r.m.material.opacity = k < 1 ? 1 : Math.max(0, 1 - (r.t - 0.35) / 0.3);
      for (const g of world.alive()) {
        if (r.hit.has(g) || flat(world.posOf(g), r.m.position) > r.r) continue;
        r.hit.add(g);
        v.subVectors(world.posOf(g), r.m.position).setY(0);
        r.rec!.hits.push(world.damage(g, world.spellRoll() * val(def.mult, r.lv), { crit: world.critRoll(), dir: v.clone(), knock: 0.2, feel: 0.6 }));
        world.burn(g, val(def.dur, r.lv), world.spellRoll() * val(def.tick, r.lv));
      }
      if (Math.random() < 0.8) { const a = Math.random() * Math.PI * 2; world.sparks(v.set(r.m.position.x + Math.cos(a) * r.r, 0.2, r.m.position.z + Math.sin(a) * r.r), 1, 0.5, 1.5, 0.4); }
      if (r.t > 0.65) { r.live = false; r.m.visible = false; r.rec!.targets = r.hit.size; }
    }
    // purging flame patches: tick every 0.5 s while it lasts
    for (const p of patches) {
      if (!p.live) continue;
      const def = skillDef('purging_flame');
      p.t += dt;
      p.tick -= dt;
      const fade = Math.min(1, p.t / 0.2) * Math.min(1, (p.dur - p.t) / 0.4);
      p.m.material.opacity = 0.75 * fade;
      p.flames.forEach((f, i) => {
        const a = (i / p.flames.length) * Math.PI * 2 + p.t * 0.6, rr = p.r * (i % 2 ? 0.35 : 0.7);
        f.position.set(p.at.x + Math.cos(a) * rr, 0.9 + 0.2 * Math.sin(now * 9 + i), p.at.z + Math.sin(a) * rr);
        f.scale.set(0.7, 2.2 + 0.5 * Math.sin(now * 11 + i * 2), 1);
        f.material.opacity = fade * (0.7 + 0.3 * Math.sin(now * 17 + i));
      });
      if (p.tick <= 0 && p.t < p.dur) {
        p.tick += 0.5;
        for (const g of world.alive()) if (flat(world.posOf(g), p.at) <= p.r) p.rec!.hits.push(world.damage(g, world.spellRoll() * val(def.mult, p.lv), { dot: true }));
        p.rec!.targets = p.rec!.hits.length;
      }
      if (p.t >= p.dur) { p.live = false; p.m.visible = false; p.flames.forEach((f) => { f.visible = false; }); }
    }
    // ash armour aura
    const armorLeft = world.armorLeft();
    for (const a of aura) {
      a.s.visible = armorLeft > 0;
      if (!a.s.visible) continue;
      a.a += dt * 2.4;
      a.s.position.set(heroPos().x + Math.cos(a.a) * 0.9, a.h + 0.15 * Math.sin(now * 3 + a.a), heroPos().z + Math.sin(a.a) * 0.9);
      a.s.material.opacity = Math.min(0.75, armorLeft) * (0.6 + 0.4 * Math.sin(now * 5 + a.h));
    }
    if (armorLeft <= 0 && player.buffDefUntil && performance.now() >= player.buffDefUntil) { player.buffDefUntil = 0; player.emit('buff'); }
    // dread wave
    if (dreadT > 0) {
      dreadT -= dt;
      const k = 1 - dreadT / 0.7;
      dreadRing.position.copy(heroPos()).setY(0.09);
      dreadRing.scale.setScalar(0.5 + dreadR * k);
      dreadMat.opacity = 0.85 * (1 - k);
      if (dreadT <= 0) dreadRing.visible = false;
    }
  }

  return {
    cast,
    update,
    cdLeft: (id: SkillId) => Math.max(0, (readyAt.get(id) ?? 0) - now),
    cdTotal: (id: SkillId) => val(skillDef(id).cd, Math.max(1, player.skillLevel(id))),
    isCharging: () => charge !== null,
    log,
  };
}
