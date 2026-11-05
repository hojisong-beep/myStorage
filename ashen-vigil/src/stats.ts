// Player progression and gear: level, experience, attributes, equipment,
// the 10x4 bag, gold, current HP/MP and the derived combat numbers.
import { FORMULA, START_ATTRS, XP, xpToNext, type Attr, type ModKey, type Slot } from './data/balance';
import { baseOf, makeItem, type Item } from './items';

export const BAG_W = 10, BAG_H = 4;
export const SLOTS: Slot[] = ['head', 'neck', 'hand-r', 'body', 'hand-l', 'ring'];

export interface BagEntry { item: Item; x: number; y: number }
export interface Derived {
  maxHp: number; maxMp: number;
  dmgMin: number; dmgMax: number; fireMin: number; fireMax: number;
  period: number; crit: number; critMult: number;
  def: number; dmgTaken: number;                // multiplier on physical damage taken
  moveSpeed: number;
  res: { fire: number; cold: number; poison: number; phys: number };
  hpRegen: number; mpRegen: number; skills: number;
}

type Listener = (why: string) => void;

export class Player {
  level = 1;
  xp = 0;
  attrs: Record<Attr, number> = { ...START_ATTRS };
  attrPoints = 0;
  skillPoints = 0;
  gold = 0;
  equip: Partial<Record<Slot, Item>> = {};
  bag: BagEntry[] = [];
  hp = 100;
  mp = 50;
  private listeners: Listener[] = [];

  onChange(fn: Listener) { this.listeners.push(fn); }
  emit(why: string) { for (const f of this.listeners) f(why); }

  // ---------- derived numbers ----------
  modTotal(key: ModKey) {
    let s = 0;
    for (const it of Object.values(this.equip)) if (it) s += it.mods[key] ?? 0;
    return s;
  }
  derived(): Derived {
    const a = this.attrs, F = FORMULA, m = (k: ModKey) => this.modTotal(k);
    const weapon = this.equip['hand-r'];
    const wb = weapon ? baseOf(weapon) : null;
    const base = wb?.dmg ?? F.unarmed;
    const mult = (1 + a.str * F.dmgPerStr) * (1 + m('dmgPct') / 100);
    let def = m('def');
    for (const it of Object.values(this.equip)) if (it) def += baseOf(it).def ?? 0;
    const cap = (v: number) => Math.min(F.resCap, v);
    return {
      maxHp: Math.round(F.hpBase + a.vit * F.hpPerVit + this.level * F.hpPerLevel + m('hp')),
      maxMp: Math.round(F.mpBase + a.ene * F.mpPerEne + this.level * F.mpPerLevel + m('mp')),
      dmgMin: Math.round(base[0] * mult), dmgMax: Math.round(base[1] * mult),
      fireMin: m('fireMin'), fireMax: m('fireMax'),
      period: (wb?.period ?? F.unarmedPeriod) / (1 + m('ias') / 100),
      crit: F.critBase + a.dex * F.critPerDex + m('crit'),
      critMult: F.critMult,
      def, dmgTaken: 1 - Math.min(F.defCap, def / (def + F.defK)),
      moveSpeed: F.moveSpeed * (1 + m('ms') / 100),
      res: { fire: cap(m('resFire')), cold: cap(m('resCold')), poison: cap(m('resPoison')), phys: cap(m('resPhys')) },
      hpRegen: m('hpRegen'), mpRegen: m('mpRegen'), skills: m('skills'),
    };
  }
  /** Keep current HP/MP within the (possibly changed) maximums. */
  clampVitals() {
    const d = this.derived();
    this.hp = Math.min(this.hp, d.maxHp);
    this.mp = Math.min(this.mp, d.maxMp);
  }

  // ---------- requirements ----------
  unmet(it: Item): string[] {
    const b = baseOf(it), out: string[] = [];
    if (this.level < b.lvl) out.push('lvl');
    for (const [k, v] of Object.entries(b.req ?? {}) as [Attr, number][]) if (this.attrs[k] < v) out.push(k);
    return out;
  }
  canEquip(it: Item, slot: Slot) { return baseOf(it).slot === slot && this.unmet(it).length === 0; }

  // ---------- bag ----------
  occupant(x: number, y: number, ignore?: number) {
    return this.bag.find((e) => e.item.uid !== ignore && x >= e.x && x < e.x + baseOf(e.item).w && y >= e.y && y < e.y + baseOf(e.item).h);
  }
  /** Entries overlapped by an item of size w x h at (x, y); null if out of bounds. */
  overlaps(w: number, h: number, x: number, y: number, ignore?: number): BagEntry[] | null {
    if (x < 0 || y < 0 || x + w > BAG_W || y + h > BAG_H) return null;
    const hit = new Set<BagEntry>();
    for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) { const e = this.occupant(i, j, ignore); if (e) hit.add(e); }
    return [...hit];
  }
  findSpace(w: number, h: number): [number, number] | null {
    for (let x = 0; x <= BAG_W - w; x++) for (let y = 0; y <= BAG_H - h; y++) if (this.overlaps(w, h, x, y)?.length === 0) return [x, y];
    return null;
  }
  /** Add to the bag (stacking potions first). Returns false when there is no room. */
  addToBag(it: Item, why = 'bag'): boolean {
    const b = baseOf(it);
    if (b.stack) {
      let left = it.qty ?? 1;
      for (const e of this.bag) {
        if (e.item.base !== it.base) continue;
        const room = b.stack - (e.item.qty ?? 1);
        const n = Math.min(room, left);
        if (n > 0) { e.item.qty = (e.item.qty ?? 1) + n; left -= n; }
        if (!left) { this.emit(why); return true; }
      }
      it.qty = left;
    }
    const at = this.findSpace(b.w, b.h);
    if (!at) { if (b.stack && (it.qty ?? 0) < (b.stack ?? 1)) this.emit(why); return false; }
    this.bag.push({ item: it, x: at[0], y: at[1] });
    this.emit(why);
    return true;
  }
  removeFromBag(uid: number) {
    const i = this.bag.findIndex((e) => e.item.uid === uid);
    if (i >= 0) this.bag.splice(i, 1);
  }
  count(baseId: string) { return this.bag.reduce((s, e) => s + (e.item.base === baseId ? e.item.qty ?? 1 : 0), 0); }
  /** Use one potion of this kind from the bag. */
  drink(baseId: 'potion_hp' | 'potion_mp'): boolean {
    const e = this.bag.find((x) => x.item.base === baseId);
    if (!e) return false;
    const b = baseOf(e.item), d = this.derived();
    if (b.heal && this.hp >= d.maxHp) return false;
    if (b.mana && this.mp >= d.maxMp) return false;
    if (b.heal) this.hp = Math.min(d.maxHp, this.hp + b.heal);
    if (b.mana) this.mp = Math.min(d.maxMp, this.mp + b.mana);
    e.item.qty = (e.item.qty ?? 1) - 1;
    if (e.item.qty <= 0) this.removeFromBag(e.item.uid);
    this.emit('potion');
    return true;
  }

  // ---------- experience ----------
  /** Returns the number of levels gained. */
  gainXp(n: number) {
    let gained = 0;
    this.xp += n;
    while (this.level < XP.maxLevel && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.attrPoints += XP.attrPointsPerLevel;
      this.skillPoints += XP.skillPointsPerLevel;
      gained++;
    }
    if (gained) {
      const d = this.derived();
      this.hp = d.maxHp;
      this.mp = d.maxMp;
      this.emit('levelup');
    } else this.emit('xp');
    return gained;
  }
  spend(attr: Attr) {
    if (this.attrPoints <= 0) return false;
    this.attrPoints--;
    this.attrs[attr]++;
    if (attr === 'vit') this.hp += FORMULA.hpPerVit;
    if (attr === 'ene') this.mp += FORMULA.mpPerEne;
    this.emit('attr');
    return true;
  }

  // ---------- save data ----------
  toJSON() {
    return { level: this.level, xp: this.xp, attrs: this.attrs, attrPoints: this.attrPoints, skillPoints: this.skillPoints, gold: this.gold, equip: this.equip, bag: this.bag };
  }
  reset() {
    this.level = 1; this.xp = 0; this.attrs = { ...START_ATTRS }; this.attrPoints = 0; this.skillPoints = 0; this.gold = 0;
    this.equip = {}; this.bag = [];
    // a new game starts with three health potions
    const p = makeItem('potion_hp'); p.qty = 3;
    this.addToBag(p, 'reset');
    const d = this.derived();
    this.hp = d.maxHp; this.mp = d.maxMp;
    this.emit('reset');
  }
}

export const player = new Player();
