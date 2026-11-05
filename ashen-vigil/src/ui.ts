// Small shared UI bits: a centred toast message.
const css = `
#toast { position: fixed; left: 50%; top: 22%; transform: translateX(-50%); padding: 8px 16px; z-index: 20;
  background: rgba(10, 8, 7, 0.88); border: 1px solid #5a3a28; color: #f0b080; font: 600 14px/1.3 system-ui, sans-serif;
  pointer-events: none; opacity: 0; transition: opacity 0.2s; }
#toast.on { opacity: 1; }
`;
let el: HTMLDivElement | null = null;
let timer = 0;
export function toast(msg: string, ms = 1600) {
  if (!el) {
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('on'), ms);
}
