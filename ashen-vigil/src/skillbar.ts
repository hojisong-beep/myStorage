// Skill bar mock-up (M0): bottom-centre action slots with Grok skill icons.
// Keys 1-6 flash the slot and start a cooldown sweep. A slot can be given an
// action (setSkillAction); returning false means it did nothing and the
// cooldown does not start. Disabled slots are greyed out.

interface Skill { icon: string | null; name: string; desc: string; cooldown: number; disabled?: boolean }

const SKILLS: Skill[] = [
  { icon: 'skill_ember_throw', name: '불씨 던지기', desc: '잿불 파편을 던져 불 피해 12~20', cooldown: 1.5 },
  { icon: 'skill_ash_armor', name: '재의 갑주', desc: '6초 동안 받는 피해 30% 감소', cooldown: 12 },
  { icon: null, name: '', desc: '', cooldown: 0 },
  { icon: null, name: '', desc: '', cooldown: 0 },
  { icon: 'icon_potion_hp', name: '체력 물약', desc: '체력 60 회복 (가방의 물약 사용)', cooldown: 8 },
  { icon: 'icon_potion_mp', name: '마나 물약', desc: '마나 40 회복', cooldown: 3 },
];

const css = `
#skills { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  display: flex; gap: 6px; padding: 8px; background: rgba(14, 12, 11, 0.92); border: 1px solid #4a4038;
  box-shadow: 0 0 0 1px #000, 0 6px 24px #000; user-select: none; }
#skills .s { position: relative; width: 52px; height: 52px; background: #0e0c0b; border: 1px solid #3a322b; overflow: hidden; }
#skills .s img { width: 100%; height: 100%; display: block; }
#skills .s.pot img { object-fit: contain; padding: 6px; box-sizing: border-box; }
#skills .s .k { position: absolute; left: 3px; top: 1px; font: 600 11px/1.2 system-ui, sans-serif; color: #e8d8c4; text-shadow: 0 1px 2px #000; }
#skills .s .cd { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.65); pointer-events: none; }
#skills .s.flash { outline: 2px solid #e8873a; }
#skills .s.off img { filter: grayscale(1) brightness(0.45); }
#skills .s .n { position: absolute; right: 3px; bottom: 1px; font: 600 11px/1.2 system-ui, sans-serif; color: #f0e4d4; text-shadow: 0 1px 2px #000; }
#skills .s:hover { border-color: #e8873a; }
@media (max-width: 520px) { #skills .s { width: 40px; height: 40px; } #hud { display: none; } }
`;

const actions: (() => boolean)[] = [];
/** Give slot i (0-based) an action; return false from it when nothing happened. */
export function setSkillAction(i: number, fn: () => boolean) { actions[i] = fn; }

let slotsRef: { el: HTMLElement; sk: Skill }[] = [];
/** Show a count on slot i (potions) and grey it out at zero. */
export function setSkillCount(i: number, n: number) {
  const s = slotsRef[i];
  if (!s) return;
  s.sk.disabled = n <= 0;
  s.el.classList.toggle('off', n <= 0);
  let badge = s.el.querySelector('.n') as HTMLElement | null;
  if (!badge) { badge = document.createElement('span'); badge.className = 'n'; s.el.appendChild(badge); }
  badge.textContent = String(n);
}

export function setupSkillBar() {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'skills';
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  document.body.appendChild(bar);
  const tip = document.getElementById('tip');

  const slots = SKILLS.map((sk, i) => {
    const el = document.createElement('div');
    el.className = 's' + (sk.icon?.startsWith('icon_') ? ' pot' : '') + (sk.disabled ? ' off' : '');
    el.innerHTML = (sk.icon ? `<img src="assets/icons/${sk.icon}.png" alt="${sk.name}">` : '') + `<span class="k">${i + 1}</span>`;
    const cd = document.createElement('div');
    cd.className = 'cd';
    cd.hidden = true;
    el.appendChild(cd);
    if (sk.icon && tip) {
      el.addEventListener('pointerenter', () => {
        tip.innerHTML = `<div class="n" style="color:#e8873a">${sk.name}</div><div>${sk.desc}</div><div class="b">재사용 대기 ${sk.cooldown}초</div>`;
        const r = el.getBoundingClientRect();
        tip.hidden = false;
        tip.style.left = `${r.left + r.width / 2 - tip.offsetWidth / 2}px`;
        tip.style.top = `${r.top - tip.offsetHeight - 8}px`;
      });
      el.addEventListener('pointerleave', () => { tip.hidden = true; });
    }
    bar.appendChild(el);
    return { el, cd, until: 0, sk };
  });
  slotsRef = slots;

  function use(i: number) {
    const s = slots[i];
    if (!s || !s.sk.icon || s.sk.disabled || performance.now() < s.until) return;
    if (actions[i] && !actions[i]()) return;
    s.until = performance.now() + s.sk.cooldown * 1000;
    s.el.classList.add('flash');
    setTimeout(() => s.el.classList.remove('flash'), 150);
  }
  window.addEventListener('keydown', (e) => { const n = Number(e.key); if (n >= 1 && n <= 6) use(n - 1); });
  bar.addEventListener('click', (e) => {
    const i = slots.findIndex((s) => s.el.contains(e.target as Node));
    if (i >= 0) use(i);
  });

  function tick() {
    const now = performance.now();
    for (const s of slots) {
      const left = s.until - now;
      s.cd.hidden = left <= 0;
      if (left > 0) {
        const deg = 360 * (1 - left / (s.sk.cooldown * 1000));
        s.cd.style.background = `conic-gradient(transparent ${deg}deg, rgba(0,0,0,0.65) ${deg}deg)`;
      }
    }
    requestAnimationFrame(tick);
  }
  tick();
}
