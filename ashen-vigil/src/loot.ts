// Ground loot: icons that pop out of a kill and land, name labels (hover or
// hold Alt), light beams for rare and better, click-to-walk-and-pick-up, and
// gold that is picked up just by walking over it.
import * as THREE from 'three';
import { sfx } from './audio';
import { baseOf, RARITY_COLOR, type Drop, type Item } from './items';
import { player } from './stats';
import { toast } from './ui';

export interface LootCtx {
  scene: THREE.Scene;
  camera: THREE.Camera;
  texLoader: THREE.TextureLoader;
  glowTex: THREE.Texture;
  hero: THREE.Group;
  moveHeroTo(p: THREE.Vector3): void;
  stopHero(): void;
}

interface Ground {
  id: number;
  drop: Drop;
  sprite: THREE.Sprite;
  beam: THREE.Sprite | null;
  label: HTMLDivElement;
  from: THREE.Vector3; to: THREE.Vector3; t: number; h: number;
  landed: boolean;
}

const PICK_RANGE = 1.2;
const GOLD_RANGE = 1.0;
const CELL = 0.42;                      // world units per inventory cell for the ground icon

export function setupLoot(ctx: LootCtx) {
  const { scene, camera } = ctx;
  const style = document.createElement('style');
  style.textContent = `
  .loot-label { position: fixed; left: 0; top: 0; padding: 1px 6px; z-index: 3; white-space: nowrap; cursor: pointer;
    background: rgba(8, 6, 5, 0.82); border: 1px solid rgba(255,255,255,0.08); font: 600 12px/1.5 system-ui, sans-serif;
    text-shadow: 0 1px 1px #000; display: none; user-select: none; }
  .loot-label:hover { border-color: #e8873a; }
  `;
  document.head.appendChild(style);

  const icons = new Map<string, THREE.Texture>();
  const iconTex = (name: string) => {
    let t = icons.get(name);
    if (!t) {
      t = ctx.texLoader.load(`assets/icons/${name}.png`);
      t.colorSpace = THREE.SRGBColorSpace;
      icons.set(name, t);
    }
    return t;
  };
  const coinTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d')!;
    for (const [x, y] of [[24, 40], [38, 36], [30, 28]]) {
      const g = c.createRadialGradient(x - 3, y - 3, 1, x, y, 11);
      g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#e0a830'); g.addColorStop(1, '#7a4a10');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 11, 0, Math.PI * 2); c.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const beamTex = (() => {
    const cv = document.createElement('canvas');
    cv.width = 32; cv.height = 256;
    const c = cv.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    c.fillStyle = g; c.fillRect(0, 0, 32, 256);
    const h = c.createLinearGradient(0, 0, 32, 0);
    h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
    c.globalCompositeOperation = 'destination-out'; c.fillStyle = h; c.fillRect(0, 0, 32, 256);
    return new THREE.CanvasTexture(cv);
  })();
  // A fixed pool of lights for rare+ drops: adding lights at runtime would
  // force every lit material to recompile.
  const lights = [0, 1].map(() => { const l = new THREE.PointLight(0xffd070, 0, 4, 2); scene.add(l); return l; });

  const items: Ground[] = [];
  let nextId = 1;
  let target: Ground | null = null;
  let altHeld = false;
  let mouseX = -1000, mouseY = -1000;
  const log: { outcome: string; rarity?: string; name?: string; gold?: number }[] = [];
  window.addEventListener('keydown', (e) => { if (e.key === 'Alt') { altHeld = true; e.preventDefault(); } });
  window.addEventListener('keyup', (e) => { if (e.key === 'Alt') altHeld = false; });
  window.addEventListener('blur', () => { altHeld = false; });
  window.addEventListener('pointermove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });

  const v = new THREE.Vector3();
  const toScreen = (p: THREE.Vector3) => { v.copy(p).project(camera); return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight]; };

  function spawnOne(drop: Drop, at: THREE.Vector3, spread = true) {
    let tex: THREE.Texture, w = 0.55, h = 0.55, name: string, color: string;
    if (drop.kind === 'gold') {
      tex = coinTex; name = `금화 ${drop.amount}`; color = '#e8c860';
    } else {
      const b = baseOf(drop.item);
      tex = iconTex(b.icon);
      w = b.w * CELL; h = b.h * CELL;
      name = drop.item.name + (drop.item.qty && drop.item.qty > 1 ? ` x${drop.item.qty}` : '');
      color = RARITY_COLOR[drop.item.rarity];
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sprite.scale.set(w, h, 1);
    scene.add(sprite);
    const fancy = drop.kind === 'item' && (drop.item.rarity === 'rare' || drop.item.rarity === 'unique');
    let beam: THREE.Sprite | null = null;
    if (fancy && drop.kind === 'item') {
      beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: beamTex, color: new THREE.Color(RARITY_COLOR[drop.item.rarity]).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
      beam.scale.set(0.5, 4.5, 1);
      scene.add(beam);
    }
    const label = document.createElement('div');
    label.className = 'loot-label';
    label.textContent = name;
    label.style.color = color;
    document.body.appendChild(label);
    const ang = Math.random() * Math.PI * 2, r = spread ? 0.6 + Math.random() * 0.8 : 0.3;
    const g: Ground = {
      id: nextId++, drop, sprite, beam, label,
      from: at.clone().setY(0), to: new THREE.Vector3(at.x + Math.cos(ang) * r, 0, at.z + Math.sin(ang) * r),
      t: 0, h, landed: false,
    };
    label.addEventListener('pointerdown', (e) => { if (e.button === 0) { e.stopPropagation(); setTarget(g); } });
    items.push(g);
  }

  function remove(g: Ground) {
    scene.remove(g.sprite);
    g.sprite.material.dispose();
    if (g.beam) { scene.remove(g.beam); g.beam.material.dispose(); }
    g.label.remove();
    items.splice(items.indexOf(g), 1);
    if (target === g) target = null;
  }

  function pickUp(g: Ground) {
    if (g.drop.kind === 'gold') {
      player.gold += g.drop.amount;
      player.emit('gold');
      sfx.gold();
      remove(g);
      return true;
    }
    const it = g.drop.item;
    if (player.addToBag(it, 'pickup')) {
      sfx.pickup();
      remove(g);
      return true;
    }
    // stackables may have been partly absorbed
    g.label.textContent = it.name + (it.qty && it.qty > 1 ? ` x${it.qty}` : '');
    toast('가방이 가득 찼습니다');
    return false;
  }

  function setTarget(g: Ground | null) { target = g; }

  function hovered(): Ground | null {
    let best: Ground | null = null, bd = 34;
    for (const g of items) {
      const [x, y] = toScreen(v.set(g.sprite.position.x, g.sprite.position.y, g.sprite.position.z));
      const d = Math.hypot(x - mouseX, y - mouseY);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  function update(dt: number) {
    const hero = ctx.hero.position;
    let lightIdx = 0;
    const hov = hovered();
    for (const g of [...items]) {
      // flight: arc from the kill to the landing spot, then a small bounce
      if (!g.landed) {
        g.t += dt / 0.55;
        const k = Math.min(1, g.t);
        g.sprite.position.lerpVectors(g.from, g.to, k);
        g.sprite.position.y = g.h / 2 + 0.05 + Math.sin(k * Math.PI) * 1.3;
        if (k >= 1) {
          g.landed = true;
          const rare = g.drop.kind === 'item' && (g.drop.item.rarity === 'rare' || g.drop.item.rarity === 'unique');
          if (rare) sfx.dropRare(); else sfx.drop();
        }
      } else {
        g.t += dt;
        const b = Math.max(0, 0.25 - (g.t - 1)) * Math.abs(Math.sin((g.t - 1) * 18)) * 0.6;
        g.sprite.position.copy(g.to).setY(g.h / 2 + 0.05 + b);
      }
      if (g.beam) {
        g.beam.position.copy(g.to).setY(2.3);
        g.beam.material.opacity = g.landed ? 0.55 + 0.2 * Math.sin(g.t * 4) : 0;
        if (g.landed && lightIdx < lights.length) {
          const l = lights[lightIdx++];
          l.position.copy(g.to).setY(0.8);
          l.color.set(g.beam.material.color).multiplyScalar(0.6);
          l.intensity = 5 + Math.sin(g.t * 4);
        }
      }
      // gold: walk over it
      if (g.landed && g.drop.kind === 'gold' && Math.hypot(hero.x - g.to.x, hero.z - g.to.z) < GOLD_RANGE) { pickUp(g); continue; }
      // label
      const show = altHeld || g === hov || g === target;
      g.label.style.display = show ? 'block' : 'none';
      if (show) {
        const [x, y] = toScreen(v.copy(g.sprite.position).setY(g.sprite.position.y + g.h / 2 + 0.15));
        g.label.style.transform = `translate(${Math.round(x - g.label.offsetWidth / 2)}px, ${Math.round(y - 22)}px)`;
      }
    }
    for (let i = lightIdx; i < lights.length; i++) lights[i].intensity = 0;

    if (target && items.includes(target)) {
      const d = Math.hypot(hero.x - target.to.x, hero.z - target.to.z);
      if (d > PICK_RANGE) ctx.moveHeroTo(target.to);
      else { ctx.stopHero(); const t = target; target = null; if (t.landed) pickUp(t); else target = t; }
    } else target = null;
  }

  return {
    /** Loot from a kill at this spot. */
    spawn(drops: Drop[], at: THREE.Vector3) { for (const d of drops) spawnOne(d, at); },
    /** Put an item on the ground at the hero's feet (dragged out of the bag). */
    dropAtHero(it: Item) { spawnOne({ kind: 'item', item: it }, ctx.hero.position, false); },
    /** Ground item under the cursor (icon within ~34 px), if any. */
    pickAt(clientX: number, clientY: number) { mouseX = clientX; mouseY = clientY; return hovered(); },
    setTarget,
    hasTarget: () => target !== null,
    update,
    log,
    debug: { items, screenOf: (i: number) => toScreen(items[i].sprite.position) },
  };
}
