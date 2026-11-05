// Autosave to localStorage. Any read/parse/validation failure starts a new
// game instead; storage errors (private mode, quota) are ignored.
import { sfx } from './audio';
import { BASES, SKILLS, START_ATTRS, type Attr, type SkillId, type Slot } from './data/balance';
import { bumpUid, type Item } from './items';
import { BAG_H, BAG_W, SLOTS, player, type BagEntry } from './stats';

const KEY = 'ashen-vigil-save';
const VERSION = 2;                         // 2: skills, slots, right-click skill (v1 saves migrate)
const baseIds = new Set(BASES.map((b) => b.id));

function validItem(it: unknown): it is Item {
  const o = it as Item;
  return !!o && typeof o.uid === 'number' && baseIds.has(o.base) && typeof o.name === 'string' && typeof o.mods === 'object' && o.mods !== null;
}

export function loadGame(): 'loaded' | 'new' {
  let data: unknown = null;
  try { data = JSON.parse(localStorage.getItem(KEY) ?? 'null'); } catch { data = null; }
  const d = data as { v?: number; p?: Record<string, unknown>; muted?: boolean } | null;
  try {
    if (!d || (d.v !== VERSION && d.v !== 1) || !d.p) throw new Error('no save');
    const p = d.p as { level: number; xp: number; attrs: Record<Attr, number>; attrPoints: number; skillPoints: number; gold: number; equip: Partial<Record<Slot, Item>>; bag: BagEntry[]; skills?: Record<string, number>; slots?: (string | null)[]; rmb?: string | null };
    if (!Number.isInteger(p.level) || p.level < 1 || typeof p.xp !== 'number' || typeof p.gold !== 'number') throw new Error('bad header');
    for (const k of Object.keys(START_ATTRS) as Attr[]) if (!Number.isFinite(p.attrs?.[k])) throw new Error('bad attrs');
    const equip: Partial<Record<Slot, Item>> = {};
    for (const s of SLOTS) { const it = p.equip?.[s]; if (it) { if (!validItem(it)) throw new Error('bad equip'); equip[s] = it; } }
    if (!Array.isArray(p.bag)) throw new Error('bad bag');
    for (const e of p.bag) if (!validItem(e.item) || !Number.isInteger(e.x) || !Number.isInteger(e.y) || e.x < 0 || e.y < 0 || e.x >= BAG_W || e.y >= BAG_H) throw new Error('bad bag entry');
    // skills: v1 saves have none (their skill points are kept); unknown ids are dropped
    const ids = new Set<string>(SKILLS.map((x) => x.id));
    const skills: Partial<Record<SkillId, number>> = {};
    for (const [k, v] of Object.entries(p.skills ?? {})) if (ids.has(k) && Number.isInteger(v) && v > 0) skills[k as SkillId] = Math.min(5, v);
    const slots = [0, 1, 2, 3].map((i) => { const x = p.slots?.[i]; return x && skills[x as SkillId] ? (x as SkillId) : null; });
    const rmb = p.rmb && skills[p.rmb as SkillId] ? (p.rmb as SkillId) : null;
    Object.assign(player, { skills, slots, rmb, level: p.level, xp: p.xp, attrs: { ...p.attrs }, attrPoints: p.attrPoints | 0, skillPoints: p.skillPoints | 0, gold: p.gold, equip, bag: p.bag });
    for (const it of [...Object.values(equip), ...p.bag.map((e) => e.item)]) if (it) bumpUid(it.uid);
    const dv = player.derived();
    player.hp = dv.maxHp; player.mp = dv.maxMp;
    if (d.muted && !sfx.muted) sfx.toggle();
    player.emit('load');
    return 'loaded';
  } catch {
    player.reset();
    return 'new';
  }
}

let pending = 0;
export function saveNow() {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, t: Date.now(), muted: sfx.muted, p: player.toJSON() })); } catch { /* storage unavailable */ }
}
export function startAutosave() {
  // after item moves, pickups, level-ups... (debounced), and every 5 s
  player.onChange((why) => {
    if (why === 'xp') return;                       // the 5 s tick covers plain XP gains
    clearTimeout(pending);
    pending = window.setTimeout(saveNow, 300);
  });
  window.setInterval(saveNow, 5000);
  window.addEventListener('beforeunload', saveNow);
}
export function wipeSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
