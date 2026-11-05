// Inventory (I) and character (C) panels backed by the real player state.
// Items are picked up by pressing on them and placed by releasing (drag) or by
// a second click (carry); valid cells/slots light green, invalid red. Right
// click drinks a potion or (un)equips. Releasing over the game world drops the
// item at the hero's feet. While something is held, game clicks are ignored.
import { sfx } from './audio';
import { FORMULA, XP, xpToNext, type Attr, type Slot } from './data/balance';
import { baseOf, modLines, RARITY_COLOR, RARITY_LABEL, reqsOf, type Item } from './items';
import { BAG_H, BAG_W, player, type Derived } from './stats';
import { toast } from './ui';

const CELL = 40;
const SLOT_BOX: Record<Slot, { label: string; x: number; y: number; w: number; h: number }> = {
  head: { label: '투구', x: 160, y: 0, w: 2, h: 2 },
  neck: { label: '목걸이', x: 300, y: 0, w: 1, h: 1 },     // above the shield, clear of it
  'hand-r': { label: '무기', x: 40, y: 40, w: 2, h: 4 },
  body: { label: '갑옷', x: 160, y: 90, w: 2, h: 3 },
  'hand-l': { label: '방패', x: 280, y: 40, w: 2, h: 4 },
  ring: { label: '반지', x: 106, y: 210, w: 1, h: 1 },
};
const ATTR_LABEL: Record<Attr, string> = { str: '힘', dex: '민첩', vit: '활력', ene: '정신' };

const css = `
#inv, #char { position: fixed; top: calc(16px + env(safe-area-inset-top, 0px)); z-index: 8;
  padding: 14px; background: rgba(14, 12, 11, 0.95); border: 1px solid #4a4038;
  box-shadow: 0 0 0 1px #000, 0 8px 32px #000; font: 13px/1.4 system-ui, sans-serif; color: #b8aa98; user-select: none; }
#inv { right: calc(16px + env(safe-area-inset-right, 0px)); width: ${10 * CELL + 2}px; }
#char { left: calc(16px + env(safe-area-inset-left, 0px)); top: calc(76px + env(safe-area-inset-top, 0px)); width: 280px; }   /* below the HUD text */
#inv[hidden], #char[hidden] { display: none !important; }
@media (max-width: 460px) { #inv { transform: scale(0.82); transform-origin: top right; } #char { transform: scale(0.82); transform-origin: top left; } }
#inv h2, #char h2 { margin: 0 0 10px; font: 600 14px/1 Georgia, serif; letter-spacing: 0.12em; color: #e8873a; }
#inv .equip { position: relative; height: 270px; margin-bottom: 12px; }
#inv .slot, #inv .bag { background: #0e0c0b; border: 1px solid #3a322b; box-sizing: border-box; }
#inv .slot { position: absolute; }
#inv .slot.empty::after { content: attr(data-label); position: absolute; inset: 0; display: grid; place-items: center; font-size: 11px; color: #4d443b; }
#inv .slot.ok, #inv .cellhl.ok { background: rgba(60, 160, 70, 0.28); outline: 1px solid rgba(90, 200, 100, 0.7); }
#inv .slot.bad, #inv .cellhl.bad { background: rgba(170, 40, 30, 0.3); outline: 1px solid rgba(220, 70, 50, 0.8); }
#inv .bag { position: relative; width: ${BAG_W * CELL}px; height: ${BAG_H * CELL}px;
  background-image: linear-gradient(#2a241f 1px, transparent 1px), linear-gradient(90deg, #2a241f 1px, transparent 1px);
  background-size: ${CELL}px ${CELL}px; }
#inv .cellhl { position: absolute; pointer-events: none; }
#inv .item { position: absolute; display: grid; place-items: center; cursor: pointer; box-sizing: border-box; }
#inv .item img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
#inv .item:hover { background: rgba(232, 135, 58, 0.12); outline: 1px solid rgba(232, 135, 58, 0.5); }
#inv .item.unusable { background: rgba(160, 30, 20, 0.22); }
#inv .item .q { position: absolute; right: 2px; bottom: 0; font: 600 11px/1.2 system-ui, sans-serif; color: #f0e4d4; text-shadow: 0 1px 2px #000; }
#inv .foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; color: #c8b070; }
#inv button, #char button { font: 12px/1 system-ui, sans-serif; color: #d8c8b0; background: #241c17; border: 1px solid #5a4838; padding: 5px 8px; cursor: pointer; }
#inv button:hover, #char button:hover { border-color: #e8873a; }
#inv button.warn { color: #ff8a6a; border-color: #a03a2a; }
#held { position: fixed; left: 0; top: 0; z-index: 30; pointer-events: none; opacity: 0.9; }
#held img { width: 100%; height: 100%; object-fit: contain; }
#tip { position: fixed; z-index: 31; pointer-events: none; padding: 8px 12px; max-width: 280px; text-align: center;
  background: rgba(8, 7, 6, 0.97); border: 1px solid #3a322b; font: 13px/1.5 system-ui, sans-serif; color: #b8aa98; }
#tip[hidden] { display: none !important; }
#tip .n { font-weight: 600; }
#tip .b { font-size: 12px; color: #8a7e70; }
#tip .m { color: #7f9cf0; }
#tip .r { color: #e05040; }
#tip .f { color: #c9a46a; font-style: italic; }
#tip .cmp { margin-top: 6px; padding-top: 6px; border-top: 1px solid #2c2520; font-size: 12px; text-align: left; }
#tip .up { color: #6ad07a; } #tip .dn { color: #e06050; }
#char .row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
#char .row b { color: #e6dccc; font-weight: 600; }
#char .sec { margin: 10px 0 4px; color: #8a7e70; font-size: 11px; letter-spacing: 0.1em; }
#char .pts { color: #f0c060; }
#char .plus { padding: 1px 6px; margin-left: 6px; }
`;

export interface InventoryOpts {
  onDropToWorld(it: Item): void;
  onNewGame(): void;
}

export function setupInventory(opts: InventoryOpts) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const tip = document.createElement('div');
  tip.id = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  const panel = document.createElement('div');
  panel.id = 'inv';
  panel.hidden = true;
  panel.innerHTML = '<h2>장비 · 소지품</h2><div class="equip"></div><div class="bag"></div><div class="foot"><span class="gold"></span><button class="newgame">새 게임</button></div>';
  document.body.appendChild(panel);
  const equipEl = panel.querySelector('.equip') as HTMLDivElement;
  const bagEl = panel.querySelector('.bag') as HTMLDivElement;
  const goldEl = panel.querySelector('.gold') as HTMLSpanElement;
  const newBtn = panel.querySelector('.newgame') as HTMLButtonElement;

  const charEl = document.createElement('div');
  charEl.id = 'char';
  charEl.hidden = true;
  document.body.appendChild(charEl);

  const heldEl = document.createElement('div');
  heldEl.id = 'held';
  heldEl.style.display = 'none';
  document.body.appendChild(heldEl);

  // ---------------- held item ----------------
  let held: Item | null = null;
  let heldFrom: { bag?: [number, number]; slot?: Slot } | null = null;
  let downAt: [number, number] | null = null, dragged = false;
  let mouse: [number, number] = [0, 0];

  function setHeld(it: Item | null, from: typeof heldFrom = null) {
    held = it;
    heldFrom = from;
    if (it) {
      const b = baseOf(it);
      heldEl.style.width = `${b.w * CELL}px`;
      heldEl.style.height = `${b.h * CELL}px`;
      heldEl.innerHTML = `<img src="assets/icons/${b.icon}.png" alt="">`;
      heldEl.style.display = 'block';
      moveHeld();
      tip.hidden = true;
    } else {
      heldEl.style.display = 'none';
      clearHighlight();
    }
  }
  function moveHeld() {
    if (!held) return;
    const b = baseOf(held);
    heldEl.style.transform = `translate(${mouse[0] - (b.w * CELL) / 2}px, ${mouse[1] - (b.h * CELL) / 2}px)`;
  }
  /** Put the held item back where it came from (or anywhere / on the ground). */
  function returnHeld() {
    if (!held) return;
    const it = held;
    const from = heldFrom;
    setHeld(null);
    if (from?.slot && !player.equip[from.slot] && player.canEquip(it, from.slot)) { player.equip[from.slot] = it; player.emit('equip'); return; }
    if (from?.bag) {
      const b = baseOf(it);
      if (player.overlaps(b.w, b.h, from.bag[0], from.bag[1])?.length === 0) { player.bag.push({ item: it, x: from.bag[0], y: from.bag[1] }); player.emit('move'); return; }
    }
    if (!player.addToBag(it, 'move')) opts.onDropToWorld(it);
  }

  // ---------------- placement targets ----------------
  type Target = { kind: 'bag'; x: number; y: number; ok: boolean; swap?: Item } | { kind: 'slot'; slot: Slot; ok: boolean } | { kind: 'world' } | { kind: 'panel' } | null;
  function targetAt(cx: number, cy: number): Target {
    if (!held) return null;
    const b = baseOf(held);
    for (const s of Object.keys(SLOT_BOX) as Slot[]) {
      const r = (equipEl.querySelector(`[data-slot="${s}"]`) as HTMLElement).getBoundingClientRect();
      if (cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom) return { kind: 'slot', slot: s, ok: player.canEquip(held, s) };
    }
    const br = bagEl.getBoundingClientRect();
    const scale = br.width / (BAG_W * CELL);
    if (cx >= br.left && cx < br.right && cy >= br.top && cy < br.bottom) {
      const x = Math.round((cx - br.left) / (CELL * scale) - b.w / 2);
      const y = Math.round((cy - br.top) / (CELL * scale) - b.h / 2);
      const hit = player.overlaps(b.w, b.h, x, y, held.uid);
      if (!hit) return { kind: 'bag', x: Math.max(0, Math.min(BAG_W - b.w, x)), y: Math.max(0, Math.min(BAG_H - b.h, y)), ok: false };
      return { kind: 'bag', x, y, ok: hit.length <= 1, swap: hit[0]?.item };
    }
    const pr = panel.getBoundingClientRect(), cr = charEl.hidden ? null : charEl.getBoundingClientRect();
    const inside = (r: DOMRect | null) => !!r && cx >= r.left && cx < r.right && cy >= r.top && cy < r.bottom;
    if (inside(pr) || inside(cr) || document.elementFromPoint(cx, cy)?.closest('#skills, #orbs')) return { kind: 'panel' };
    return { kind: 'world' };
  }
  const hl = document.createElement('div');
  hl.className = 'cellhl';
  bagEl.appendChild(hl);
  function clearHighlight() {
    hl.style.display = 'none';
    equipEl.querySelectorAll('.slot').forEach((s) => s.classList.remove('ok', 'bad'));
  }
  function highlight(t: Target) {
    clearHighlight();
    if (!t || !held) return;
    if (t.kind === 'bag') {
      const b = baseOf(held);
      hl.className = 'cellhl ' + (t.ok ? 'ok' : 'bad');
      Object.assign(hl.style, { display: 'block', left: `${t.x * CELL}px`, top: `${t.y * CELL}px`, width: `${b.w * CELL}px`, height: `${b.h * CELL}px` });
    } else if (t.kind === 'slot') {
      equipEl.querySelector(`[data-slot="${t.slot}"]`)?.classList.add(t.ok ? 'ok' : 'bad');
    }
  }
  /** Try to put the held item at the pointer. Returns true if something changed. */
  function place(cx: number, cy: number): boolean {
    const t = targetAt(cx, cy);
    if (!t || !held) return false;
    const it = held;
    if (t.kind === 'world') { setHeld(null); opts.onDropToWorld(it); player.emit('drop'); return true; }
    if (t.kind === 'panel' || !t.ok) {
      if (t.kind === 'slot' && !t.ok) toast(baseOf(it).slot === t.slot ? '요구 능력치가 부족합니다' : '이 칸에는 장착할 수 없습니다', 1200);
      return false;
    }
    if (t.kind === 'bag') {
      const b = baseOf(it);
      // stack potions onto a matching stack
      if (t.swap && t.swap.base === it.base && b.stack) {
        const room = b.stack - (t.swap.qty ?? 1), n = Math.min(room, it.qty ?? 1);
        t.swap.qty = (t.swap.qty ?? 1) + n;
        it.qty = (it.qty ?? 1) - n;
        if (!it.qty) setHeld(null); else setHeld(it, null);
        player.emit('move');
        return true;
      }
      if (t.swap) player.removeFromBag(t.swap.uid);
      player.bag.push({ item: it, x: t.x, y: t.y });
      setHeld(t.swap ?? null, null);
      player.emit('move');
      return true;
    }
    // equipment slot
    const old = player.equip[t.slot] ?? null;
    player.equip[t.slot] = it;
    setHeld(old, null);
    player.clampVitals();
    sfx.equip();
    player.emit('equip');
    return true;
  }

  // ---------------- right click ----------------
  function quickUse(it: Item, from: { bag?: boolean; slot?: Slot }) {
    const b = baseOf(it);
    if (b.kind === 'potion') {
      if (player.drink(it.base as 'potion_hp' | 'potion_mp')) sfx.potion(); else toast('이미 가득 찼습니다', 1000);
      return;
    }
    if (from.slot) {
      const at = player.findSpace(b.w, b.h);
      if (!at) { toast('가방이 가득 찼습니다'); return; }
      delete player.equip[from.slot];
      player.bag.push({ item: it, x: at[0], y: at[1] });
      player.clampVitals();
      sfx.equip();
      player.emit('equip');
      return;
    }
    if (!b.slot) return;
    if (!player.canEquip(it, b.slot)) { toast('요구 능력치가 부족합니다', 1200); return; }
    const old = player.equip[b.slot];
    player.removeFromBag(it.uid);
    player.equip[b.slot] = it;
    if (old && !player.addToBag(old, 'equip')) {
      // no room for the old piece: undo
      player.equip[b.slot] = old;
      player.addToBag(it, 'equip');
      toast('가방이 가득 찼습니다');
      return;
    }
    player.clampVitals();
    sfx.equip();
    player.emit('equip');
  }

  // ---------------- tooltip ----------------
  const fmt = (n: number, d = 0) => (Math.round(n * 10 ** d) / 10 ** d).toString();
  function compareLines(it: Item): string {
    const slot = baseOf(it).slot;
    if (!slot || player.equip[slot] === it) return '';
    const before = player.derived();
    const prev = player.equip[slot];
    player.equip[slot] = it;
    const after = player.derived();
    if (prev) player.equip[slot] = prev; else delete player.equip[slot];
    const rows: [string, number, number, number][] = [
      ['평균 피해', (before.dmgMin + before.dmgMax) / 2 + (before.fireMin + before.fireMax) / 2, (after.dmgMin + after.dmgMax) / 2 + (after.fireMin + after.fireMax) / 2, 1],
      ['초당 공격', 1 / before.period, 1 / after.period, 2],
      ['치명타 %', before.crit, after.crit, 1],
      ['방어', before.def, after.def, 0],
      ['최대 체력', before.maxHp, after.maxHp, 0],
      ['최대 마나', before.maxMp, after.maxMp, 0],
      ['이동 속도', before.moveSpeed, after.moveSpeed, 2],
      ['불 저항 %', before.res.fire, after.res.fire, 0],
      ['냉기 저항 %', before.res.cold, after.res.cold, 0],
      ['독 저항 %', before.res.poison, after.res.poison, 0],
      ['물리 저항 %', before.res.phys, after.res.phys, 0],
    ];
    const lines = rows.filter(([, a, b]) => Math.abs(a - b) > 1e-6).map(([n, a, b, d]) =>
      `<div class="${b > a ? 'up' : 'dn'}">${b > a ? '▲' : '▼'} ${n} ${fmt(b - a > 0 ? b - a : a - b, d)} (${fmt(a, d)} → ${fmt(b, d)})</div>`);
    return `<div class="cmp"><div class="b">${prev ? `장착 중: ${prev.name}` : '빈 칸과 비교'}</div>${lines.join('') || '<div class="b">변화 없음</div>'}</div>`;
  }
  function showTip(it: Item, el: HTMLElement) {
    const b = baseOf(it), d = player.derived(), unmet = player.unmet(it), req = reqsOf(it);
    const strMult = 1 + player.attrs.str * FORMULA.dmgPerStr;
    let h = `<div class="n" style="color:${RARITY_COLOR[it.rarity]}">${it.name}</div>`;
    if (it.name !== b.name || it.rarity !== 'normal') h += `<div class="b">${RARITY_LABEL[it.rarity]} ${b.name}</div>`;
    if (b.dmg) h += `<div>피해 ${Math.round(b.dmg[0] * strMult)}~${Math.round(b.dmg[1] * strMult)} <span class="b">(기본 ${b.dmg[0]}~${b.dmg[1]})</span></div><div>공격 주기 ${b.period}초</div>`;
    if (b.def) h += `<div>방어 ${b.def}</div>`;
    if (b.heal) h += `<div>체력 ${b.heal} 회복</div>`;
    if (b.mana) h += `<div>마나 ${b.mana} 회복</div>`;
    if (b.stack) h += `<div class="b">${it.qty ?? 1} / ${b.stack}개 · 우클릭: 사용</div>`;
    if (b.kind === 'gem') h += '<div class="b">장비에 박을 수 있음 (다음 단계)</div>';
    h += modLines(it.mods).map((l) => `<div class="m">${l}</div>`).join('');
    if (it.flavor) h += `<div class="f">${it.flavor}</div>`;
    const reqParts: string[] = [];
    if (req.lvl > 1) reqParts.push(`<span class="${unmet.includes('lvl') ? 'r' : ''}">레벨 ${req.lvl}</span>`);
    for (const [k, v] of Object.entries(req.attrs) as [Attr, number][]) reqParts.push(`<span class="${unmet.includes(k) ? 'r' : ''}">${ATTR_LABEL[k]} ${v}</span>`);
    if (reqParts.length) h += `<div class="b">요구: ${reqParts.join(' · ')}</div>`;
    if (unmet.length && b.slot) h += '<div class="r">장착 불가</div>';
    if (b.slot) h += compareLines(it);
    void d;
    tip.innerHTML = h;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left - tip.offsetWidth - 12));
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, Math.min(window.innerHeight - tip.offsetHeight - 8, r.top))}px`;
  }

  // ---------------- rendering ----------------
  function itemEl(it: Item, x: number, y: number, w: number, h: number, from: { bag?: [number, number]; slot?: Slot }) {
    const b = baseOf(it);
    const el = document.createElement('div');
    el.className = 'item' + (b.slot && player.unmet(it).length ? ' unusable' : '');
    el.dataset.uid = String(it.uid);
    Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px`, boxShadow: it.rarity !== 'normal' ? `inset 0 0 0 1px ${RARITY_COLOR[it.rarity]}55` : '' });
    el.innerHTML = `<img src="assets/icons/${b.icon}.png" alt="${it.name}">` + (b.stack ? `<span class="q">${it.qty ?? 1}</span>` : '');
    el.addEventListener('pointerenter', () => { if (!held) showTip(it, el); });
    el.addEventListener('pointerleave', () => { tip.hidden = true; });
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || held) return;
      e.stopPropagation();
      // pick up
      if (from.slot) { delete player.equip[from.slot]; player.clampVitals(); }
      else player.removeFromBag(it.uid);
      mouse = [e.clientX, e.clientY];
      downAt = [e.clientX, e.clientY];
      dragged = false;
      setHeld(it, from);
      render();
      highlight(targetAt(e.clientX, e.clientY));
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!held) { tip.hidden = true; quickUse(it, from.slot ? { slot: from.slot } : { bag: true }); } });
    return el;
  }
  function render() {
    equipEl.innerHTML = '';
    for (const [s, box] of Object.entries(SLOT_BOX) as [Slot, typeof SLOT_BOX[Slot]][]) {
      const slot = document.createElement('div');
      const it = player.equip[s];
      slot.className = 'slot' + (it ? '' : ' empty');
      slot.dataset.slot = s;
      slot.dataset.label = box.label;
      Object.assign(slot.style, { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w * CELL}px`, height: `${box.h * CELL}px` });
      equipEl.appendChild(slot);
      if (it) equipEl.appendChild(itemEl(it, box.x, box.y, box.w * CELL, box.h * CELL, { slot: s }));
    }
    bagEl.querySelectorAll('.item').forEach((e) => e.remove());
    for (const e of player.bag) {
      const b = baseOf(e.item);
      bagEl.appendChild(itemEl(e.item, e.x * CELL, e.y * CELL, b.w * CELL, b.h * CELL, { bag: [e.x, e.y] }));
    }
    goldEl.textContent = `금화 ${player.gold.toLocaleString()}`;
    renderChar();
  }
  function renderChar() {
    if (charEl.hidden) return;
    const d: Derived = player.derived();
    const need = xpToNext(player.level);
    const row = (k: string, v: string) => `<div class="row"><span>${k}</span><b>${v}</b></div>`;
    let h = `<h2>능력치</h2>${row('레벨', `${player.level}`)}${row('경험치', player.level >= XP.maxLevel ? '최대' : `${Math.floor(player.xp)} / ${need}`)}`;
    h += `<div class="sec">능력 ${player.attrPoints ? `<span class="pts">· 남은 점수 ${player.attrPoints}</span>` : ''}</div>`;
    for (const k of Object.keys(ATTR_LABEL) as Attr[]) {
      h += `<div class="row"><span>${ATTR_LABEL[k]}</span><span><b>${player.attrs[k]}</b>${player.attrPoints ? `<button class="plus" data-attr="${k}">+</button>` : ''}</span></div>`;
    }
    h += row('기술 점수', `${player.skillPoints}`);
    h += '<div class="sec">전투</div>';
    h += row('최대 체력 / 마나', `${d.maxHp} / ${d.maxMp}`);
    h += row('피해', `${d.dmgMin}~${d.dmgMax}${d.fireMax ? ` (+불 ${d.fireMin}~${d.fireMax})` : ''}`);
    h += row('공격 속도', `${(1 / d.period).toFixed(2)}회/초`);
    h += row('치명타', `${d.crit.toFixed(1)}% (x${d.critMult})`);
    h += row('방어', `${d.def} (물리 피해 -${Math.round((1 - d.dmgTaken) * 100)}%)`);
    h += row('이동 속도', d.moveSpeed.toFixed(2));
    h += row('저항 불/냉기/독/물리', `${d.res.fire}/${d.res.cold}/${d.res.poison}/${d.res.phys}%`);
    if (d.hpRegen || d.mpRegen) h += row('재생 체력/마나', `${d.hpRegen}/${d.mpRegen} 초당`);
    charEl.innerHTML = h;
    charEl.querySelectorAll<HTMLButtonElement>('.plus').forEach((b) => b.addEventListener('click', () => { player.spend(b.dataset.attr as Attr); }));
  }
  player.onChange(() => render());
  render();

  // ---------------- global pointer handling ----------------
  window.addEventListener('pointermove', (e) => {
    mouse = [e.clientX, e.clientY];
    if (!held) return;
    if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) dragged = true;
    moveHeld();
    highlight(targetAt(e.clientX, e.clientY));
  });
  window.addEventListener('pointerup', (e) => {
    if (held && downAt && dragged && e.button === 0) place(e.clientX, e.clientY);
    downAt = null;
    if (held) highlight(targetAt(e.clientX, e.clientY));
  });
  // A press while carrying places the item; capture so the game never sees it.
  window.addEventListener('pointerdown', (e) => {
    if (!held || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    place(e.clientX, e.clientY);
  }, { capture: true });
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());
  charEl.addEventListener('pointerdown', (e) => e.stopPropagation());
  panel.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------- keys and buttons ----------------
  function setOpen(open: boolean) {
    if (!open) returnHeld();
    panel.hidden = !open;
    tip.hidden = true;
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I' || e.key === 'ㅑ') setOpen(panel.hidden);
    else if (e.key === 'c' || e.key === 'C' || e.key === 'ㅊ') { charEl.hidden = !charEl.hidden; renderChar(); }
    else if (e.key === 'Escape') { setOpen(false); charEl.hidden = true; }
  });
  let confirmT = 0;
  newBtn.addEventListener('click', () => {
    if (!newBtn.classList.contains('warn')) {
      newBtn.classList.add('warn');
      newBtn.textContent = '정말 새로 시작? (다시 클릭)';
      clearTimeout(confirmT);
      confirmT = window.setTimeout(() => { newBtn.classList.remove('warn'); newBtn.textContent = '새 게임'; }, 3000);
      return;
    }
    clearTimeout(confirmT);
    newBtn.classList.remove('warn');
    newBtn.textContent = '새 게임';
    setHeld(null);
    opts.onNewGame();
  });

  return {
    isHolding: () => held !== null,
    isOpen: () => !panel.hidden,
    open: setOpen,
    toggleChar(open?: boolean) { charEl.hidden = open === undefined ? !charEl.hidden : !open; renderChar(); },
  };
}
