/// WKWebView 안에서 돌아가는 편집기(contenteditable) 페이지.
let editorHTML = #"""
<!doctype html>
<html><head><meta charset="utf-8">
<style>
:root { color-scheme: light; }
html, body { margin: 0; min-height: 100%; background: #FFF7B0; }
body { font: 15px/1.55 -apple-system, "Apple SD Gothic Neo", system-ui, sans-serif; color: #2b2b2b; }
#editor { min-height: 100vh; box-sizing: border-box; padding: 8px 22px 80px; outline: none; word-wrap: break-word; }
#editor img { max-width: 100%; border-radius: 4px; vertical-align: bottom; }
#editor h2 { font-size: 20px; margin: 6px 0; }
#editor table { border-collapse: collapse; margin: 8px 0; }
#editor td { border: 1px solid rgba(0,0,0,.3); padding: 5px 8px; min-width: 72px; vertical-align: top; background: rgba(255,255,255,.4); }
#editor input[type=checkbox] { margin-right: 4px; transform: scale(1.15); }
#frame { position: fixed; display: none; border: 2px solid #3b82f6; pointer-events: none; box-sizing: border-box; }
#handle { position: fixed; display: none; width: 14px; height: 14px; background: #3b82f6; border: 2px solid #fff;
          border-radius: 4px; cursor: nwse-resize; box-sizing: border-box; }
</style></head>
<body>
<div id="editor" contenteditable="true" spellcheck="false"></div>
<div id="frame"></div><div id="handle"></div>
<script>
const ed = document.getElementById('editor'), frame = document.getElementById('frame'), handle = document.getElementById('handle');
let curId = null, timer = null, sel = null;
document.execCommand('defaultParagraphSeparator', false, 'div');

function post(m) { window.webkit.messageHandlers.memo.postMessage(m); }
function emit() { if (curId) post({ type: 'change', id: curId, html: ed.innerHTML, text: ed.innerText.slice(0, 200) }); }
function changed() { clearTimeout(timer); timer = setTimeout(() => { timer = null; emit(); }, 200); }
function flush() { if (timer) { clearTimeout(timer); timer = null; emit(); } }

function focusEd() {
  ed.focus();
  const s = getSelection();
  if (!s.rangeCount || !ed.contains(s.anchorNode)) {
    const r = document.createRange(); r.selectNodeContents(ed); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  }
}
function ins(html) { focusEd(); document.execCommand('insertHTML', false, html); changed(); }

/* ---------- 이미지 ---------- */
function insertImg(src, w) { ins('<img src="' + src + '"' + (w ? ' style="width:' + w + 'px"' : '') + '>'); }
function addDataURL(url, mime) {
  if (/gif|svg/.test(mime)) return insertImg(url, 0);
  const im = new Image();
  im.onload = () => {
    const MAX = 1600; let w = im.naturalWidth, h = im.naturalHeight;
    if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(im, 0, 0, w, h);
    insertImg(c.toDataURL(/png/.test(mime) ? 'image/png' : 'image/jpeg', 0.88), Math.min(w, 420));
  };
  im.src = url;
}
function addFile(f) { const r = new FileReader(); r.onload = () => addDataURL(r.result, f.type); r.readAsDataURL(f); }

function place() {
  if (!sel || !sel.isConnected) { deselect(); return; }
  const r = sel.getBoundingClientRect();
  Object.assign(frame.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
  Object.assign(handle.style, { display: 'block', left: (r.right - 9) + 'px', top: (r.bottom - 9) + 'px' });
}
function deselect() { sel = null; frame.style.display = handle.style.display = 'none'; }
ed.addEventListener('click', e => { if (e.target.tagName === 'IMG') { sel = e.target; place(); } else deselect(); });
window.addEventListener('scroll', place); window.addEventListener('resize', place);
handle.addEventListener('mousedown', e => {
  e.preventDefault(); e.stopPropagation();
  if (!sel) return;
  const sx = e.clientX, sw = sel.getBoundingClientRect().width;
  const mv = ev => {
    const w = Math.max(40, Math.min(sw + ev.clientX - sx, ed.clientWidth - 44));
    sel.style.width = w + 'px'; sel.style.height = 'auto'; place();
  };
  const up = () => { document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); changed(); };
  document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
});

/* ---------- 표 ---------- */
function tableHTML(rows) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const w = Math.max(...rows.map(r => r.length));
  return '<table><tbody>' + rows.map(r => '<tr>' + Array.from({ length: w }, (_, i) => '<td>' + (esc(r[i] || '') || '<br>') + '</td>').join('') + '</tr>').join('') + '</tbody></table><div><br></div>';
}
function cellOf() {
  const n = getSelection().anchorNode, el = n && (n.nodeType === 1 ? n : n.parentElement), c = el && el.closest('td');
  return c && ed.contains(c) ? c : null;
}
function newRow(n) { const tr = document.createElement('tr'); for (let i = 0; i < n; i++) tr.insertCell().innerHTML = '<br>'; return tr; }
function goto(cell) { const r = document.createRange(); r.selectNodeContents(cell); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
const Table = {
  insert(r, c) { ins(tableHTML(Array.from({ length: r }, () => Array(c).fill('')))); },
  addRow() { const c = cellOf(); if (!c) return; c.parentElement.after(newRow(c.parentElement.cells.length)); changed(); },
  addCol() { const c = cellOf(); if (!c) return; const i = c.cellIndex; for (const row of c.closest('table').rows) row.insertCell(i + 1).innerHTML = '<br>'; changed(); },
  delRow() { const c = cellOf(); if (!c) return; const t = c.closest('table'); c.parentElement.remove(); if (!t.rows.length) t.remove(); changed(); },
  delCol() { const c = cellOf(); if (!c) return; const t = c.closest('table'), i = c.cellIndex; for (const row of [...t.rows]) if (row.cells[i]) row.deleteCell(i); if (![...t.rows].some(r => r.cells.length)) t.remove(); changed(); },
  del() { const c = cellOf(); if (c) { c.closest('table').remove(); changed(); } }
};

/* ---------- 이벤트 ---------- */
ed.addEventListener('input', () => { changed(); place(); });
ed.addEventListener('change', e => {
  if (e.target.type === 'checkbox') { e.target.checked ? e.target.setAttribute('checked', '') : e.target.removeAttribute('checked'); changed(); }
});
ed.addEventListener('keydown', e => {
  if (e.key === 'Tab') {
    const c = cellOf(); if (!c) return;
    e.preventDefault();
    if (e.shiftKey) { const p = c.previousElementSibling || (c.parentElement.previousElementSibling && c.parentElement.previousElementSibling.lastElementChild); if (p) goto(p); return; }
    let n = c.nextElementSibling;
    if (!n) { let tr = c.parentElement.nextElementSibling; if (!tr) { tr = newRow(c.parentElement.cells.length); c.parentElement.after(tr); changed(); } n = tr.firstElementChild; }
    goto(n); return;
  }
  if ((e.key === 'Backspace' || e.key === 'Delete') && sel) { e.preventDefault(); sel.remove(); deselect(); changed(); return; }
  if (e.metaKey && !e.shiftKey && !e.altKey) {
    const k = e.key.toLowerCase();
    const map = { b: 'bold', i: 'italic', u: 'underline' };
    if (map[k]) { e.preventDefault(); document.execCommand(map[k]); changed(); }
  }
});
ed.addEventListener('paste', e => {
  const cd = e.clipboardData; if (!cd) return;
  const html = cd.getData('text/html'), text = cd.getData('text/plain');
  if (/<table/i.test(html)) {
    const t = new DOMParser().parseFromString(html, 'text/html').querySelector('table');
    const rows = [...t.rows].map(r => [...r.cells].map(c => c.textContent.replace(/\s+/g, ' ').trim()));
    if (rows.length) { e.preventDefault(); ins(tableHTML(rows)); return; }
  }
  const img = [...cd.items].find(i => i.type.startsWith('image/'));
  if (img && !text.trim()) { e.preventDefault(); addFile(img.getAsFile()); return; }
  if (/\t/.test(text) && /\n/.test(text.trim())) {
    e.preventDefault(); ins(tableHTML(text.replace(/\r/g, '').replace(/\n+$/, '').split('\n').map(l => l.split('\t')))); return;
  }
});
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => {
  const files = [...(e.dataTransfer ? e.dataTransfer.files : [])].filter(f => f.type.startsWith('image/'));
  if (!files.length) return;
  e.preventDefault();
  const r = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (r && ed.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  files.forEach(addFile);
});

/* ---------- Swift 에서 호출하는 API ---------- */
const App = {
  load(p) { flush(); curId = p.id; ed.innerHTML = p.html; App.setColor(p.color); deselect(); window.scrollTo(0, 0); },
  setColor(c) { document.documentElement.style.background = document.body.style.background = c; },
  cmd(name, arg) { focusEd(); document.execCommand(name, false, arg || null); changed(); },
  heading() { focusEd(); document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock').toLowerCase() === 'h2' ? 'div' : 'h2'); changed(); },
  checklist() { ins('<div><input type="checkbox">&nbsp;</div>'); },
  addDataURL, flush, table: Table
};
</script>
</body></html>
"""#
