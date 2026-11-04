// Inventory mock-up (M0): equipment slots + 10x4 grid backpack with
// Grok-generated icons. Toggle with the I key. Data is sample content.

type Rarity = 'normal' | 'magic' | 'rare' | 'unique';

interface Item {
  icon: string;
  name: string;
  base: string;
  rarity: Rarity;
  w: number;            // size in grid cells
  h: number;
  lines: string[];      // stat lines shown in the tooltip
}

const ITEMS: Record<string, Item> = {
  sword: { icon: 'icon_sword', name: '이 빠진 장검', base: '장검', rarity: 'normal', w: 1, h: 3, lines: ['피해 6~14', '요구 힘 20'] },
  axe: { icon: 'icon_axe', name: '그을린 도끼', base: '전투 도끼', rarity: 'magic', w: 2, h: 3, lines: ['피해 9~17', '불 피해 +3~6'] },
  mace: { icon: 'icon_mace', name: '파수꾼의 철퇴', base: '철퇴', rarity: 'rare', w: 2, h: 3, lines: ['피해 8~19', '언데드 대상 피해 +35%', '공격 속도 +10%'] },
  shield: { icon: 'icon_shield', name: '종지기 방패', base: '원형 방패', rarity: 'magic', w: 2, h: 2, lines: ['방어 18', '막기 확률 +12%'] },
  helm: { icon: 'icon_helm', name: '찌그러진 투구', base: '기사 투구', rarity: 'normal', w: 2, h: 2, lines: ['방어 11'] },
  armor: { icon: 'icon_armor', name: '타다 남은 사슬 갑옷', base: '사슬 갑옷', rarity: 'rare', w: 2, h: 3, lines: ['방어 34', '불 저항 +15%', '체력 +12'] },
  ring: { icon: 'icon_ring', name: '잿불 반지', base: '반지', rarity: 'magic', w: 1, h: 1, lines: ['정신 +5'] },
  amulet: { icon: 'icon_amulet', name: '감긴 눈의 부적', base: '목걸이', rarity: 'rare', w: 1, h: 1, lines: ['모든 저항 +8%', '마나 재생 +20%'] },
  hp: { icon: 'icon_potion_hp', name: '체력 물약', base: '물약', rarity: 'normal', w: 1, h: 1, lines: ['체력 60 회복'] },
  mp: { icon: 'icon_potion_mp', name: '마나 물약', base: '물약', rarity: 'normal', w: 1, h: 1, lines: ['마나 40 회복'] },
  sigil: { icon: 'icon_sigil', name: '잿불 문양', base: '강화 보석', rarity: 'magic', w: 1, h: 1, lines: ['무기: 불 피해 +4~8', '방어구: 불 저항 +10%'] },
  bell: { icon: 'icon_bell_unique', name: '재의 메아리', base: '금 간 종', rarity: 'unique', w: 1, h: 2, lines: ['사용 시 주변 언데드 2초 기절', '잿빛 파수꾼 기술 +1', '"멈춘 종도 기억은 남는다."'] },
  oldbell: { icon: 'icon_bell_silver', name: '녹슨 손종', base: '퀘스트 물품', rarity: 'normal', w: 1, h: 2, lines: ['촌장 엘드릭에게 가져갈 것'] },
};

// Backpack contents: [item key, column, row]
const BAG: [string, number, number][] = [
  ['axe', 0, 0], ['mace', 2, 0], ['bell', 4, 0], ['oldbell', 5, 0], ['sigil', 6, 0],
  ['hp', 0, 3], ['hp', 1, 3], ['hp', 2, 3], ['hp', 3, 3], ['mp', 4, 3], ['mp', 5, 3],
];
// Equipped items: [item key, slot id]
const EQUIP: [string, string][] = [
  ['helm', 'head'], ['amulet', 'neck'], ['sword', 'hand-r'], ['armor', 'body'], ['shield', 'hand-l'], ['ring', 'ring'],
];

const CELL = 40;
const COLORS: Record<Rarity, string> = { normal: '#d8d0c4', magic: '#7f9cf0', rare: '#e8c860', unique: '#c9a46a' };

const css = `
#inv { position: fixed; top: calc(16px + env(safe-area-inset-top, 0px)); right: calc(16px + env(safe-area-inset-right, 0px));
  width: ${10 * CELL + 2}px; padding: 14px; background: rgba(14, 12, 11, 0.94); border: 1px solid #4a4038;
  box-shadow: 0 0 0 1px #000, 0 8px 32px #000; font: 13px/1.4 system-ui, sans-serif; color: #b8aa98; user-select: none; }
#inv[hidden] { display: none !important; }
@media (max-width: 460px) { #inv { transform: scale(0.82); transform-origin: top right; } }
#inv h2 { margin: 0 0 10px; font: 600 14px/1 Georgia, serif; letter-spacing: 0.12em; color: #e8873a; text-transform: uppercase; }
#inv .equip { position: relative; height: 270px; margin-bottom: 12px; }
#inv .slot, #inv .bag { background: #0e0c0b; border: 1px solid #3a322b; }
#inv .slot { position: absolute; }
#inv .slot.empty::after { content: attr(data-label); position: absolute; inset: 0; display: grid; place-items: center; font-size: 11px; color: #4d443b; }
#inv .bag { position: relative; width: ${10 * CELL}px; height: ${4 * CELL}px;
  background-image: linear-gradient(#2a241f 1px, transparent 1px), linear-gradient(90deg, #2a241f 1px, transparent 1px);
  background-size: ${CELL}px ${CELL}px; }
#inv .item { position: absolute; display: grid; place-items: center; cursor: pointer; }
#inv .item img { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
#inv .item:hover { background: rgba(232, 135, 58, 0.12); outline: 1px solid rgba(232, 135, 58, 0.5); }
#inv .gold { margin-top: 8px; font-size: 12px; color: #8a7e70; }
#tip { position: fixed; z-index: 10; pointer-events: none; padding: 8px 12px; max-width: 240px; text-align: center;
  background: rgba(8, 7, 6, 0.96); border: 1px solid #3a322b; font: 13px/1.5 system-ui, sans-serif; color: #b8aa98; }
#tip[hidden] { display: none !important; }
#tip .n { font-weight: 600; }
#tip .b { font-size: 12px; color: #8a7e70; }
`;

// Equipment slot layout inside the 400px-wide panel: [id, label, x, y, w cells, h cells]
const SLOTS: [string, string, number, number, number, number][] = [
  ['head', '투구', 160, 0, 2, 2], ['neck', '목걸이', 252, 20, 1, 1],
  ['hand-r', '무기', 40, 40, 2, 4], ['body', '갑옷', 160, 90, 2, 3], ['hand-l', '방패', 280, 40, 2, 4],
  ['ring', '반지', 106, 210, 1, 1],
];

function makeItem(key: string, left: number, topPx: number, w: number, h: number, tip: HTMLElement) {
  const it = ITEMS[key];
  const el = document.createElement('div');
  el.className = 'item';
  Object.assign(el.style, { left: `${left}px`, top: `${topPx}px`, width: `${w}px`, height: `${h}px` });
  const img = document.createElement('img');
  img.src = `assets/icons/${it.icon}.png`;
  img.alt = it.name;
  el.appendChild(img);
  el.addEventListener('pointerenter', () => {
    tip.innerHTML = `<div class="n" style="color:${COLORS[it.rarity]}">${it.name}</div>` +
      (it.base !== it.name ? `<div class="b">${it.base}</div>` : '') +
      it.lines.map((l) => `<div>${l}</div>`).join('');
    tip.hidden = false;
  });
  el.addEventListener('pointermove', (e) => {
    tip.style.left = `${Math.max(8, e.clientX - tip.offsetWidth - 16)}px`;
    tip.style.top = `${Math.max(8, e.clientY - tip.offsetHeight / 2)}px`;
  });
  el.addEventListener('pointerleave', () => { tip.hidden = true; });
  return el;
}

export function setupInventory() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const tip = document.createElement('div');
  tip.id = 'tip';
  tip.hidden = true;
  document.body.appendChild(tip);

  const panel = document.createElement('div');
  panel.id = 'inv';
  panel.innerHTML = '<h2>장비 · 소지품</h2><div class="equip"></div><div class="bag"></div><div class="gold">금화 1,284 · 표시된 아이템은 시안용 예시입니다</div>';
  document.body.appendChild(panel);
  // Clicks on the panel should not move the hero.
  panel.addEventListener('pointerdown', (e) => e.stopPropagation());

  const equip = panel.querySelector('.equip') as HTMLElement;
  const filled = new Map(EQUIP.map(([k, s]) => [s, k]));
  for (const [id, label, x, y, w, h] of SLOTS) {
    const slot = document.createElement('div');
    slot.className = 'slot' + (filled.has(id) ? '' : ' empty');
    slot.dataset.label = label;
    Object.assign(slot.style, { left: `${x}px`, top: `${y}px`, width: `${w * CELL}px`, height: `${h * CELL}px` });
    equip.appendChild(slot);
    const key = filled.get(id);
    if (key) equip.appendChild(makeItem(key, x, y, w * CELL, h * CELL, tip));
  }

  const bag = panel.querySelector('.bag') as HTMLElement;
  for (const [key, c, r] of BAG) {
    const it = ITEMS[key];
    bag.appendChild(makeItem(key, c * CELL, r * CELL, it.w * CELL, it.h * CELL, tip));
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'i' || e.key === 'I' || e.key === 'ㅑ') { panel.hidden = !panel.hidden; tip.hidden = true; }
  });
}
