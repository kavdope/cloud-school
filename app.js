/* Cloud School: app engine. Plain JS, no dependencies, no network calls, works offline. Content scripts load first (see index.html). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const LEVELS = CS.levels.slice().sort((a, b) => a.n - b.n);
LEVELS.forEach(L => L.lessons.forEach((l, i) => { l.level = L.n; l.idx = i; }));
const LESSONS = LEVELS.flatMap(L => L.lessons);
const LMAP = Object.fromEntries(LESSONS.map(l => [l.id, l]));
const LVMAP = Object.fromEntries(LEVELS.map(L => [L.n, L]));
const GLOSSARY = CS.glossary.slice().sort((a, b) => a[1].localeCompare(b[1], 'en', {sensitivity: 'base'}));
const G = Object.fromEntries(GLOSSARY.map(g => [g[0], g]));
const LABS = CS.labs.slice().sort((a, b) => a.lv - b.lv);
const LABMAP = Object.fromEntries(LABS.map(x => [x.id, x]));
const CASES = CS.cases;
const CMAP = Object.fromEntries(CASES.map(x => [x.id, x]));
const PICK = CS.picker, PMAP = Object.fromEntries(PICK.map(x => [x.id, x]));
const CERTS = CS.certs, CEMAP = Object.fromEntries(CERTS.map(x => [x.id, x]));
const REPO = 'https://github.com/kavdope/cloud-school';
const FOOT = '<p class="foot">Unofficial study aid. Not affiliated with or endorsed by Google. <a href="#about">About &amp; disclaimer</a></p>';

/* ---------------- Mini markup ----------------
   blocks: "## h", "### h", "- list", "1. list", "> callout", "| table |", ``` code fences ```, else paragraph
   inline: **bold**, *italic*, `code`, [[termkey]] / [[termkey|text]], [text](#hash) internal links only */
function inline(s) {
  const codes = [];
  s = esc(s).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[\[([a-z0-9_]+)(?:\|([^\]]+))?\]\]/g, (m, k, t) => `<span class="term" data-t="${k}">${t || (G[k] ? esc(G[k][1]) : k)}</span>`)
    .replace(/\[([^\]]+)\]\((#[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
  return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[i]}</code>`);
}
function codeBlock(src) {
  const html = esc(src).split('\n').map(l => /^\s*#/.test(l) ? `<span class="cm">${l}</span>` : l).join('\n');
  return `<div class="code"><button class="cp" data-copy>Copy</button><pre><code>${html}</code></pre></div>`;
}
function table(rows) {
  const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const body = rows.filter(r => !/^\|[\s:|-]+\|$/.test(r));
  const [h, ...rest] = body;
  return `<div class="tw"><table><thead><tr>${cells(h).map(c => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rest.map(r => `<tr>${cells(r).map(c => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function md(src) {
  const out = [], lines = String(src || '').split('\n');
  let buf = [], kind = null, fence = null;
  const flush = () => {
    if (!buf.length) { kind = null; return; }
    if (kind === 'ul') out.push('<ul>' + buf.map(x => `<li>${inline(x.replace(/^- /, ''))}</li>`).join('') + '</ul>');
    else if (kind === 'ol') out.push('<ol>' + buf.map(x => `<li>${inline(x.replace(/^\d+\. /, ''))}</li>`).join('') + '</ol>');
    else if (kind === 'q') out.push(`<div class="callout">${inline(buf.map(x => x.replace(/^> ?/, '')).join(' '))}</div>`);
    else if (kind === 't') out.push(table(buf));
    else out.push(`<p>${inline(buf.join(' '))}</p>`);
    buf = []; kind = null;
  };
  for (const raw of lines) {
    if (fence !== null) { if (raw.trim().startsWith('```')) { out.push(codeBlock(fence.join('\n'))); fence = null; } else fence.push(raw); continue; }
    const ln = raw.trim();
    if (ln.startsWith('```')) { flush(); fence = []; continue; }
    if (!ln) { flush(); continue; }
    if (ln.startsWith('### ')) { flush(); out.push(`<h3>${inline(ln.slice(4))}</h3>`); continue; }
    if (ln.startsWith('## ')) { flush(); out.push(`<h2>${inline(ln.slice(3))}</h2>`); continue; }
    const k = ln.startsWith('- ') ? 'ul' : /^\d+\. /.test(ln) ? 'ol' : ln.startsWith('> ') ? 'q' : ln.startsWith('|') ? 't' : 'p';
    if (k !== kind) flush();
    kind = k; buf.push(ln);
  }
  if (fence !== null) out.push(codeBlock(fence.join('\n')));
  flush();
  return out.join('\n');
}

/* ---------------- State ---------------- */
const KEY = 'cloudschool.v1';
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
function load() {
  let s; try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  s = Object.assign({q: {}, cq: {}, read: {}, lab: {}, steps: {}, caseRead: {}, bm: {}, miss: {}, exams: [], days: [], last: null, open: {}, gf: ''}, s && typeof s === 'object' ? s : {});
  if (!s.days.includes(daysAgo(0))) s.days.push(daysAgo(0));
  s.days = s.days.slice(-400);
  return s;
}
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
save();
function streak() { let n = 0; while (S.days.includes(daysAgo(n))) n++; if (!n && S.days.includes(daysAgo(1))) { n = 1; while (S.days.includes(daysAgo(n + 1))) n++; } return n; }
const passed = id => (S.q[id] || 0) >= 80;
const levelDone = L => L.lessons.filter(l => passed(l.id)).length;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 1600); }

/* ---------------- Theme (light / dark / system) ---------------- */
const THEME_KEY = 'cloudschool.theme', DARK_MQ = matchMedia('(prefers-color-scheme: dark)');
const THEME_BAR = {light: '#000000', dark: '#141414'};
function themePref() { let t = null; try { t = localStorage.getItem(THEME_KEY); } catch (e) {} return t === 'light' || t === 'dark' ? t : 'system'; }
const themeNow = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
function applyTheme(pref) {
  if (pref) { try { if (pref === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, pref); } catch (e) {} }
  const p = themePref(), mode = p === 'system' ? (DARK_MQ.matches ? 'dark' : 'light') : p, el = document.documentElement;
  el.dataset.theme = mode; el.dataset.themePref = p;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', THEME_BAR[mode]));
  const b = document.getElementById('thbtn'); if (b) b.outerHTML = themeBtn();
  document.querySelectorAll('.seg.th button').forEach(x => x.classList.toggle('on', x.dataset.th === p));
}
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></svg>';
const themeBtn = () => { const d = themeNow() === 'dark'; return `<button class="thbtn" id="thbtn" aria-label="${d ? 'Switch to light mode' : 'Switch to dark mode'}" title="${d ? 'Light mode' : 'Dark mode'}" onclick="applyTheme(themeNow() === 'dark' ? 'light' : 'dark')">${d ? SUN : MOON}</button>`; };
const SEARCH_BTN = '<button class="sbtn" id="sbtn" aria-label="Search" title="Search (/)" onclick="location.hash=\'#search\'"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg></button>';
(DARK_MQ.addEventListener ? DARK_MQ.addEventListener.bind(DARK_MQ, 'change') : DARK_MQ.addListener.bind(DARK_MQ))(() => { if (themePref() === 'system') applyTheme(); });
applyTheme();
function setTop(title, left = '') { $('#tt').textContent = title; $('#tl').innerHTML = left; $('#tr').innerHTML = themeBtn() + SEARCH_BTN; }
const back = (href, t) => `<button onclick="location.hash='${href}'">‹ ${esc(t)}</button>`;

/* ---------------- Bookmarks ---------------- */
const BM_ICON = '<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-4-5 4z"/></svg>';
const bmBtn = key => `<button class="bm${S.bm[key] ? ' on' : ''}" data-bm="${esc(key)}" aria-label="Bookmark">${BM_ICON}<span>${S.bm[key] ? 'Saved' : 'Save'}</span></button>`;
function toggleBm(key, btn) {
  if (S.bm[key]) delete S.bm[key]; else S.bm[key] = Date.now();
  save();
  if (btn) { btn.classList.toggle('on', !!S.bm[key]); const s = btn.querySelector('span'); if (s) s.textContent = S.bm[key] ? 'Saved' : 'Save'; }
  toast(S.bm[key] ? 'Bookmarked' : 'Bookmark removed');
}
function bmInfo(key) {
  const [k, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (k === 'lesson' && LMAP[id]) return {k: 'Lesson ' + id, t: LMAP[id].t, h: '#lesson/' + id};
  if (k === 'lab' && LABMAP[id]) return {k: 'Lab', t: LABMAP[id].t, h: '#lab/' + id};
  if (k === 'case' && CMAP[id]) return {k: 'Case study', t: CMAP[id].t, h: '#case/' + id};
  if (k === 'term' && G[id]) return {k: 'Glossary', t: G[id][1], h: '#glossary/' + id};
  if (k === 'pick' && PMAP[id]) return {k: 'Service picker', t: PMAP[id].t, h: '#picker/' + id};
  return null;
}

/* ---------------- Views ---------------- */
const view = $('#view');
function setTab(t) { document.querySelectorAll('#tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === t)); }

function home() {
  setTop('Cloud School'); setTab('home');
  const done = LESSONS.filter(l => passed(l.id)).length, scores = Object.values(S.q), avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const labsDone = LABS.filter(x => S.lab[x.id]).length;
  const next = (S.last && LMAP[S.last] && !passed(S.last) ? LMAP[S.last] : null) || LESSONS.find(l => !passed(l.id));
  let h = `<h1>Learn Google Cloud</h1><p class="sub">${LEVELS.length} levels · ${LESSONS.length} lessons · ${totalQ()} quiz questions · ${LABS.length} labs · ${CASES.length} case studies</p>
  <div class="stats"><div><b>${done}<small class="sub">/${LESSONS.length}</small></b><span>Passed</span></div><div><b>${avg}%</b><span>Avg quiz</span></div><div><b>${labsDone}</b><span>Labs</span></div><div><b>${streak()}</b><span>Streak</span></div></div>
  <div class="bar" style="margin-top:8px"><i style="width:${pct(done, LESSONS.length)}%"></i></div>`;
  if (next) h += `<a class="cont" href="#lesson/${next.id}"><div><div class="k">${S.read[next.id] ? 'Continue' : 'Next up'} · Level ${next.level}</div><b style="font-size:13px">${esc(next.t)}</b></div><span class="go">Open ›</span></a>`;
  h += `<div class="grid2" style="margin-top:10px"><a class="card" href="#picker"><span class="k">Cheat sheet</span><b>Service picker</b><span class="ds">Which compute, DB, storage?</span></a><a class="card" href="#certs"><span class="k">Certifications</span><b>Exam map</b><span class="ds">CDL · ACE · PCA</span></a></div>`;
  h += `<div class="label">Curriculum</div><ul class="list">`;
  LEVELS.forEach(L => {
    const d = levelDone(L), all = d === L.lessons.length, open = S.open[L.n];
    h += `<li class="lvl${all ? ' done' : ''}${open ? ' open' : ''}" data-lv="${L.n}"><div class="it" data-toggle="${L.n}"><span class="n">${L.n}</span><span class="tx"><span class="nm">${esc(L.name)}</span><span class="ds">${esc(L.d)}</span><div class="bar"><i style="width:${pct(d, L.lessons.length)}%"></i></div></span><span class="meta">${d}/${L.lessons.length}</span></div><ul class="lessons">`;
    L.lessons.forEach(l => {
      const sc = S.q[l.id];
      h += `<li class="${passed(l.id) ? 'ok' : S.read[l.id] ? 'half' : ''}"><span class="d"></span><a href="#lesson/${l.id}">${l.id} · ${esc(l.t)}</a><span class="tag">${sc != null ? sc + '%' : l.m + ' min'}</span></li>`;
    });
    const labs = LABS.filter(x => x.lv === L.n);
    labs.forEach(x => { h += `<li class="${S.lab[x.id] ? 'ok' : ''}"><span class="d" style="border-radius:2px"></span><a href="#lab/${x.id}">Lab · ${esc(x.t)}</a><span class="tag">${x.min} min</span></li>`; });
    h += `</ul></li>`;
  });
  h += `</ul>` + FOOT;
  view.innerHTML = h;
  view.querySelectorAll('[data-toggle]').forEach(el => el.onclick = () => { const n = el.dataset.toggle; S.open[n] = !S.open[n]; save(); el.parentElement.classList.toggle('open', !!S.open[n]); });
}
const totalQ = () => LESSONS.reduce((a, l) => a + l.q.length, 0) + CASES.reduce((a, c) => a + c.q.length, 0);

function lesson(id) {
  const l = LMAP[id]; if (!l) return home();
  const L = LVMAP[l.level], i = LESSONS.indexOf(l), prev = LESSONS[i - 1], nx = LESSONS[i + 1];
  S.read[id] = 1; S.last = id; save();
  setTop('Lesson ' + id, back('#home', 'Learn')); setTab('home');
  const labs = LABS.filter(x => x.lv === l.level);
  let h = `<div class="lesson"><div class="crumb">Level ${L.n} · ${esc(L.name)} · ${l.m} min</div><div class="row" style="align-items:flex-start"><h1 class="grow">${esc(l.t)}</h1>${bmBtn('lesson:' + id)}</div>
  ${l.svc.length ? `<div class="chips">${l.svc.map(s => `<span class="chip" data-search="${esc(s)}">${esc(s)}</span>`).join('')}</div>` : ''}
  <p class="intro">${inline(l.intro)}</p>
  ${md(l.body)}
  <div class="sec">When to use it · and alternatives</div>${md(l.use)}
  <div class="sec">Real-world example</div>${md(l.ex)}
  <div class="sec">Commands</div>${codeBlock(l.cmd)}
  <div class="sec">Gotchas</div><ul class="gotcha">${l.gotchas.map(g => `<li>${inline(g)}</li>`).join('')}</ul>
  <div class="box dark" style="margin-top:18px"><div class="row"><div class="grow"><b>Lesson quiz</b><div style="font-size:12px;opacity:.75">${l.q.length} questions · pass at 80%${S.q[id] != null ? ' · best ' + S.q[id] + '%' : ''}</div></div><a class="btn ghost sm" href="#quiz/${id}">${S.q[id] != null ? 'Retake' : 'Start'}</a></div></div>
  ${labs.length ? `<div class="label">Hands-on for this level</div>` + labs.map(x => `<a class="card" href="#lab/${x.id}"><span class="k">Lab · ${x.min} min</span><b>${esc(x.t)}</b></a>`).join('') : ''}
  <div class="row" style="margin-top:16px">${prev ? `<a class="btn ghost grow" href="#lesson/${prev.id}">‹ ${prev.id}</a>` : '<span class="grow"></span>'}${nx ? `<a class="btn ghost grow" href="#lesson/${nx.id}">${nx.id} ›</a>` : '<span class="grow"></span>'}</div></div>` + FOOT;
  view.innerHTML = h;
}

/* ---------------- Quiz engine ---------------- */
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0 || 1; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shuffle(a, r = Math.random) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/* question item: {id, q, o, a, e, src, srcH} ; options shown in a stable shuffled order per question */
const lessonItems = l => l.q.map((q, i) => ({id: 'L' + l.id + ':' + i, q: q[0], o: q[1], a: q[2], e: q[3], src: 'Lesson ' + l.id + ' · ' + l.t, srcH: '#lesson/' + l.id}));
const caseItems = c => c.q.map((q, i) => ({id: 'C' + c.id + ':' + i, q: q[0], o: q[1], a: q[2], e: q[3], src: 'Case · ' + c.t, srcH: '#case/' + c.id}));
const ALLQ = () => LESSONS.flatMap(lessonItems).concat(CASES.flatMap(caseItems));
let QZ = null;
function startQuiz(key, items, title, backH, opts = {}) {
  QZ = {key, title, backH, items: items.map(it => { const order = shuffle(it.o.map((_, k) => k), rng(hash(it.id))); return Object.assign({}, it, {order}); }), i: 0, picked: [], opts};
  renderQuiz();
}
function renderQuiz() {
  const Z = QZ; setTop(Z.title, back(Z.backH, 'Back'));
  if (Z.i >= Z.items.length) return quizDone();
  const it = Z.items[Z.i], p = Z.picked[Z.i];
  let h = `<div class="dots">${Z.items.map((x, k) => `<i class="${k < Z.i || (k === Z.i && p != null) ? (Z.picked[k] === x.a ? 'r' : 'w') : k === Z.i ? 'c' : ''}"></i>`).join('')}</div>
  <div class="q"><div class="qn">Question ${Z.i + 1} of ${Z.items.length}${Z.opts.showSrc ? ' · ' + esc(it.src) : ''}</div><div class="qt">${inline(it.q)}</div>`;
  it.order.forEach(k => {
    const cls = p == null ? '' : k === it.a ? ' right' : k === p ? ' wrong' : '';
    h += `<button class="opt${cls}" data-k="${k}"${p != null ? ' disabled' : ''}>${inline(it.o[k])}</button>`;
  });
  if (p != null) h += `<div class="explain"><b>${p === it.a ? 'Correct.' : 'Not quite.'}</b> ${inline(it.e)}<a class="src" href="${it.srcH}">${esc(it.src)} ›</a></div><button class="btn block" id="qnext">${Z.i + 1 < Z.items.length ? 'Next' : 'See score'}</button>`;
  h += `</div>`;
  view.innerHTML = h; window.scrollTo(0, 0);
  view.querySelectorAll('.opt:not([disabled])').forEach(b => b.onclick = () => {
    const k = +b.dataset.k; Z.picked[Z.i] = k;
    if (k === it.a) delete S.miss[it.id]; else S.miss[it.id] = Date.now();
    save(); renderQuiz(); const e = $('.explain'); if (e) e.scrollIntoView({block: 'nearest'});
  });
  const nb = $('#qnext'); if (nb) nb.onclick = () => { Z.i++; renderQuiz(); };
}
function quizDone() {
  const Z = QZ, right = Z.items.filter((x, k) => Z.picked[k] === x.a).length, sc = pct(right, Z.items.length);
  const [kind, id] = Z.key.split('/');
  if (kind === 'lesson') S.q[id] = Math.max(S.q[id] || 0, sc);
  if (kind === 'case') S.cq[id] = Math.max(S.cq[id] || 0, sc);
  if (kind === 'exam') { S.exams.push({k: id, s: sc, n: Z.items.length, t: Date.now()}); S.exams = S.exams.slice(-50); }
  save();
  const wrong = Z.items.filter((x, k) => Z.picked[k] !== x.a);
  let h = `<div class="score"><span class="sub">${esc(Z.title)}</span><b>${sc}%</b><span class="sub">${right} of ${Z.items.length} correct${kind === 'lesson' ? (sc >= 80 ? ' · passed' : ' · 80% to pass') : ''}</span></div>`;
  if (wrong.length) h += `<div class="label">Review</div>` + wrong.map(x => `<div class="box"><b style="font-size:13px">${inline(x.q)}</b><p style="font-size:12.5px;margin:4px 0 0">Answer: <b>${inline(x.o[x.a])}</b></p><p class="sub" style="margin:4px 0 0">${inline(x.e)}</p><a class="sub" href="${x.srcH}">${esc(x.src)} ›</a></div>`).join('');
  h += `<div class="row" style="margin-top:12px"><button class="btn ghost grow" id="qagain">Try again</button>`;
  if (kind === 'lesson') { const nx = LESSONS[LESSONS.indexOf(LMAP[id]) + 1]; h += nx ? `<a class="btn grow" href="#lesson/${nx.id}">Next lesson ›</a>` : `<a class="btn grow" href="#home">Done</a>`; }
  else h += `<a class="btn grow" href="${Z.backH}">Done</a>`;
  h += `</div>`;
  view.innerHTML = h; window.scrollTo(0, 0);
  $('#qagain').onclick = () => { if (Z.opts.regen) { const n = Z.opts.regen(); startQuiz(Z.key, n, Z.title, Z.backH, Z.opts); } else startQuiz(Z.key, Z.items, Z.title, Z.backH, Z.opts); };
}

/* ---------------- Labs ---------------- */
function labsList() {
  setTop('Labs'); setTab('labs');
  const done = LABS.filter(x => S.lab[x.id]).length;
  let h = `<h1>Hands-on labs</h1><p class="sub">${LABS.length} step-by-step labs · ${done} completed. Use the free trial or Free Tier, and always run the cleanup step.</p>
  <div class="callout">Labs run in <b>your own</b> Google Cloud project. Use a dedicated learning project with a budget alert. Commands assume Cloud Shell.</div><ul class="list">`;
  LABS.forEach(x => {
    const st = S.steps[x.id] || {}, n = x.steps.filter((_, k) => st[k]).length;
    h += `<li class="${S.lab[x.id] ? 'done' : ''}"><a class="it" href="#lab/${x.id}"><span class="n${S.lab[x.id] ? ' f' : ''}">${S.lab[x.id] ? '✓' : x.lv}</span><span class="tx"><span class="nm">${esc(x.t)}</span><span class="ds">Level ${x.lv} · ${x.min} min · ${esc(x.svc.join(', '))}</span></span><span class="meta">${n}/${x.steps.length}</span></a></li>`;
  });
  view.innerHTML = h + '</ul>' + FOOT;
}
function lab(id) {
  const x = LABMAP[id]; if (!x) return labsList();
  setTop('Lab', back('#labs', 'Labs')); setTab('labs');
  const st = S.steps[id] = S.steps[id] || {};
  let h = `<div class="lesson"><div class="crumb">Lab · Level ${x.lv} · ${esc(LVMAP[x.lv] ? LVMAP[x.lv].name : '')} · ~${x.min} min</div><div class="row" style="align-items:flex-start"><h1 class="grow">${esc(x.t)}</h1>${bmBtn('lab:' + id)}</div>
  <div class="chips">${x.svc.map(s => `<span class="chip" data-search="${esc(s)}">${esc(s)}</span>`).join('')}</div>
  <div class="box"><div class="kv" style="border:0;padding-top:0"><span>Goal</span></div><p style="margin:0">${inline(x.goal)}</p></div>
  <div class="box"><div class="kv" style="border:0;padding-top:0"><span>Cost</span></div><p style="margin:0">${inline(x.cost)}</p></div>
  <div class="sec">Steps</div>`;
  x.steps.forEach((s, k) => {
    h += `<div class="step${st[k] ? ' done' : ''}" data-step="${k}"><div class="sh"><button class="ck${st[k] ? ' on' : ''}" data-ck="${k}" aria-label="Mark step ${k + 1} done"></button><b>${k + 1}. ${inline(s.t)}</b></div><div class="sb">${md(s.b)}</div></div>`;
  });
  h += `<div class="sec">Verify</div>${md(x.verify)}<div class="sec">Cleanup · avoid charges</div><div class="box">${md(x.cleanup)}</div>
  <button class="btn block" id="labdone" style="margin-top:14px">${S.lab[id] ? 'Completed ✓ (tap to undo)' : 'Mark lab complete'}</button></div>` + FOOT;
  view.innerHTML = h;
  view.querySelectorAll('[data-ck]').forEach(b => b.onclick = () => { const k = b.dataset.ck; st[k] = !st[k]; save(); b.classList.toggle('on', st[k]); b.closest('.step').classList.toggle('done', st[k]); });
  $('#labdone').onclick = () => { S.lab[id] = !S.lab[id]; save(); lab(id); };
}

/* ---------------- Case studies + diagram renderer ---------------- */
function diagram(D) {
  const W = 360, H = D.h || 300, NW = 96, NH = 32;
  const nodes = Object.fromEntries(D.n.map(n => [n.id, n]));
  const lines = s => String(s).split('\\n');
  let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Architecture diagram"><defs><marker id="ar" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L8 4L0 8z"/></marker></defs>`;
  D.g.forEach(g => { s += `<g class="gp"><rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" rx="6"/><text x="${g.x + 5}" y="${g.y + 10}" font-size="7.5">${esc(g.l)}</text></g>`; });
  D.e.forEach(e => {
    const a = nodes[e.a], b = nodes[e.b], dx = b.x - a.x, dy = b.y - a.y;
    const clip = (n, sx, sy) => { const hw = NW / 2 + 2, hh = NH / 2 + 2, t = Math.min(dx ? hw / Math.abs(dx) : 1e9, dy ? hh / Math.abs(dy) : 1e9); return [n.x + sx * dx * t, n.y + sy * dy * t]; };
    const [x1, y1] = clip(a, 1, 1), [x2, y2] = clip(b, -1, -1);
    s += `<g class="eg${e.d ? ' dash' : ''}"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" marker-end="url(#ar)"/>`;
    if (e.l) { const w = e.l.length * 3.9 + 6, seg = Math.hypot(x2 - x1, y2 - y1), flat = Math.abs(y2 - y1) < 4;
      const mx = (x1 + x2) / 2, my = flat && seg < w + 8 ? Math.min(y1, y2) - NH / 2 - 8 : (y1 + y2) / 2; s += `<rect x="${(mx - w / 2).toFixed(1)}" y="${(my - 5.5).toFixed(1)}" width="${w.toFixed(1)}" height="11" rx="2"/><text x="${mx.toFixed(1)}" y="${(my + 2.6).toFixed(1)}" font-size="7" text-anchor="middle">${esc(e.l)}</text>`; }
    s += `</g>`;
  });
  D.n.forEach(n => {
    const ls = lines(n.l), y0 = n.y - (ls.length - 1) * 5;
    s += `<g class="nd ${esc(n.k)}"><rect x="${n.x - NW / 2}" y="${n.y - NH / 2}" width="${NW}" height="${NH}" rx="${n.k === 'user' ? 16 : 5}"/>${ls.map((t, k) => `<text x="${n.x}" y="${y0 + k * 10 + 3}" font-size="8.5" text-anchor="middle"${k === 0 ? ' font-weight="600"' : ''}>${esc(t)}</text>`).join('')}</g>`;
  });
  return `<div class="dia">${s}</svg></div>`;
}
function casesList() {
  setTop('Case studies'); setTab('cases');
  let h = `<h1>Corporate case studies</h1><p class="sub">Architecture scenarios with requirements, diagrams, tradeoffs and exam angles. Scenarios are fictional examples unless stated otherwise.</p>`;
  CASES.forEach(c => { h += `<a class="card" href="#case/${c.id}"><span class="k">${esc(c.ind)} · ${esc(c.kind)}${S.cq[c.id] != null ? ' · quiz ' + S.cq[c.id] + '%' : ''}</span><b>${esc(c.t)}</b><span class="ds">${esc(c.sum)}</span></a>`; });
  view.innerHTML = h + FOOT;
}
function caseView(id) {
  const c = CMAP[id]; if (!c) return casesList();
  S.caseRead[id] = 1; save();
  setTop('Case study', back('#cases', 'Cases')); setTab('cases');
  view.innerHTML = `<div class="lesson"><div class="crumb">${esc(c.ind)} · <span class="badge">${esc(c.kind)}</span></div><div class="row" style="align-items:flex-start"><h1 class="grow">${esc(c.t)}</h1>${bmBtn('case:' + id)}</div><p class="intro">${inline(c.sum)}</p>
  <div class="sec">Scenario</div>${md(c.scenario)}<div class="sec">Requirements</div>${md(c.req)}<div class="sec">Architecture</div>${diagram(c.dia)}${md(c.flow)}
  <div class="sec">Services chosen · and why</div>${md(c.svc)}<div class="sec">Tradeoffs</div>${md(c.trade)}<div class="sec">Exam angle</div>${md(c.exam)}
  <div class="box dark" style="margin-top:18px"><div class="row"><div class="grow"><b>Case quiz</b><div style="font-size:12px;opacity:.75">${c.q.length} questions${S.cq[id] != null ? ' · best ' + S.cq[id] + '%' : ''}</div></div><a class="btn ghost sm" href="#caseq/${id}">Start</a></div></div></div>` + FOOT;
}

/* ---------------- Practice ---------------- */
function practice() {
  setTop('Practice'); setTab('practice');
  const miss = Object.keys(S.miss).length, bmL = Object.keys(S.bm).filter(k => k.startsWith('lesson:')).length;
  let h = `<h1>Practice</h1><p class="sub">${totalQ()} questions across lessons and case studies.</p><div class="label">Exam-style sets</div>`;
  CERTS.forEach(c => { const last = S.exams.filter(e => e.k === c.id).slice(-1)[0]; h += `<a class="card" href="#exam/${c.id}"><span class="k">${esc(c.tier)} · ${c.n} questions${last ? ' · last ' + last.s + '%' : ''}</span><b>${esc(c.name)} practice set</b><span class="ds">Drawn from levels ${c.levels.join(', ')}</span></a>`; });
  h += `<div class="label">Quick sets</div>
  <a class="card" href="#exam/mixed"><span class="k">20 questions</span><b>Mixed review</b><span class="ds">Random questions from everything</span></a>
  <a class="card" href="#exam/missed"><span class="k">${miss} questions</span><b>Missed questions</b><span class="ds">Questions you answered wrong last time</span></a>
  <a class="card" href="#exam/saved"><span class="k">${bmL} saved lessons</span><b>Bookmarked lessons</b><span class="ds">Quiz only on lessons you saved</span></a>
  <div class="label">By level</div><ul class="list">`;
  LEVELS.forEach(L => { h += `<li><a class="it" href="#exam/lv${L.n}"><span class="n">${L.n}</span><span class="tx"><span class="nm">${esc(L.name)}</span></span><span class="meta">${L.lessons.reduce((a, l) => a + l.q.length, 0)} Q ›</span></a></li>`; });
  h += `</ul>`;
  if (S.exams.length) h += `<div class="label">Recent results</div>` + S.exams.slice(-8).reverse().map(e => `<div class="kv"><span>${esc(examTitle(e.k))} · ${new Date(e.t).toLocaleDateString()}</span><b>${e.s}% <small class="sub">(${e.n})</small></b></div>`).join('');
  view.innerHTML = h + FOOT;
}
function examTitle(k) { if (CEMAP[k]) return CEMAP[k].name; if (k === 'mixed') return 'Mixed review'; if (k === 'missed') return 'Missed questions'; if (k === 'saved') return 'Bookmarked lessons'; if (/^lv\d+$/.test(k)) return 'Level ' + k.slice(2); return k; }
function examItems(k) {
  const all = ALLQ();
  if (CEMAP[k]) { const c = CEMAP[k], ok = new Set(c.levels); const pool = all.filter(x => x.id[0] === 'L' ? ok.has(LMAP[x.id.slice(1).split(':')[0]].level) : c.cases); return shuffle(pool).slice(0, c.n); }
  if (k === 'mixed') return shuffle(all).slice(0, 20);
  if (k === 'missed') return shuffle(all.filter(x => S.miss[x.id])).slice(0, 25);
  if (k === 'saved') return shuffle(all.filter(x => x.id[0] === 'L' && S.bm['lesson:' + x.id.slice(1).split(':')[0]])).slice(0, 20);
  if (/^lv\d+$/.test(k)) { const n = +k.slice(2); return shuffle(all.filter(x => x.id[0] === 'L' && LMAP[x.id.slice(1).split(':')[0]].level === n)).slice(0, 20); }
  return [];
}
function exam(k) {
  const items = examItems(k);
  if (!items.length) { setTop('Practice', back('#practice', 'Practice')); view.innerHTML = `<div class="empty">Nothing here yet. ${k === 'missed' ? 'Questions you get wrong will show up here.' : k === 'saved' ? 'Bookmark lessons to quiz on them.' : ''}</div>`; return; }
  startQuiz('exam/' + k, items, examTitle(k), '#practice', {showSrc: true, regen: () => examItems(k)});
}

/* ---------------- Glossary ---------------- */
function glossary(focus) {
  setTop('Glossary'); setTab('glossary');
  view.innerHTML = `<h1>Glossary</h1><p class="sub">${GLOSSARY.length} Google Cloud terms</p><input class="search" id="gq" placeholder="Filter terms" value="${esc(S.gf || '')}" autocomplete="off" style="margin:10px 0 4px"><div id="gl"></div>` + FOOT;
  const draw = () => {
    const q = $('#gq').value.trim().toLowerCase(); S.gf = q; save();
    const list = GLOSSARY.filter(g => !q || g[1].toLowerCase().includes(q) || g[2].toLowerCase().includes(q));
    $('#gl').innerHTML = list.length ? list.map(g => `<div class="gl" id="g-${g[0]}"><div class="row"><b class="grow">${esc(g[1])}</b>${bmBtn('term:' + g[0])}</div><p>${inline(g[2])}</p></div>`).join('') : '<div class="empty">No matching terms</div>';
  };
  $('#gq').oninput = draw; draw();
  if (focus && G[focus]) { $('#gq').value = ''; draw(); const el = $('#g-' + focus); if (el) { el.scrollIntoView({block: 'center'}); el.style.background = 'var(--soft)'; } }
}

/* ---------------- Service picker ---------------- */
function pickerHome() {
  setTop('Service picker', back('#more', 'More')); setTab('more');
  let h = `<h1>Service picker</h1><p class="sub">Cheat sheets for choosing the right Google Cloud service. Each has a quick decision tree and a comparison table.</p>`;
  PICK.forEach(p => { h += `<a class="card" href="#picker/${p.id}"><span class="k">${p.rows.length} options</span><b>${esc(p.t)}</b><span class="ds">${esc(p.d)}</span></a>`; });
  view.innerHTML = h + FOOT;
}
function picker(id) {
  const p = PMAP[id]; if (!p) return pickerHome();
  setTop('Picker', back('#picker', 'Picker')); setTab('more');
  let h = `<div class="lesson"><div class="row" style="align-items:flex-start"><h1 class="grow">${esc(p.t)}</h1>${bmBtn('pick:' + id)}</div><p class="sub">${esc(p.d)}</p>
  <div class="sec">Decision helper</div><div id="tree" class="tree"></div>
  <div class="sec">Compare</div><div class="tw"><table><thead><tr>${p.cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${p.rows.map(r => `<tr>${r.map((c, k) => `<td>${k ? inline(c) : '<b>' + inline(c) + '</b>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  ${p.notes ? `<div class="sec">Rules of thumb</div>${md(p.notes)}` : ''}</div>` + FOOT;
  view.innerHTML = h;
  const tree = $('#tree'), path = [];
  const draw = node => {
    if (typeof node === 'string') { tree.innerHTML = `<div class="result"><span class="sub">Recommended</span><b>${inline(node.split('|')[0])}</b>${node.includes('|') ? `<p class="sub" style="margin:4px 0 0">${inline(node.split('|')[1])}</p>` : ''}</div><button class="btn ghost sm" id="trs">Start over</button>`; $('#trs').onclick = () => draw(p.tree); return; }
    tree.innerHTML = `<p style="font-weight:600;margin-bottom:8px">${inline(node.q)}</p>` + node.a.map((a, k) => `<button class="opt" data-k="${k}"><span>${inline(a[0])}</span><span>›</span></button>`).join('') + (node !== p.tree ? `<button class="btn ghost sm" id="trs">Start over</button>` : '');
    tree.querySelectorAll('.opt').forEach(b => b.onclick = () => draw(node.a[+b.dataset.k][1]));
    const r = $('#trs'); if (r) r.onclick = () => draw(p.tree);
  };
  draw(p.tree);
}

/* ---------------- Certifications ---------------- */
function certs() {
  setTop('Certifications', back('#more', 'More')); setTab('more');
  let h = `<h1>Certification map</h1><p class="sub">How the curriculum maps to Google Cloud certifications. Exam guides change, so always check the official guide before you book.</p>`;
  CERTS.forEach(c => {
    const ls = LESSONS.filter(l => c.levels.includes(l.level)), d = ls.filter(l => passed(l.id)).length;
    h += `<div class="box"><div class="row"><div class="grow"><span class="badge${c.tier === 'Professional' ? ' f' : ''}">${esc(c.tier)}</span> <b style="font-size:14px">${esc(c.name)}</b></div><span class="sub">${d}/${ls.length}</span></div><div class="bar" style="margin:6px 0 8px"><i style="width:${pct(d, ls.length)}%"></i></div>
    <p style="font-size:12.5px">${inline(c.who)}</p><div class="label" style="margin-top:8px">Exam areas → where to study</div>
    ${c.domains.map(dm => `<div class="kv" style="display:block"><b style="font-size:12.5px">${esc(dm[0])}</b><div class="chips">${dm[1].map(n => `<a class="chip" href="${String(n).includes('-') ? '#lesson/' + n : '#home'}" ${String(n).includes('-') ? '' : `data-open="${n}"`}>${String(n).includes('-') ? 'Lesson ' + n : 'Level ' + n}</a>`).join('')}</div></div>`).join('')}
    <div class="label">Tips</div><ul style="padding-left:18px;font-size:12.5px">${c.tips.map(t => `<li>${inline(t)}</li>`).join('')}</ul>
    <a class="btn block" style="margin-top:10px" href="#exam/${c.id}">Take a ${c.n}-question practice set</a></div>`;
  });
  view.innerHTML = h + FOOT;
  view.querySelectorAll('[data-open]').forEach(a => a.onclick = () => { S.open[a.dataset.open] = true; save(); });
}

/* ---------------- More, bookmarks, progress, about ---------------- */
function more() {
  setTop('More'); setTab('more');
  const nb = Object.keys(S.bm).length;
  view.innerHTML = `<h1>More</h1><ul class="list" style="margin-top:10px">
  ${[['#picker', 'Service picker', 'Which compute, database, storage, network or data service to choose'], ['#certs', 'Certification map', 'Cloud Digital Leader, Associate Cloud Engineer, Professional Cloud Architect'], ['#bookmarks', 'Bookmarks', nb + ' saved'], ['#progress', 'Progress', 'Scores by level, labs, case studies'], ['#settings', 'Settings', 'Appearance, reset progress'], ['#about', 'About & disclaimer', 'Unofficial study aid, privacy, sources']].map(r => `<li><a class="it" href="${r[0]}"><span class="tx"><span class="nm">${r[1]}</span><span class="ds">${esc(r[2])}</span></span><span class="meta">›</span></a></li>`).join('')}</ul>` + FOOT;
}
function bookmarks() {
  setTop('Bookmarks', back('#more', 'More')); setTab('more');
  const keys = Object.keys(S.bm).sort((a, b) => S.bm[b] - S.bm[a]).map(k => [k, bmInfo(k)]).filter(x => x[1]);
  view.innerHTML = `<h1>Bookmarks</h1><p class="sub">Tap Save on any lesson, lab, case, term or picker.</p>` + (keys.length ? keys.map(([k, b]) => `<div class="row" style="border-bottom:1px solid var(--line)"><a class="hit grow" style="border:0" href="${b.h}"><span class="k">${esc(b.k)}</span><b>${esc(b.t)}</b></a>${bmBtn(k)}</div>`).join('') : '<div class="empty">No bookmarks yet.</div>') + FOOT;
}
function progress() {
  setTop('Progress', back('#more', 'More')); setTab('more');
  let h = `<h1>Progress</h1><div class="stats"><div><b>${Object.keys(S.read).filter(k => LMAP[k]).length}</b><span>Read</span></div><div><b>${LESSONS.filter(l => passed(l.id)).length}</b><span>Passed</span></div><div><b>${LABS.filter(x => S.lab[x.id]).length}/${LABS.length}</b><span>Labs</span></div><div><b>${Object.keys(S.caseRead).length}/${CASES.length}</b><span>Cases</span></div></div><div class="label">By level</div>`;
  LEVELS.forEach(L => { const sc = L.lessons.map(l => S.q[l.id]).filter(x => x != null), avg = sc.length ? Math.round(sc.reduce((a, b) => a + b, 0) / sc.length) : null; h += `<div class="kv"><span>${L.n} · ${esc(L.name)}</span><b>${levelDone(L)}/${L.lessons.length}${avg != null ? ' · ' + avg + '%' : ''}</b></div>`; });
  view.innerHTML = h + FOOT;
}
function settings() {
  setTop('Settings', back('#more', 'More')); setTab('more');
  const p = themePref();
  view.innerHTML = `<h1>Settings</h1><div class="label">Appearance</div><div class="seg th" id="thseg">${['light', 'dark', 'system'].map(t => `<button data-th="${t}" class="${p === t ? 'on' : ''}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div><p class="sub" style="margin-top:6px">System follows your device setting.</p>
  <div class="label">Data</div><p class="sub">Progress is stored only on this device (localStorage). Nothing is sent anywhere.</p><div class="row wrap"><button class="btn ghost" id="exp">Export progress</button><button class="btn ghost" id="rst">Reset progress</button></div>` + FOOT;
  view.querySelectorAll('#thseg button').forEach(b => b.onclick = () => applyTheme(b.dataset.th));
  $('#rst').onclick = () => { if (confirm('Reset all progress, bookmarks and scores on this device?')) { S = load.call(null, localStorage.removeItem(KEY)); save(); toast('Progress reset'); } };
  $('#exp').onclick = () => { const a = document.createElement('a'); a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(S)); a.download = 'cloud-school-progress.json'; a.click(); };
}
const DISCLAIMER = `Cloud School is an **unofficial, independent study aid**. It is **not affiliated with, endorsed by, or sponsored by Google LLC**. Google Cloud, GCP, BigQuery, Gemini and related names are trademarks of Google LLC.

Content reflects Google Cloud as understood in late 2026, but cloud services change often. Always confirm details, quotas, prices and exam guides in the official Google Cloud documentation before relying on them. Pricing is described qualitatively on purpose.

Labs create real resources in **your own** Google Cloud account and can incur charges. You are responsible for costs. Use a dedicated project, set a budget alert, and run every cleanup step.

Case studies are **fictional examples** written for learning unless a case explicitly says otherwise.`;
function about() {
  setTop('About', back('#more', 'More')); setTab('more');
  view.innerHTML = `<div class="lesson"><h1>About Cloud School</h1><p class="sub">Version 1 · offline PWA</p>${md(DISCLAIMER)}
  <div class="sec">Privacy</div><p>No accounts, no trackers, no analytics, no ads and no external requests. Fonts are system fonts. Everything is cached on your device for offline use.</p>
  <div class="sec">Install on iPhone</div><ol><li>Open the site in Safari.</li><li>Tap Share, then <b>Add to Home Screen</b>.</li><li>Launch it from the home screen; it works offline after the first load.</li></ol>
  <div class="sec">Contents</div><p>${LEVELS.length} levels, ${LESSONS.length} lessons, ${totalQ()} quiz questions, ${LABS.length} labs, ${CASES.length} case studies, ${GLOSSARY.length} glossary terms, ${PICK.length} service pickers.</p></div>` + FOOT;
}
function maybeAck() {
  let a = null; try { a = localStorage.getItem('cloudschool.ack'); } catch (e) {}
  if (a) return;
  const m = document.createElement('div'); m.className = 'modal'; m.id = 'ack';
  m.innerHTML = `<div class="sheet lesson"><h1>Welcome to Cloud School</h1>${md(DISCLAIMER)}<button class="btn block" id="ackok">Got it</button></div>`;
  document.body.appendChild(m);
  $('#ackok').onclick = () => { try { localStorage.setItem('cloudschool.ack', '1'); } catch (e) {} m.remove(); };
}

/* ---------------- Search ---------------- */
let IDX = null;
const plain = s => String(s || '').replace(/\[\[([a-z0-9_]+)(?:\|([^\]]+))?\]\]/g, (m, k, t) => t || (G[k] ? G[k][1] : k)).replace(/[*`#>|]/g, ' ').replace(/\s+/g, ' ');
function buildIdx() {
  IDX = [];
  LESSONS.forEach(l => IDX.push({g: 'Lessons', k: 'Lesson ' + l.id, t: l.t, h: '#lesson/' + l.id, body: plain([l.svc.join(' '), l.intro, l.body, l.use, l.ex, l.cmd, l.gotchas.join(' ')].join(' '))}));
  LABS.forEach(x => IDX.push({g: 'Labs', k: 'Lab', t: x.t, h: '#lab/' + x.id, body: plain([x.svc.join(' '), x.goal, x.steps.map(s => s.t + ' ' + s.b).join(' '), x.verify, x.cleanup].join(' '))}));
  CASES.forEach(c => IDX.push({g: 'Case studies', k: c.ind, t: c.t, h: '#case/' + c.id, body: plain([c.sum, c.scenario, c.req, c.svc, c.flow, c.trade, c.exam].join(' '))}));
  PICK.forEach(p => IDX.push({g: 'Service picker', k: 'Picker', t: p.t, h: '#picker/' + p.id, body: plain(p.d + ' ' + p.rows.map(r => r.join(' ')).join(' ') + ' ' + (p.notes || ''))}));
  GLOSSARY.forEach(g => IDX.push({g: 'Glossary', k: 'Term', t: g[1], h: '#glossary/' + g[0], body: plain(g[2])}));
  IDX.forEach(x => { x.lt = x.t.toLowerCase(); x.lb = x.body.toLowerCase(); });
}
function searchAll(q) {
  if (!IDX) buildIdx();
  const toks = q.toLowerCase().split(/\s+/).filter(Boolean); if (!toks.length) return [];
  return IDX.map(x => { let sc = 0; for (const t of toks) { const inT = x.lt.includes(t), inB = x.lb.includes(t); if (!inT && !inB) return null; sc += inT ? 10 : 0; sc += inB ? Math.min(5, x.lb.split(t).length - 1) : 0; } if (x.lt === q.toLowerCase()) sc += 30; return [sc, x]; }).filter(Boolean).sort((a, b) => b[0] - a[0]).map(r => r[1]);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hl = (text, toks) => toks.length ? esc(text).replace(new RegExp('(' + toks.map(t => reEsc(esc(t))).join('|') + ')', 'gi'), '<mark>$1</mark>') : esc(text);
function snippet(body, toks) { const lb = body.toLowerCase(), i = Math.max(0, lb.indexOf(toks[0]) - 50); return (i ? '…' : '') + body.slice(i, i + 140) + '…'; }
let SQ = '';
function search() {
  setTop('Search', back('#home', 'Learn'));
  view.innerHTML = `<input class="search" id="sq" type="search" placeholder="Search lessons, labs, cases, glossary" value="${esc(SQ)}" autocomplete="off" autocapitalize="off" spellcheck="false"><div id="sr" style="margin-top:8px"></div>`;
  const inp = $('#sq');
  const draw = () => {
    SQ = inp.value; const toks = SQ.toLowerCase().split(/\s+/).filter(Boolean), res = searchAll(SQ);
    if (!toks.length) { $('#sr').innerHTML = `<div class="label">Try</div><div class="chips">${['BigQuery partitioning', 'service account', 'Cloud Run', 'Spanner', 'VPC Service Controls', 'Cloud NAT', 'CUD', 'Terraform', 'Autopilot', 'SLO'].map(s => `<span class="chip" data-search="${s}">${s}</span>`).join('')}</div>`; return; }
    if (!res.length) { $('#sr').innerHTML = '<div class="empty">No results</div>'; return; }
    const groups = {}; res.slice(0, 60).forEach(x => (groups[x.g] = groups[x.g] || []).push(x));
    $('#sr').innerHTML = `<p class="sub">${res.length} results</p>` + Object.entries(groups).map(([g, xs]) => `<div class="label">${g}</div>` + xs.map(x => `<a class="hit" href="${x.h}"><span class="k">${esc(x.k)}</span><b>${hl(x.t, toks)}</b><span>${hl(snippet(x.body, toks), toks)}</span></a>`).join('')).join('');
  };
  inp.oninput = draw; draw(); setTimeout(() => inp.focus(), 50);
}

/* ---------------- Global interactions ---------------- */
document.addEventListener('click', e => {
  const cp = e.target.closest('[data-copy]');
  if (cp) { const t = cp.parentElement.querySelector('code').innerText; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { cp.textContent = 'Copied'; setTimeout(() => cp.textContent = 'Copy', 1200); }).catch(() => { const r = document.createRange(); r.selectNodeContents(cp.parentElement.querySelector('code')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }); return; }
  const bm = e.target.closest('[data-bm]'); if (bm) { toggleBm(bm.dataset.bm, bm); return; }
  const sr = e.target.closest('[data-search]'); if (sr) { SQ = sr.dataset.search; if (location.hash === '#search') search(); else location.hash = '#search'; return; }
  const old = $('.pop'); if (old) old.remove();
  const t = e.target.closest('.term');
  if (t && G[t.dataset.t]) {
    const g = G[t.dataset.t], p = document.createElement('div'); p.className = 'pop'; p.innerHTML = `<b>${esc(g[1])}</b>${inline(g[2])}`;
    document.body.appendChild(p); const r = t.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left)) + 'px'; p.style.top = (r.bottom + 6 + p.offsetHeight > innerHeight ? r.top - p.offsetHeight - 6 : r.bottom + 6) + 'px';
  }
});
document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); location.hash = '#search'; } });

/* ---------------- Router ---------------- */
function route() {
  const old = $('.pop'); if (old) old.remove();
  const h = location.hash.slice(1) || 'home', [a, b] = [h.split('/')[0], h.split('/').slice(1).join('/')];
  const R = {home, lesson: () => lesson(b), quiz: () => { const l = LMAP[b]; if (!l) return home(); startQuiz('lesson/' + b, lessonItems(l), 'Quiz ' + b, '#lesson/' + b); },
    labs: labsList, lab: () => lab(b), cases: casesList, case: () => caseView(b), caseq: () => { const c = CMAP[b]; if (!c) return casesList(); startQuiz('case/' + b, caseItems(c), 'Case quiz', '#case/' + b); },
    practice, exam: () => exam(b), glossary: () => glossary(b), more, picker: () => b ? picker(b) : pickerHome(), certs, bookmarks, progress, settings, about, search};
  (R[a] || home)();
  if (a !== 'search') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
route(); maybeAck();
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
