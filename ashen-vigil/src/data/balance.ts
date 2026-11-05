// Balance data for items, drops, experience and derived stats.
// Plain data only: tune numbers here without touching game code.

export type Slot = 'head' | 'neck' | 'hand-r' | 'body' | 'hand-l' | 'ring';
export type Rarity = 'normal' | 'magic' | 'rare' | 'unique';
export type Attr = 'str' | 'dex' | 'vit' | 'ene';

export interface BaseItem {
  id: string;
  name: string;
  icon: string;
  w: number; h: number;
  kind: 'weapon' | 'shield' | 'helm' | 'armor' | 'ring' | 'amulet' | 'charm' | 'potion' | 'gem';
  slot?: Slot;
  lvl: number;                          // required level, also the earliest item level it drops at
  req?: Partial<Record<Attr, number>>;
  dmg?: [number, number];               // weapons
  period?: number;                      // weapons: seconds per swing
  def?: number;                         // armour pieces
  stack?: number;                       // potions: max stack
  heal?: number; mana?: number;         // potions
  dropWeight?: number;                  // 0 = never from the normal equipment roll
}

// --- base items (icons are the existing Grok icons) ----------------------
export const BASES: BaseItem[] = [
  { id: 'sword_short', name: '짧은 장검', icon: 'icon_sword', w: 1, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 1, req: { str: 10 }, dmg: [9, 15], period: 0.55 },
  { id: 'sword_long', name: '장검', icon: 'icon_sword', w: 1, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 3, req: { str: 14 }, dmg: [11, 19], period: 0.55 },
  { id: 'sword_knight', name: '기사 장검', icon: 'icon_sword', w: 1, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 6, req: { str: 20, dex: 14 }, dmg: [14, 24], period: 0.55 },
  { id: 'axe_hand', name: '손도끼', icon: 'icon_axe', w: 2, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 1, req: { str: 12 }, dmg: [10, 19], period: 0.65 },
  { id: 'axe_battle', name: '전투 도끼', icon: 'icon_axe', w: 2, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 4, req: { str: 18 }, dmg: [13, 25], period: 0.65 },
  { id: 'axe_exec', name: '처형 도끼', icon: 'icon_axe', w: 2, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 7, req: { str: 26 }, dmg: [17, 32], period: 0.68 },
  { id: 'mace_club', name: '곤봉', icon: 'icon_mace', w: 2, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 1, req: { str: 11 }, dmg: [10, 17], period: 0.6 },
  { id: 'mace_iron', name: '철퇴', icon: 'icon_mace', w: 2, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 3, req: { str: 16 }, dmg: [12, 21], period: 0.6 },
  { id: 'mace_warden', name: '파수꾼 철퇴', icon: 'icon_mace', w: 2, h: 3, kind: 'weapon', slot: 'hand-r', lvl: 6, req: { str: 22 }, dmg: [15, 27], period: 0.62 },
  { id: 'shield_round', name: '원형 방패', icon: 'icon_shield', w: 2, h: 2, kind: 'shield', slot: 'hand-l', lvl: 1, req: { str: 10 }, def: 8 },
  { id: 'shield_bell', name: '종지기 방패', icon: 'icon_shield', w: 2, h: 2, kind: 'shield', slot: 'hand-l', lvl: 4, req: { str: 16 }, def: 15 },
  { id: 'helm_cap', name: '철모', icon: 'icon_helm', w: 2, h: 2, kind: 'helm', slot: 'head', lvl: 1, def: 5 },
  { id: 'helm_knight', name: '기사 투구', icon: 'icon_helm', w: 2, h: 2, kind: 'helm', slot: 'head', lvl: 4, req: { str: 14 }, def: 10 },
  { id: 'armor_quilt', name: '누빈 갑옷', icon: 'icon_armor', w: 2, h: 3, kind: 'armor', slot: 'body', lvl: 1, def: 10 },
  { id: 'armor_chain', name: '사슬 갑옷', icon: 'icon_armor', w: 2, h: 3, kind: 'armor', slot: 'body', lvl: 3, req: { str: 15 }, def: 18 },
  { id: 'armor_plate', name: '판금 흉갑', icon: 'icon_armor', w: 2, h: 3, kind: 'armor', slot: 'body', lvl: 7, req: { str: 24 }, def: 30 },
  { id: 'ring', name: '반지', icon: 'icon_ring', w: 1, h: 1, kind: 'ring', slot: 'ring', lvl: 1, dropWeight: 0.6 },
  { id: 'amulet', name: '목걸이', icon: 'icon_amulet', w: 1, h: 1, kind: 'amulet', slot: 'neck', lvl: 1, dropWeight: 0.5 },
  { id: 'potion_hp', name: '체력 물약', icon: 'icon_potion_hp', w: 1, h: 1, kind: 'potion', lvl: 1, stack: 10, heal: 60, dropWeight: 0 },
  { id: 'potion_mp', name: '마나 물약', icon: 'icon_potion_mp', w: 1, h: 1, kind: 'potion', lvl: 1, stack: 10, mana: 40, dropWeight: 0 },
  { id: 'gem_ember', name: '잿불 문양', icon: 'icon_sigil', w: 1, h: 1, kind: 'gem', lvl: 1, dropWeight: 0.3 },
  { id: 'bell_cracked', name: '금 간 종', icon: 'icon_bell_unique', w: 1, h: 2, kind: 'charm', slot: 'hand-l', lvl: 1, dropWeight: 0 },
];

// --- affixes ----------------------------------------------------------------
// v: value range at item level 1; scaled by (1 + AFFIX_SCALE * (ilvl - 1)).
// Two-number mods (fire damage) use v as the low range and v2 as the high range.
export type ModKey =
  | 'dmgPct' | 'fireMin' | 'fireMax' | 'hp' | 'mp' | 'ias' | 'crit' | 'ms' | 'def'
  | 'resFire' | 'resCold' | 'resPoison' | 'resPhys' | 'hpRegen' | 'mpRegen' | 'skills';

export interface Affix {
  key: ModKey; kind: 'prefix' | 'suffix'; word: string;
  v: [number, number]; v2?: [number, number]; key2?: ModKey;
  kinds: BaseItem['kind'][]; decimals?: number;
}
export const AFFIX_SCALE = 0.15;
const ARMOUR: BaseItem['kind'][] = ['armor', 'helm', 'shield'];
const JEWEL: BaseItem['kind'][] = ['ring', 'amulet'];
export const AFFIXES: Affix[] = [
  { key: 'dmgPct', kind: 'prefix', word: '잔혹한', v: [8, 18], kinds: ['weapon', ...JEWEL] },
  { key: 'fireMin', key2: 'fireMax', kind: 'prefix', word: '이글거리는', v: [1, 3], v2: [4, 7], kinds: ['weapon', ...JEWEL] },
  { key: 'def', kind: 'prefix', word: '단단한', v: [4, 10], kinds: ARMOUR },
  { key: 'hp', kind: 'prefix', word: '굳건한', v: [6, 15], kinds: [...ARMOUR, ...JEWEL] },
  { key: 'mp', kind: 'prefix', word: '푸른', v: [5, 12], kinds: ['helm', ...JEWEL] },
  { key: 'ias', kind: 'suffix', word: '신속의', v: [6, 12], kinds: ['weapon', 'ring'] },
  { key: 'crit', kind: 'suffix', word: '예리함의', v: [2, 5], kinds: ['weapon', 'helm', ...JEWEL] },
  { key: 'ms', kind: 'suffix', word: '질주의', v: [5, 10], kinds: ['armor', ...JEWEL] },
  { key: 'resFire', kind: 'suffix', word: '잿불 막이의', v: [6, 15], kinds: [...ARMOUR, ...JEWEL] },
  { key: 'resCold', kind: 'suffix', word: '서리 막이의', v: [6, 15], kinds: [...ARMOUR, ...JEWEL] },
  { key: 'resPoison', kind: 'suffix', word: '해독의', v: [6, 15], kinds: [...ARMOUR, ...JEWEL] },
  { key: 'resPhys', kind: 'suffix', word: '강철의', v: [2, 6], kinds: ['armor', 'shield'] },
  { key: 'hpRegen', kind: 'suffix', word: '재생의', v: [0.5, 2], kinds: ['armor', 'helm', ...JEWEL], decimals: 1 },
  { key: 'mpRegen', kind: 'suffix', word: '명상의', v: [0.5, 2], kinds: ['helm', ...JEWEL], decimals: 1 },
];

export const MOD_LABEL: Record<ModKey, (v: number) => string> = {
  dmgPct: (v) => `피해 +${v}%`,
  fireMin: (v) => `불 피해 +${v}`,
  fireMax: (v) => `~${v}`,
  hp: (v) => `최대 체력 +${v}`,
  mp: (v) => `최대 마나 +${v}`,
  ias: (v) => `공격 속도 +${v}%`,
  crit: (v) => `치명타 확률 +${v}%`,
  ms: (v) => `이동 속도 +${v}%`,
  def: (v) => `방어 +${v}`,
  resFire: (v) => `불 저항 +${v}%`,
  resCold: (v) => `냉기 저항 +${v}%`,
  resPoison: (v) => `독 저항 +${v}%`,
  resPhys: (v) => `물리 저항 +${v}%`,
  hpRegen: (v) => `체력 재생 +${v}/초`,
  mpRegen: (v) => `마나 재생 +${v}/초`,
  skills: (v) => `모든 기술 +${v}`,
};

export const RARE_NAMES: [string[], string[]] = [
  ['잿빛', '피의', '망자의', '황혼', '어둠', '서리', '부서진', '타오르는', '침묵의', '굶주린'],
  ['송곳니', '울음', '맹세', '파수', '장막', '심장', '손톱', '종소리', '그림자', '낙인'],
];

export interface UniqueDef { id: string; base: string; name: string; mods: Partial<Record<ModKey, number>>; flavor: string }
export const UNIQUES: UniqueDef[] = [
  { id: 'echo_of_ash', base: 'bell_cracked', name: '재의 메아리', mods: { skills: 1, dmgPct: 10, hp: 20, resFire: 15 }, flavor: '"멈춘 종도 기억은 남는다."' },
];

// --- drops -----------------------------------------------------------------
export const DROP = {
  // one roll per kill (weights): nothing / gold / potion / equipment
  table: { none: 35, gold: 20, potion: 12, equip: 33 },
  goldPerLevel: [5, 15] as [number, number],          // x monster level
  hpPotionShare: 0.75,                                 // potion drops: health vs mana
  rarity: { normal: 68, magic: 25, rare: 6.5 },        // equipment rarity weights
  uniqueChance: 0.005,                                 // separate roll on every kill
  magicAffixes: [1, 2] as [number, number],
  rareAffixes: [3, 4] as [number, number],
  baseLevelSlack: 2,                                   // bases up to monster level + this can drop
};

// --- experience ------------------------------------------------------------
export const XP = {
  ghoul: 24,
  // experience needed to go from level n to n+1: round(base * growth^(n-1)), up to MAX_LEVEL
  base: 58,
  growth: 1.25,
  maxLevel: 20,
  attrPointsPerLevel: 5,
  skillPointsPerLevel: 1,
};
export function xpToNext(level: number) {
  return level >= XP.maxLevel ? Infinity : Math.round(XP.base * Math.pow(XP.growth, level - 1));
}

// --- derived stats -----------------------------------------------------------
// Starting attributes are chosen so that an unarmed level-1 hero matches M1:
// 100 HP, 50 MP, 8-14 damage, 0.55 s swings, 10% crit, 4.2 move speed.
export const START_ATTRS: Record<Attr, number> = { str: 10, dex: 10, vit: 9, ene: 9 };
export const FORMULA = {
  hpBase: 50, hpPerVit: 5, hpPerLevel: 5,                 // 50 + 9*5 + 1*5 = 100
  mpBase: 21, mpPerEne: 3, mpPerLevel: 2,                 // 21 + 9*3 + 1*2 = 50
  unarmed: [7, 13] as [number, number], unarmedPeriod: 0.55,
  dmgPerStr: 0.01,                                        // weapon damage x (1 + str * 1%): 7-13 x 1.10 = 8-14
  critBase: 5, critPerDex: 0.5,                           // 5 + 10 * 0.5 = 10%
  critMult: 1.6,
  defK: 50, defCap: 0.7,                                  // physical damage x (1 - min(cap, def / (def + K)))
  moveSpeed: 4.2,
  resCap: 75,
};
