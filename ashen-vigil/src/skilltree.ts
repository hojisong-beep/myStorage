// Skill tree window (S): three columns (sword / ember / oath), three tiers each.
// [+] spends a skill point (disabled with the reason as a tooltip). An icon can
// be put on skill-bar slots 1-4 by dragging it there, or by clicking it and
// then clicking a slot. Right-clicking an icon makes it the right-click skill.
import { SKILLS, SKILL_RULES, type SkillDef, type SkillId, type Tree } from './data/balance';
import { player } from './stats';
import { toast } from './ui';

const TREES: { id: Tree; name: string }[] = [
  { id: 'sword', name: '검술' }, { id: 'ember', name: '잿불' }, { id: 'oath', name: '서약' },
];
const css = `
#tree { position: fixed; left: 50%; top: calc(76px + env(safe-area-inset-top, 0px)); transform: translateX(-50%); z-index: 9;
  padding: 14px 16px; background: rgba(14, 12, 11, 0.96); border: 1px solid #4a4038; box-shadow: 0 0 0 1px #000, 0 8px 32px #000;
  font: 13px/1.4 system-ui, sans-serif; color: #b8aa98; user-select: none; }
#tree[hidden] { display: none !important; }
#tree h2 { margin: 0 0 4px; font: 600 14px/1 Georgia, serif; letter-spacing: 0.12em; color: #e8873a; }
#tree .pts { margin-bottom: 10px; font-size: 12px; color: #8a7e70; }
#tree .pts b { color: #f0c060; }
#tree .cols { display: flex; gap: 22px; }
#tree .col { position: relative; width: 120px; }
#tree .col h3 { margin: 0 0 8px; text-align: center; font: 600 12px/1 system-ui, sans-serif; color: #c8b090; letter-spacing: 0.2em; }
#tree .node { position: relative; display: flex; flex-direction: column; align-items: center; margin-bottom: 26px; }
#tree .node:not(:last-child)::after { content: ''; position: absolute; left: 50%; top: 100%; width: 2px; height: 26px; background: #3a322b; }
#tree .node.on:not(:last-child)::after { background: #a06030; }
#tree .ic { position: relative; width: 52px; height: 52px; border: 1px solid #4a4038; cursor: grab; background: #0e0c0b; }
#tree .ic img { width: 100%; height: 100%; display: block; pointer-events: none; }
#tree .node.zero .ic img { filter: grayscale(1) brightness(0.45); }
#tree .node.passive .ic { cursor: default; }
#tree .ic .rmb { position: absolute; right: 1px; bottom: 1px; font: 700 9px/1 system-ui; color: #111; background: #e8c070; padding: 1px 2px; }
#tree .lv { margin-top: 3px; font-size: 12px; color: #d8c8b0; }
#tree .nm { font-size: 11px; color: #8a7e70; text-align: center; }
#tree .plus { position: absolute; right: 18px; top: 16px; font: 700 13px/1 system-ui; padding: 2px 6px; color: #f0e4d4; background: #3a2a1a; border: 1px solid #8a5a30; cursor: pointer; }
#tree .plus:disabled { opacity: 0.3; cursor: not-allowed; }
#tree .hint { margin-top: 2px; font-size: 11px; color: #6a6058; }
#treeHeld { position: fixed; left: 0; top: 0; width: 44px; height: 44px; z-index: 40; pointer-events: none; opacity: 0.85; display: none; }
#treeHeld img { width: 100%; height: 100%; }
`;

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();
function levelLines(d: SkillDef, lv: number): string[] {
  if (lv < 1) return [];
  const i = lv - 1, out: string[] = [];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  switch (d.id) {
    case 'ash_slash': out.push(`무기 피해 x${fmt(d.mult![i])}, 반경 ${d.radius![i]}, 120°`); break;
    case 'whirl_cleave': out.push(`3연타, 각 무기 피해 x${fmt(d.mult![i])}, 반경 ${d.radius![i]}`); break;
    case 'wardens_charge': out.push(`돌진 ${d.radius![i]}, 무기 피해 x${fmt(d.mult![i])}, 기절 ${fmt(d.dur![i])}초`); break;
    case 'ember_throw': out.push(`불 피해 (12~20 + 정신x0.6) x${fmt(d.mult![i])}, 폭발 반경 ${d.radius![i]}`); break;
    case 'burning_ring': out.push(`반경 ${d.radius![i]}, 피해 x${fmt(d.mult![i])}, 화상 ${d.dur![i]}초 (0.5초마다 x${fmt(d.tick![i])})`); break;
    case 'purging_flame': out.push(`반경 ${d.radius![i]}, ${fmt(d.dur![i])}초, 0.5초마다 x${fmt(d.mult![i])}`); break;
    case 'ash_armor': out.push(`${d.dur![i]}초간 방어 +${d.extra![i]}, 받는 피해 ${pct(d.extra2![i])} 마나로 흡수`); break;
    case 'dread': out.push(`반경 ${d.radius![i]}, ${d.dur![i]}초간 이동 -${pct(d.extra![i])}, 공격 피해 -${pct(d.extra2![i])}`); break;
    case 'last_vigil': out.push(`체력 ${pct(d.extra![i])}로 생존, 반경 ${d.radius![i]} 충격파·기절 ${d.dur![i]}초`); break;
  }
  if (!d.passive) out.push(`마나 ${d.mp[i]} · 재사용 ${fmt(d.cd[i])}초`);
  else out.push(`재사용 대기 ${d.cd[i]}초`);
  return out;
}

export interface TreeOpts {
  assign(slot: number, id: SkillId): void;
  setPicking(on: boolean): void;
  slotAt(x: number, y: number): number;
}

export function setupSkillTree(opts: TreeOpts) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.id = 'tree';
  el.hidden = true;
  document.body.appendChild(el);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  const held = document.createElement('div');
  held.id = 'treeHeld';
  held.innerHTML = '<img alt="">';
  document.body.appendChild(held);
  const tip = () => document.getElementById('tip')!;

  let picking: SkillId | null = null;
  let downAt: [number, number] | null = null;
  function setPicking(id: SkillId | null) {
    picking = id;
    held.style.display = id ? 'block' : 'none';
    if (id) (held.firstElementChild as HTMLImageElement).src = `assets/icons/${SKILLS.find((s) => s.id === id)!.icon}.png`;
    opts.setPicking(!!id);
  }

  function showTip(d: SkillDef, anchor: HTMLElement) {
    const lv = player.skillLevel(d.id), block = player.learnBlock(d);
    let h = `<div class="n" style="color:#e8873a">${d.name}</div><div class="b">${TREES.find((t) => t.id === d.tree)!.name} ${d.tier}단 · 요구 레벨 ${SKILL_RULES.tierLevel[d.tier]}${d.passive ? ' · 패시브' : ''}</div><div>${d.desc}</div>`;
    if (lv > 0) h += `<div class="cmp"><div class="b">현재 ${lv}레벨</div>${levelLines(d, lv).map((l) => `<div>${l}</div>`).join('')}</div>`;
    if (lv < SKILL_RULES.maxLevel) h += `<div class="cmp"><div class="b">다음 ${lv + 1}레벨</div>${levelLines(d, lv + 1).map((l) => `<div class="m">${l}</div>`).join('')}</div>`;
    if (block) h += `<div class="r">${block}</div>`;
    if (lv > 0 && !d.passive) h += '<div class="b">끌어서 스킬바 1~4에 놓기 · 우클릭: 오른쪽 클릭 스킬로 지정</div>';
    const t = tip();
    t.innerHTML = h;
    t.hidden = false;
    const r = anchor.getBoundingClientRect();
    t.style.left = `${Math.min(window.innerWidth - t.offsetWidth - 8, r.right + 10)}px`;
    t.style.top = `${Math.max(8, Math.min(window.innerHeight - t.offsetHeight - 8, r.top - 10))}px`;
  }

  function render() {
    const rmb = player.rmbSkill();
    let h = `<h2>기술</h2><div class="pts">남은 스킬 점수 <b>${player.skillPoints}</b> · 레벨 ${player.level}</div><div class="cols">`;
    for (const t of TREES) {
      h += `<div class="col"><h3>${t.name}</h3>`;
      for (const d of SKILLS.filter((s) => s.tree === t.id).sort((a, b) => a.tier - b.tier)) {
        const lv = player.skillLevel(d.id), block = player.learnBlock(d);
        h += `<div class="node${lv ? ' on' : ' zero'}${d.passive ? ' passive' : ''}" data-id="${d.id}">
          <div class="ic" data-id="${d.id}"><img src="assets/icons/${d.icon}.png" alt="">${rmb === d.id ? '<span class="rmb">우클릭</span>' : ''}</div>
          <button class="plus" data-id="${d.id}" ${block ? 'disabled' : ''} title="${block ?? '1점 투자'}">+</button>
          <div class="lv">${lv} / ${SKILL_RULES.maxLevel}</div><div class="nm">${d.name}</div></div>`;
      }
      h += '</div>';
    }
    h += '</div><div class="hint">S: 닫기 · 아이콘을 스킬바 1~4로 끌거나 클릭 후 슬롯 클릭</div>';
    el.innerHTML = h;
    el.querySelectorAll<HTMLButtonElement>('.plus').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id as SkillId;
      if (!player.learn(id)) toast(player.learnBlock(SKILLS.find((s) => s.id === id)!) ?? '투자할 수 없습니다', 1200);
    }));
    el.querySelectorAll<HTMLElement>('.ic').forEach((ic) => {
      const d = SKILLS.find((s) => s.id === ic.dataset.id)!;
      ic.addEventListener('pointerenter', () => { if (!picking) showTip(d, ic); });
      ic.addEventListener('pointerleave', () => { tip().hidden = true; });
      ic.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || d.passive || player.skillLevel(d.id) < 1) return;
        tip().hidden = true;
        downAt = [e.clientX, e.clientY];
        setPicking(d.id);
        moveHeld(e.clientX, e.clientY);
      });
      ic.addEventListener('contextmenu', () => {
        if (d.passive || player.skillLevel(d.id) < 1) return;
        player.rmb = d.id;
        player.emit('skill');
        toast(`오른쪽 클릭: ${d.name}`, 900);
      });
    });
  }
  function moveHeld(x: number, y: number) { held.style.transform = `translate(${x - 22}px, ${y - 22}px)`; }
  window.addEventListener('pointermove', (e) => { if (picking) moveHeld(e.clientX, e.clientY); });
  window.addEventListener('pointerup', (e) => {
    if (!picking || !downAt) return;
    const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6;
    downAt = null;
    if (!moved) return;                               // a click: keep carrying until a slot is clicked
    const slot = opts.slotAt(e.clientX, e.clientY);
    if (slot >= 0) opts.assign(slot, picking);
    setPicking(null);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 's' || e.key === 'S' || e.key === 'ㄴ') { el.hidden = !el.hidden; tip().hidden = true; if (el.hidden) setPicking(null); else render(); }
    else if (e.key === 'Escape') { el.hidden = true; setPicking(null); }
  });
  player.onChange(() => { if (!el.hidden) render(); });

  return {
    isOpen: () => !el.hidden,
    toggle(open?: boolean) { el.hidden = open === undefined ? !el.hidden : !open; if (!el.hidden) render(); else setPicking(null); },
    /** Skill-bar slot clicked while carrying a skill icon: assign it. */
    slotClicked(i: number) {
      if (!picking || i > 3) return false;
      opts.assign(i, picking);
      setPicking(null);
      return true;
    },
    cancelPick: () => setPicking(null),
  };
}
