// Items: generation (base + rarity + affixes), names, tooltip lines, drops.
import {
  AFFIXES, AFFIX_SCALE, BASES, DROP, MOD_LABEL, RARE_NAMES, UNIQUES,
  type Affix, type Attr, type BaseItem, type ModKey, type Rarity, type Slot,
} from './data/balance';

export interface Item {
  uid: number;
  base: string;                 // BaseItem id
  rarity: Rarity;
  name: string;
  ilvl: number;
  mods: Partial<Record<ModKey, number>>;
  qty?: number;                 // stackables
  flavor?: string;
}

const BY_ID = new Map(BASES.map((b) => [b.id, b]));
export const baseOf = (it: Item): BaseItem => BY_ID.get(it.base)!;
export const getBase = (id: string) => BY_ID.get(id);

let nextUid = 1;
export function bumpUid(seen: number) { nextUid = Math.max(nextUid, seen + 1); }

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
function weighted<K extends string>(w: Record<K, number>): K {
  const total = Object.values<number>(w).reduce((s, v) => s + v, 0);
  let r = Math.random() * total;
  for (const k of Object.keys(w) as K[]) { r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0] as K;
}

export function makeItem(baseId: string, rarity: Rarity = 'normal', ilvl = 1): Item {
  const b = BY_ID.get(baseId)!;
  const it: Item = { uid: nextUid++, base: baseId, rarity, name: b.name, ilvl, mods: {} };
  if (b.stack) { it.qty = 1; it.rarity = 'normal'; return it; }
  if (rarity === 'magic' || rarity === 'rare') {
    const [lo, hi] = rarity === 'magic' ? DROP.magicAffixes : DROP.rareAffixes;
    const n = Math.round(rnd(lo, hi));
    const pool = AFFIXES.filter((a) => a.kinds.includes(b.kind));
    const chosen: Affix[] = [];
    let prefix: Affix | null = null, suffix: Affix | null = null;
    for (let i = 0; i < n && pool.length; i++) {
      const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      chosen.push(a);
      if (a.kind === 'prefix' && !prefix) prefix = a;
      if (a.kind === 'suffix' && !suffix) suffix = a;
    }
    const scale = 1 + AFFIX_SCALE * (ilvl - 1);
    for (const a of chosen) {
      const roll = (r: [number, number]) => {
        const v = rnd(r[0], r[1]) * scale;
        return a.decimals ? Math.round(v * 10) / 10 : Math.max(1, Math.round(v));
      };
      it.mods[a.key] = (it.mods[a.key] ?? 0) + roll(a.v);
      if (a.key2 && a.v2) it.mods[a.key2] = (it.mods[a.key2] ?? 0) + roll(a.v2);
    }
    if (rarity === 'magic') {
      it.name = [suffix?.word, prefix?.word, b.name].filter(Boolean).join(' ');
    } else {
      it.name = `${pick(RARE_NAMES[0])} ${pick(RARE_NAMES[1])}`;
    }
  }
  return it;
}

export function makeUnique(id: string): Item {
  const u = UNIQUES.find((x) => x.id === id)!;
  return { uid: nextUid++, base: u.base, rarity: 'unique', name: u.name, ilvl: 1, mods: { ...u.mods }, flavor: u.flavor };
}

export type Drop = { kind: 'gold'; amount: number } | { kind: 'item'; item: Item };
export type DropOutcome = 'none' | 'gold' | 'potion' | 'equip';

/** One kill's loot. Also returns which branch of the table fired (for stats). */
export function rollDrop(monsterLevel: number): { outcome: DropOutcome; drops: Drop[] } {
  const drops: Drop[] = [];
  const outcome = weighted(DROP.table) as DropOutcome;
  if (outcome === 'gold') {
    drops.push({ kind: 'gold', amount: Math.round(rnd(DROP.goldPerLevel[0], DROP.goldPerLevel[1]) * monsterLevel) });
  } else if (outcome === 'potion') {
    drops.push({ kind: 'item', item: makeItem(Math.random() < DROP.hpPotionShare ? 'potion_hp' : 'potion_mp') });
  } else if (outcome === 'equip') {
    const bases = BASES.filter((b) => b.lvl <= monsterLevel + DROP.baseLevelSlack && (b.dropWeight ?? 1) > 0);
    const total = bases.reduce((s, b) => s + (b.dropWeight ?? 1), 0);
    let r = Math.random() * total, base = bases[0];
    for (const b of bases) { r -= b.dropWeight ?? 1; if (r <= 0) { base = b; break; } }
    const rarity = base.kind === 'gem' ? 'normal' : weighted(DROP.rarity) as Rarity;
    drops.push({ kind: 'item', item: makeItem(base.id, rarity, monsterLevel) });
  }
  if (Math.random() < DROP.uniqueChance) drops.push({ kind: 'item', item: makeUnique('echo_of_ash') });
  return { outcome, drops };
}

export const RARITY_COLOR: Record<Rarity, string> = { normal: '#e6e0d6', magic: '#7f9cf0', rare: '#f0d060', unique: '#c9a46a' };
export const RARITY_LABEL: Record<Rarity, string> = { normal: '일반', magic: '마법', rare: '희귀', unique: '고유' };
export const SLOT_OF = (it: Item): Slot | undefined => baseOf(it).slot;

/** Human-readable mod lines (fire min/max merged). */
export function modLines(mods: Partial<Record<ModKey, number>>): string[] {
  const out: string[] = [];
  for (const k of Object.keys(mods) as ModKey[]) {
    if (k === 'fireMax') continue;
    const v = mods[k]!;
    if (k === 'fireMin') out.push(`불 피해 +${v}~${mods.fireMax ?? v}`);
    else out.push(MOD_LABEL[k](v));
  }
  return out;
}

export function reqsOf(it: Item): { lvl: number; attrs: Partial<Record<Attr, number>> } {
  const b = baseOf(it);
  return { lvl: b.lvl, attrs: b.req ?? {} };
}
