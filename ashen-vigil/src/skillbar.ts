// Skill bar: slots 1-4 hold assigned skills, 5/6 the health and mana potions.
// The game pushes a model for each slot every frame (render), the bar only
// touches the DOM where something changed. Keys 1-6 and clicks call onUse;
// while the skill tree is assigning a skill, a slot click goes to onSlotClick.

export interface SlotModel {
  icon: string | null;
  name: string;
  desc: string;
  count?: number;          // potions
  cd: number;              // seconds left
  cdTotal: number;
  noMana?: boolean;
  disabled?: boolean;
}

const css = `
#skills { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex; gap: 6px; padding: 8px; background: rgba(14, 12, 11, 0.92); border: 1px solid #4a4038;
  box-shadow: 0 0 0 1px #000, 0 6px 24px #000; user-select: none; z-index: 4; }
#skills .s { position: relative; width: 52px; height: 52px; background: #0e0c0b; border: 1px solid #3a322b; overflow: hidden; box-sizing: border-box; }
#skills .s img { width: 100%; height: 100%; display: block; }
#skills .s.pot img { object-fit: contain; padding: 6px; box-sizing: border-box; }
#skills .s .k { position: absolute; left: 3px; top: 1px; font: 600 11px/1.2 system-ui, sans-serif; color: #e8d8c4; text-shadow: 0 1px 2px #000; z-index: 2; }
#skills .s .n { position: absolute; right: 3px; bottom: 1px; font: 600 11px/1.2 system-ui, sans-serif; color: #f0e4d4; text-shadow: 0 1px 2px #000; z-index: 2; }
#skills .s .cd { position: absolute; left: 0; right: 0; bottom: 0; background: rgba(0, 0, 0, 0.7); pointer-events: none; }
#skills .s .t { position: absolute; inset: 0; display: grid; place-items: center; font: 700 15px/1 system-ui, sans-serif; color: #f4e8d8; text-shadow: 0 1px 3px #000; z-index: 2; pointer-events: none; }
#skills .s.off img { filter: grayscale(1) brightness(0.4); }
#skills .s.nomana { border-color: #b03020; }
#skills .s.nomana img { filter: grayscale(0.8) brightness(0.6); }
#skills .s.deny { outline: 2px solid #ff3a20; background: rgba(160, 20, 10, 0.5); }
#skills .s.flash { outline: 2px solid #e8873a; }
#skills .s.pick { outline: 1px dashed #e8c070; }
#skills .s:hover { border-color: #e8873a; }
#skills .rmb { align-self: center; margin-left: 4px; font: 11px/1.3 system-ui, sans-serif; color: #8a7e70; max-width: 70px; }
@media (max-width: 520px) { #skills .s { width: 40px; height: 40px; } #skills .rmb { display: none; } #hud { display: none; } }
`;

export interface SkillBarOpts {
  onUse(i: number): void;
  onSlotClick?(i: number): boolean;     // return true when the click was consumed (skill assignment)
}

export function setupSkillBar(opts: SkillBarOpts) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.id = 'skills';
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  bar.addEventListener('contextmenu', (e) => e.preventDefault());
  document.body.appendChild(bar);
  const tip = () => document.getElementById('tip');

  const slots = [0, 1, 2, 3, 4, 5].map((i) => {
    const el = document.createElement('div');
    el.className = 's';
    el.dataset.slot = String(i);
    el.innerHTML = `<img alt="" hidden><span class="k">${i + 1}</span><span class="n"></span><div class="cd"></div><span class="t"></span>`;
    bar.appendChild(el);
    el.addEventListener('click', () => { if (!opts.onSlotClick?.(i)) opts.onUse(i); });
    el.addEventListener('pointerenter', () => {
      const t = tip(), m = models[i];
      if (!t || !m?.icon) return;
      t.innerHTML = `<div class="n" style="color:#e8873a">${m.name}</div><div>${m.desc}</div>`;
      t.hidden = false;
      const r = el.getBoundingClientRect();
      t.style.left = `${Math.max(8, r.left + r.width / 2 - t.offsetWidth / 2)}px`;
      t.style.top = `${r.top - t.offsetHeight - 8}px`;
    });
    el.addEventListener('pointerleave', () => { const t = tip(); if (t) t.hidden = true; });
    return {
      el, img: el.querySelector('img') as HTMLImageElement, n: el.querySelector('.n') as HTMLElement,
      cd: el.querySelector('.cd') as HTMLElement, t: el.querySelector('.t') as HTMLElement, key: '',
    };
  });
  const rmbEl = document.createElement('div');
  rmbEl.className = 'rmb';
  bar.appendChild(rmbEl);
  const models: (SlotModel | null)[] = [];

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 6) opts.onUse(n - 1);
  });

  return {
    /** Update the slots; cheap when nothing changed. */
    render(ms: SlotModel[], rmbName: string) {
      ms.forEach((m, i) => {
        models[i] = m;
        const s = slots[i];
        const cdStep = m.cd > 0 ? Math.ceil(m.cd * 10) : 0;
        const key = `${m.icon}|${m.count}|${cdStep}|${m.noMana}|${m.disabled}`;
        if (key === s.key) return;
        s.key = key;
        s.img.hidden = !m.icon;
        if (m.icon && !s.img.src.endsWith(`/${m.icon}.png`)) s.img.src = `assets/icons/${m.icon}.png`;
        s.el.classList.toggle('pot', !!m.icon?.startsWith('icon_'));
        s.el.classList.toggle('off', !!m.disabled || !m.icon);
        s.el.classList.toggle('nomana', !!m.noMana && !m.disabled);
        s.n.textContent = m.count !== undefined ? String(m.count) : '';
        // cooldown: darkness shrinking from the top down, plus seconds left
        s.cd.style.height = m.cd > 0 && m.cdTotal > 0 ? `${Math.min(100, (m.cd / m.cdTotal) * 100)}%` : '0';
        s.t.textContent = m.cd > 0 ? (m.cd >= 1 ? String(Math.ceil(m.cd)) : m.cd.toFixed(1)) : '';
      });
      if (rmbEl.textContent !== rmbName) rmbEl.textContent = rmbName;
    },
    /** Red flash: cooldown or not enough mana. */
    deny(i: number) {
      const el = slots[i]?.el;
      if (!el) return;
      el.classList.add('deny');
      setTimeout(() => el.classList.remove('deny'), 220);
    },
    used(i: number) {
      const el = slots[i]?.el;
      if (!el) return;
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 150);
    },
    setPicking(on: boolean) { for (let i = 0; i < 4; i++) slots[i].el.classList.toggle('pick', on); },
    slotAt(x: number, y: number) {
      for (let i = 0; i < 4; i++) { const r = slots[i].el.getBoundingClientRect(); if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return i; }
      return -1;
    },
  };
}
