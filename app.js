'use strict';

/* ================= storage ================= */
const KEY = 'ielts-boss-story-v1';
const S = Object.assign(
  { read: {}, best: {}, known: {}, star: {}, wrong: {}, last: null, days: {}, mode: 'learn', font: 17, theme: '' },
  load()
);
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
function today() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
function touchDay() { S.days[today()] = (S.days[today()] || 0) + 1; save(); }
function streak() {
  let n = 0; const d = new Date();
  if (!S.days[today()]) d.setDate(d.getDate() - 1);
  for (;;) {
    const k = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    if (!S.days[k]) return n;
    n++; d.setDate(d.getDate() - 1);
  }
}

/* ================= data ================= */
let STORIES = [], BY_ID = {}, WORDS = [], WORD_MAP = {};
const lc = s => s.toLowerCase();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function prepare(data) {
  STORIES = data;
  for (const st of STORIES) {
    BY_ID[st.id] = st;
    st.tokens = [];
    st.paras.forEach((p, pi) => p.forEach((x, xi) => { if (Array.isArray(x)) st.tokens.push({ en: x[0], zh: x[1], p: pi, i: xi }); }));
    // study items: the story's key-word list, each with a sentence from the story
    st.items = st.words.map(([en, zh]) => {
      const t = st.tokens.find(t => lc(t.en) === lc(en)) || null;
      return { en, zh, sid: st.id, ctx: t ? sentence(st, t) : null };
    });
    for (const it of st.items) {
      const k = lc(it.en);
      if (!WORD_MAP[k]) WORD_MAP[k] = { en: it.en, k, uses: [] };
      WORD_MAP[k].uses.push(it);
    }
  }
  WORDS = Object.values(WORD_MAP).sort((a, b) => a.k.localeCompare(b.k));
}

// The sentence around a token: { before, word, after } with other key words rendered in English only.
function sentence(st, t) {
  const p = st.paras[t.p];
  const txt = x => (Array.isArray(x) ? x[0] : x);
  let before = '', after = '';
  for (let i = t.i - 1; i >= 0; i--) {
    const s = txt(p[i]);
    const m = Array.isArray(p[i]) ? -1 : Math.max(s.lastIndexOf('。'), s.lastIndexOf('！'), s.lastIndexOf('？'), s.lastIndexOf('……'));
    if (m >= 0) { before = s.slice(m + 1).replace(/^[」"”\s]+/, '') + before; break; }
    before = s + before;
  }
  for (let i = t.i + 1; i < p.length; i++) {
    const s = txt(p[i]);
    const m = Array.isArray(p[i]) ? -1 : s.search(/[。！？]/);
    if (m >= 0) { after += s.slice(0, m + 1); const q = s.slice(m + 1).match(/^["”」]/); if (q) after += q[0]; break; }
    after += s;
  }
  return { before: before.trim(), word: t.en, after: after.trim() };
}
const ctxHtml = c => c ? esc(c.before) + ' <b>' + esc(c.word) + '</b> ' + esc(c.after) : '';

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const app = $('#app');
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 1600); }

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang));
  voice = vs.find(v => /en-GB/i.test(v.lang) && /Google|Daniel|Serena|Kate/i.test(v.name)) || vs.find(v => /en-GB/i.test(v.lang)) || vs.find(v => /en-US/i.test(v.lang)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('此瀏覽器不支援發音');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : 'en-GB'; if (voice) u.voice = voice; u.rate = .9;
  speechSynthesis.speak(u);
}

function ring(pct) {
  const r = 18, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 40 40" width="40" height="40"><circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="3"/>` +
    `<circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--brand)" stroke-width="3" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}"/></svg>`;
}
const storyKnown = st => st.items.filter(it => S.known[lc(it.en)]).length;

function setTop(title, back) {
  $('#pageTitle').textContent = title;
  const b = $('#backBtn'); b.hidden = !back; b.onclick = () => { if (back === true) history.back(); else location.hash = back; };
}
function setTab(tab) {
  document.body.classList.toggle('no-tab', !tab);
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
}

/* ================= word sheet ================= */
function openSheet(en, opts = {}) {
  const k = lc(en), w = WORD_MAP[k];
  const uses = w ? w.uses : [{ en, zh: opts.zh || '', sid: opts.sid, ctx: null }];
  const use = uses.find(u => u.sid === opts.sid) || uses[0];
  const zh = opts.zh || use.zh;
  const others = [...new Set(uses.map(u => u.sid))].filter(id => id !== opts.sid).slice(0, 6);
  const meanings = [...new Set(uses.map(u => u.zh))];
  const sh = $('#sheet');
  sh.innerHTML = `<div class="grip"></div>
    <div class="word"><span>${esc(w ? w.en : en)}</span><button class="speak" data-say="${esc(en)}">🔊</button></div>
    <div class="mean">${esc(zh)}${meanings.length > 1 ? `<div class="small muted">其他釋義：${esc(meanings.filter(m => m !== zh).join('；'))}</div>` : ''}</div>
    ${use.ctx ? `<div class="ctx">${ctxHtml(use.ctx)}</div>` : ''}
    ${others.length ? `<div class="from">也出現在：${others.map(id => `<a href="#/s/${id}?w=${encodeURIComponent(k)}">${id}. ${esc(BY_ID[id].title)}</a>`).join('、')}</div>` : ''}
    <div class="row">
      <button class="btn ghost" id="shStar">${S.star[k] ? '★ 已加入生詞本' : '☆ 加入生詞本'}</button>
      <button class="btn ${S.known[k] ? 'ghost' : ''}" id="shKnown">${S.known[k] ? '✓ 已掌握' : '標記已掌握'}</button>
    </div>`;
  sh.hidden = false; $('#sheetMask').hidden = false;
  speak(en);
  $('#shStar').onclick = () => { if (S.star[k]) delete S.star[k]; else S.star[k] = 1; save(); openSheet(en, opts); toast(S.star[k] ? '已加入生詞本' : '已移出生詞本'); };
  $('#shKnown').onclick = () => {
    if (S.known[k]) delete S.known[k]; else { S.known[k] = 1; touchDay(); }
    save(); closeSheet(); if (opts.onChange) opts.onChange();
  };
  sh.querySelectorAll('.from a').forEach(a => a.addEventListener('click', closeSheet));
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetMask').hidden = true; }
$('#sheetMask').onclick = closeSheet;
document.addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) { e.stopPropagation(); speak(b.dataset.say); } });

/* ================= views ================= */
let homeFilter = 'all', homeQuery = '';
function viewHome() {
  setTop('霸總雅思單詞'); setTab('home');
  const doneN = Object.keys(S.read).length;
  const knownN = Object.keys(S.known).length;
  const last = S.last && BY_ID[S.last];
  app.innerHTML = `
    <section class="hero">
      <h2>用霸總故事背雅思單詞</h2>
      <p>${STORIES.length} 個故事 · ${WORDS.length.toLocaleString()} 個核心單詞</p>
      <div class="stats">
        <div class="stat"><b>${doneN}</b><span>讀完故事</span></div>
        <div class="stat"><b>${knownN}</b><span>已掌握單詞</span></div>
        <div class="stat"><b>${streak()}</b><span>連續天數</span></div>
      </div>
    </section>
    ${last ? `<a class="card continue" href="#/s/${last.id}"><div class="num">${last.id}</div><div class="t"><div class="small muted">繼續學習</div><div>${esc(last.title)}</div></div><span class="arrow">›</span></a>` : ''}
    <div class="section-title">全部故事</div>
    <input class="search" id="q" type="search" placeholder="搜尋故事標題或單詞…" value="${esc(homeQuery)}">
    <div class="chips" style="margin:10px 0 12px">
      ${[['all', '全部'], ['todo', '未讀完'], ['done', '已讀完']].map(([k, t]) => `<button class="chip ${homeFilter === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}
    </div>
    <div class="story-list" id="list"></div>`;
  const draw = () => {
    const q = lc(homeQuery.trim());
    const list = STORIES.filter(st =>
      (homeFilter === 'all' || (homeFilter === 'done') === !!S.read[st.id]) &&
      (!q || st.title.includes(homeQuery.trim()) || String(st.id) === q || st.items.some(it => lc(it.en) === q)));
    $('#list').innerHTML = list.length ? list.map(st => {
      const k = storyKnown(st), pct = k / st.items.length;
      return `<a class="card story-item" href="#/s/${st.id}">
        <div class="num">${ring(pct)}<span>${st.id}</span></div>
        <div class="info"><div class="title">${esc(st.title)}</div>
          <div class="meta"><span>${st.items.length} 詞</span><span>已掌握 ${k}</span>
            ${S.read[st.id] ? '<span class="badge">已讀</span>' : ''}${S.best[st.id] != null ? `<span class="badge gold">測驗 ${S.best[st.id]}%</span>` : ''}</div></div>
        <span class="arrow">›</span></a>`;
    }).join('') : '<div class="empty"><b>🔍</b>沒有符合的故事</div>';
  };
  draw();
  $('#q').oninput = e => { homeQuery = e.target.value; draw(); };
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { homeFilter = b.dataset.f; viewHome(); });
}

const MODES = {
  learn: ['學習', '中英對照閱讀，點單詞看例句和發音'],
  review: ['複習', '看英文回憶中文，點一下揭曉答案'],
  recall: ['挑戰', '看中文回想英文單詞，點一下揭曉答案']
};
function viewStory(id, focusWord) {
  const st = BY_ID[id]; if (!st) return viewHome();
  S.last = id; save();
  setTop(`${st.id}. ${st.title}`, '#/'); setTab(null);
  const mode = S.mode;
  const paraHtml = p => '<p>' + p.map((x, i) => {
    if (!Array.isArray(x)) return esc(x);
    const k = lc(x[0]);
    const cls = 'w' + (S.known[k] ? ' known' : '') + (mode === 'review' ? ' blank' : '') + (mode === 'recall' ? ' hide-en' : '');
    return `<button class="${cls}" data-w="${esc(x[0])}" data-z="${esc(x[1])}"><span class="en">${esc(x[0])}</span><span class="g">（${esc(x[1])}）</span></button>`;
  }).join('') + '</p>';
  const prev = BY_ID[id - 1], next = BY_ID[id + 1];
  app.innerHTML = `
    <div class="reader-head">
      <div class="small muted">Story ${String(st.id).padStart(2, '0')} · ${st.items.length} 個重點單詞 · 已掌握 ${storyKnown(st)}</div>
      <h2>${esc(st.title)}</h2>
      <div class="seg">${Object.entries(MODES).map(([k, [t]]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="mode-tip">${MODES[mode][1]}</div>
      <div class="tools">
        ${mode !== 'learn' ? '<button class="chip" id="revealAll">全部揭曉</button>' : '<span class="small muted">綠色 = 已掌握</span>'}
        <div class="fs"><button id="fsDown">A-</button><button id="fsUp">A+</button></div>
      </div>
    </div>
    <article class="story" id="story">${st.paras.map(paraHtml).join('')}</article>
    <button class="btn ${S.read[id] ? 'ghost' : ''} block" id="doneBtn">${S.read[id] ? '✓ 已讀完（再按一次取消）' : '讀完了，打卡 ✓'}</button>
    <div class="pager">
      ${prev ? `<a href="#/s/${prev.id}">‹ ${prev.id}. ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="#/s/${next.id}">${next.id}. ${esc(next.title)} ›</a>` : '<span></span>'}
    </div>
    <div class="reader-actions">
      <a class="btn ghost" href="#/s/${id}/list">📋 單詞表</a>
      <a class="btn ghost" href="#/s/${id}/cards">🃏 單詞卡</a>
      <a class="btn" href="#/s/${id}/quiz">✍️ 測驗</a>
    </div>`;
  document.documentElement.style.setProperty('--font', S.font + 'px');
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; save(); keepScroll(() => viewStory(id)); });
  $('#fsUp').onclick = () => { S.font = Math.min(24, S.font + 1); save(); document.documentElement.style.setProperty('--font', S.font + 'px'); };
  $('#fsDown').onclick = () => { S.font = Math.max(14, S.font - 1); save(); document.documentElement.style.setProperty('--font', S.font + 'px'); };
  if ($('#revealAll')) $('#revealAll').onclick = () => app.querySelectorAll('.w').forEach(w => w.classList.add('show'));
  $('#doneBtn').onclick = () => {
    if (S.read[id]) delete S.read[id]; else { S.read[id] = Date.now(); touchDay(); toast('打卡成功！👑'); }
    save(); keepScroll(() => viewStory(id));
  };
  $('#story').onclick = e => {
    const w = e.target.closest('.w'); if (!w) return;
    if (mode !== 'learn' && !w.classList.contains('show')) { w.classList.add('show'); if (mode === 'recall') speak(w.dataset.w); return; }
    openSheet(w.dataset.w, { sid: id, zh: w.dataset.z, onChange: () => keepScroll(() => viewStory(id)) });
  };
  if (focusWord) {
    const el = [...app.querySelectorAll('.w')].find(w => lc(w.dataset.w) === focusWord);
    if (el) setTimeout(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('flash', 'show'); }, 60);
  }
}
function keepScroll(fn) { const y = scrollY; fn(); scrollTo(0, y); }

function viewStoryList(id) {
  const st = BY_ID[id]; if (!st) return viewHome();
  setTop(`${st.id}. 單詞表`, `#/s/${id}`); setTab(null);
  let hide = false;
  const draw = () => {
    app.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <button class="btn ghost" id="hz">${hide ? '顯示中文' : '遮住中文'}</button>
        <a class="btn" href="#/s/${id}/cards">🃏 單詞卡</a>
      </div>
      <div class="wl">${st.items.map((it, i) => {
        const k = lc(it.en);
        return `<div class="card wl-item" data-i="${i}"><span class="muted small" style="width:22px">${i + 1}</span>
          <span class="en">${esc(it.en)}</span><span class="zh">${hide ? '••••' : esc(it.zh)}</span>
          ${S.known[k] ? '<span class="badge">已掌握</span>' : ''}<button class="star" data-k="${esc(k)}">${S.star[k] ? '★' : '☆'}</button></div>`;
      }).join('')}</div>`;
    $('#hz').onclick = () => { hide = !hide; keepScroll(draw); };
    app.querySelectorAll('.wl-item').forEach(el => el.onclick = e => {
      const it = st.items[el.dataset.i];
      if (e.target.closest('.star')) { const k = lc(it.en); if (S.star[k]) delete S.star[k]; else S.star[k] = 1; save(); return keepScroll(draw); }
      openSheet(it.en, { sid: id, zh: it.zh, onChange: () => keepScroll(draw) });
    });
  };
  draw();
}

/* ---------- flashcards ---------- */
function viewCards(items, title, back, onFinish) {
  setTop(title, back); setTab(null);
  if (!items.length) { app.innerHTML = '<div class="empty"><b>🃏</b>這裡還沒有單詞</div>'; return; }
  let deck = shuffle(items), idx = 0, yes = 0, again = [];
  const draw = () => {
    if (idx >= deck.length) {
      touchDay(); if (onFinish) onFinish();
      app.innerHTML = `<div class="card result"><div class="crown">🃏</div><h2>本輪完成！</h2>
        <p class="muted">認識 ${yes} / ${deck.length}</p>
        <div class="row" style="margin-top:18px">
          ${again.length ? '<button class="btn ghost" id="again">再練不認識的 ' + again.length + ' 個</button>' : ''}
          <a class="btn" href="${back}">完成</a></div></div>`;
      if ($('#again')) $('#again').onclick = () => { deck = shuffle(again); again = []; idx = 0; yes = 0; draw(); };
      return;
    }
    const it = deck[idx];
    app.innerHTML = `
      <div class="fc-top"><span>${idx + 1} / ${deck.length}</span><span>認識 ${yes}</span></div>
      <div class="bar"><i style="width:${idx / deck.length * 100}%"></i></div>
      <div class="flip" id="flip"><div class="flip-in">
        <div class="face"><div class="big">${esc(it.en)}</div><button class="speak" style="margin-top:16px" data-say="${esc(it.en)}">🔊</button><div class="hint">點擊翻面</div></div>
        <div class="face back"><div class="zh">${esc(it.zh)}</div><div class="big" style="font-size:22px;margin-top:6px">${esc(it.en)}</div>
          ${it.ctx ? `<div class="ctx">${ctxHtml(it.ctx)}</div>` : ''}<div class="hint">${BY_ID[it.sid] ? it.sid + '. ' + esc(BY_ID[it.sid].title) : ''}</div></div>
      </div></div>
      <div class="row fc-btns"><button class="btn no" id="no">✗ 不認識</button><button class="btn yes" id="yes">✓ 認識</button></div>`;
    speak(it.en);
    const flip = $('#flip');
    flip.onclick = e => { if (!e.target.closest('[data-say]')) flip.classList.toggle('on'); };
    const k = lc(it.en);
    $('#yes').onclick = () => { S.known[k] = 1; save(); yes++; idx++; draw(); };
    $('#no').onclick = () => { delete S.known[k]; S.star[k] = 1; save(); again.push(it); idx++; draw(); };
    // swipe: right = know, left = don't know
    let x0 = null;
    flip.ontouchstart = e => { x0 = e.touches[0].clientX; };
    flip.ontouchend = e => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx > 70) $('#yes').click(); else if (dx < -70) $('#no').click();
    };
  };
  draw();
}

/* ---------- quiz ---------- */
const QTYPES = { e2z: '看英文選中文', z2e: '看中文選英文', cloze: '故事填空', spell: '拼寫單詞' };
function makeQuiz(items, n) {
  const pool = items.length >= 4 ? items : items.concat(shuffle(WORDS).slice(0, 12).map(w => w.uses[0]));
  const picked = shuffle(items).slice(0, n);
  const order = ['e2z', 'z2e', 'cloze', 'e2z', 'spell', 'z2e', 'cloze'];
  return picked.map((it, i) => {
    let type = order[i % order.length];
    if (type === 'cloze' && !it.ctx) type = 'z2e';
    if (type === 'spell' && it.en.length > 14) type = 'e2z';
    const distract = shuffle(pool.filter(o => lc(o.en) !== lc(it.en) && o.zh !== it.zh));
    const seenEn = new Set([lc(it.en)]), seenZh = new Set([it.zh]), opts = [it];
    for (const o of distract) {
      if (opts.length >= 4) break;
      if (seenEn.has(lc(o.en)) || seenZh.has(o.zh)) continue;
      seenEn.add(lc(o.en)); seenZh.add(o.zh); opts.push(o);
    }
    return { it, type, opts: shuffle(opts) };
  });
}
function viewQuiz(items, title, back, opts = {}) {
  setTop(title, back); setTab(null);
  if (!items.length) { app.innerHTML = '<div class="empty"><b>🎉</b>沒有需要測驗的單詞</div>'; return; }
  const qs = makeQuiz(items, opts.n || 15);
  let idx = 0, score = 0; const wrongs = [];
  const record = (it, ok) => {
    const k = lc(it.en);
    if (ok) {
      score++;
      if (opts.mistakes && S.wrong[k]) { S.wrong[k].n--; if (S.wrong[k].n <= 0) delete S.wrong[k]; }
    } else {
      wrongs.push(it);
      const w = S.wrong[k] || { en: it.en, zh: it.zh, sid: it.sid, n: 0 };
      w.n++; w.t = Date.now(); S.wrong[k] = w; delete S.known[k];
    }
    save();
  };
  const draw = () => {
    if (idx >= qs.length) {
      const pct = Math.round(score / qs.length * 100);
      if (opts.sid) S.best[opts.sid] = Math.max(S.best[opts.sid] || 0, pct);
      touchDay();
      app.innerHTML = `<div class="card result">
        <div class="crown">${pct >= 90 ? '👑' : pct >= 70 ? '🥂' : pct >= 50 ? '💪' : '📖'}</div>
        <div class="score">${pct}<span style="font-size:24px">分</span></div>
        <p class="muted">答對 ${score} / ${qs.length}　${pct >= 90 ? '總裁對你刮目相看！' : pct >= 70 ? '表現不錯，繼續加油' : '多讀幾遍故事再來挑戰'}</p>
        ${wrongs.length ? `<div class="wrong-list"><div class="section-title">答錯的單詞（已加入錯題本）</div><div class="wl">${wrongs.map(w => `<div class="card wl-item"><span class="en">${esc(w.en)}</span><span class="zh">${esc(w.zh)}</span><button class="speak" data-say="${esc(w.en)}">🔊</button></div>`).join('')}</div></div>` : ''}
        <div class="row" style="margin-top:18px"><button class="btn ghost" id="retry">再測一次</button><a class="btn" href="${back}">完成</a></div></div>`;
      $('#retry').onclick = () => viewQuiz(opts.mistakes ? mistakeItems() : items, title, back, opts);
      return;
    }
    const q = qs[idx], it = q.it;
    let stem = '';
    if (q.type === 'e2z') stem = `<div class="q-stem"><div class="en">${esc(it.en)}<button class="speak" data-say="${esc(it.en)}">🔊</button></div></div>`;
    else if (q.type === 'z2e') stem = `<div class="q-stem">${esc(it.zh)}</div>`;
    else if (q.type === 'cloze') stem = `<div class="q-stem sent">${esc(it.ctx.before)} <span class="gap" id="gap">　</span> ${esc(it.ctx.after)}<div class="small muted" style="margin-top:6px">提示：${esc(it.zh)}</div></div>`;
    else stem = `<div class="q-stem">${esc(it.zh)}<div class="small muted" style="font-weight:400;margin-top:4px">首字母 <b style="font-family:Georgia">${esc(it.en[0])}</b>，共 ${it.en.length} 個字元</div></div>`;
    app.innerHTML = `
      <div class="fc-top"><span>第 ${idx + 1} / ${qs.length} 題</span><span>得分 ${score}</span></div>
      <div class="bar"><i style="width:${idx / qs.length * 100}%"></i></div>
      <span class="q-type">${QTYPES[q.type]}</span>
      ${stem}
      ${q.type === 'spell'
        ? `<input class="spell" id="sp" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="輸入英文單詞"><button class="btn block" id="spOk">確定</button>`
        : `<div class="opts">${q.opts.map((o, i) => `<button class="opt ${q.type === 'e2z' ? '' : 'en'}" data-i="${i}">${esc(q.type === 'e2z' ? o.zh : o.en)}</button>`).join('')}</div>`}
      <div id="fb"></div>`;
    if (q.type === 'e2z') speak(it.en);
    const next = ok => {
      $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}">${ok ? '✓ 答對了！' : '✗ 正確答案：'} <b>${esc(it.en)}</b> ${esc(it.zh)}</div>
        <button class="btn block" style="margin-top:12px" id="nx">${idx + 1 < qs.length ? '下一題 →' : '看結果'}</button>`;
      $('#nx').onclick = () => { idx++; draw(); scrollTo(0, 0); };
      const at = idx;
      if (ok) setTimeout(() => { if (idx === at && $('#nx')) $('#nx').click(); }, 900);
    };
    if (q.type === 'spell') {
      const inp = $('#sp'); inp.focus();
      const check = () => {
        if (inp.disabled || !inp.value.trim()) return;
        const ok = lc(inp.value.trim()) === lc(it.en);
        inp.disabled = true; $('#spOk').remove(); inp.classList.add(ok ? 'right' : 'wrong');
        record(it, ok); speak(it.en); next(ok);
      };
      $('#spOk').onclick = check; inp.onkeydown = e => { if (e.key === 'Enter') check(); };
    } else {
      app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const o = q.opts[b.dataset.i], ok = o === it;
        app.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (q.opts[x.dataset.i] === it) x.classList.add('right'); });
        if (!ok) b.classList.add('wrong');
        if ($('#gap')) $('#gap').textContent = it.en;
        if (q.type !== 'e2z') speak(it.en);
        record(it, ok); next(ok);
      });
    }
  };
  draw();
}

/* ---------- word book ---------- */
let wordFilter = 'all', wordQuery = '', wordLimit = 80;
function itemFor(k) { const w = WORD_MAP[k]; return w ? w.uses[0] : null; }
function viewWords() {
  setTop('單詞本'); setTab('words');
  const starN = Object.keys(S.star).length, knownN = Object.keys(S.known).length;
  app.innerHTML = `
    <input class="search" id="q" type="search" placeholder="搜尋英文或中文…" value="${esc(wordQuery)}">
    <div class="chips" style="margin:10px 0 12px">
      ${[['all', `全部 ${WORDS.length}`], ['star', `生詞本 ${starN}`], ['known', `已掌握 ${knownN}`], ['new', '未掌握']].map(([k, t]) => `<button class="chip ${wordFilter === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}
    </div>
    ${wordFilter === 'star' && starN ? `<div class="row" style="margin-bottom:12px"><a class="btn ghost" href="#/star/cards">🃏 生詞卡</a><a class="btn" href="#/star/quiz">✍️ 生詞測驗</a></div>` : ''}
    <div class="wl" id="wl"></div><div class="more" id="more"></div>`;
  const draw = () => {
    const q = lc(wordQuery.trim());
    const list = WORDS.filter(w =>
      (wordFilter === 'all' || (wordFilter === 'star' && S.star[w.k]) || (wordFilter === 'known' && S.known[w.k]) || (wordFilter === 'new' && !S.known[w.k])) &&
      (!q || w.k.includes(q) || w.uses.some(u => u.zh.includes(wordQuery.trim()))));
    $('#wl').innerHTML = list.length ? list.slice(0, wordLimit).map(w =>
      `<div class="card wl-item" data-k="${esc(w.k)}"><span class="en">${esc(w.en)}</span><span class="zh">${esc([...new Set(w.uses.map(u => u.zh))].join('；'))}</span>
       ${S.known[w.k] ? '<span class="badge">✓</span>' : ''}<button class="star">${S.star[w.k] ? '★' : '☆'}</button></div>`).join('')
      : `<div class="empty"><b>${wordFilter === 'star' ? '⭐' : '🔍'}</b>${wordFilter === 'star' ? '在故事裡點單詞，就能加入生詞本' : '沒有符合的單詞'}</div>`;
    $('#more').innerHTML = list.length > wordLimit ? `<button class="btn ghost" id="mb">顯示更多（還有 ${list.length - wordLimit} 個）</button>` : '';
    if ($('#mb')) $('#mb').onclick = () => { wordLimit += 120; keepScroll(draw); };
    app.querySelectorAll('.wl-item').forEach(el => el.onclick = e => {
      const k = el.dataset.k;
      if (e.target.closest('.star')) { if (S.star[k]) delete S.star[k]; else S.star[k] = 1; save(); return keepScroll(draw); }
      const u = itemFor(k); openSheet(u.en, { sid: u.sid, zh: u.zh, onChange: () => keepScroll(draw) });
    });
  };
  draw();
  $('#q').oninput = e => { wordQuery = e.target.value; wordLimit = 80; draw(); };
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { wordFilter = b.dataset.f; wordLimit = 80; viewWords(); });
}
const starItems = () => Object.keys(S.star).map(itemFor).filter(Boolean);

/* ---------- mistakes ---------- */
function mistakeItems() {
  return Object.entries(S.wrong).map(([k, w]) => { const u = itemFor(k); return u ? Object.assign({}, u, { zh: w.zh }) : null; }).filter(Boolean);
}
function viewMistakes() {
  setTop('錯題本'); setTab('mistakes');
  const list = Object.entries(S.wrong).sort((a, b) => b[1].n - a[1].n || b[1].t - a[1].t);
  app.innerHTML = list.length ? `
    <div class="card" style="margin-bottom:14px"><b>${list.length}</b> 個單詞待加強<div class="small muted">在錯題測驗中答對就會扣次數，扣到 0 自動移出</div>
      <div class="row" style="margin-top:12px"><a class="btn ghost" href="#/mistakes/cards">🃏 錯題卡</a><a class="btn" href="#/mistakes/quiz">✍️ 錯題測驗</a></div></div>
    <div class="wl">${list.map(([k, w]) => `<div class="card wl-item" data-k="${esc(k)}"><span class="en">${esc(w.en)}</span><span class="zh">${esc(w.zh)}</span><span class="cnt">×${w.n}</span></div>`).join('')}</div>
    <div class="more"><button class="btn ghost" id="clr">清空錯題本</button></div>`
    : '<div class="empty"><b>📝</b>還沒有錯題<br>去做幾個故事測驗吧！</div>';
  app.querySelectorAll('.wl-item').forEach(el => el.onclick = () => { const w = S.wrong[el.dataset.k]; openSheet(w.en, { sid: w.sid, zh: w.zh }); });
  if ($('#clr')) $('#clr').onclick = () => { if (confirm('確定清空錯題本？')) { S.wrong = {}; save(); viewMistakes(); } };
}

/* ---------- me ---------- */
function viewMe() {
  setTop('我的'); setTab('me');
  const totalItems = STORIES.reduce((n, s) => n + s.items.length, 0);
  app.innerHTML = `
    <div class="card">
      <div class="kv"><span>讀完故事</span><b>${Object.keys(S.read).length} / ${STORIES.length}</b></div>
      <div class="kv"><span>已掌握單詞</span><b>${Object.keys(S.known).length} / ${WORDS.length}</b></div>
      <div class="kv"><span>生詞本</span><b>${Object.keys(S.star).length}</b></div>
      <div class="kv"><span>錯題</span><b>${Object.keys(S.wrong).length}</b></div>
      <div class="kv"><span>連續學習</span><b>${streak()} 天</b></div>
      <div class="kv"><span>學習天數</span><b>${Object.keys(S.days).length} 天</b></div>
    </div>
    <div class="section-title">故事進度 <span class="small muted">深色 = 讀完，淺色 = 學過單詞</span></div>
    <div class="heat">${STORIES.map(st => `<a href="#/s/${st.id}" class="${S.read[st.id] ? 'd' : storyKnown(st) ? 'r' : ''}">${st.id}</a>`).join('')}</div>
    <div class="section-title">設定</div>
    <div class="card">
      <div class="kv"><span>深淺色</span><span class="chips">${[['', '跟隨系統'], ['light', '淺色'], ['dark', '深色']].map(([k, t]) => `<button class="chip ${S.theme === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</span></div>
      <div class="kv"><span>發音測試</span><button class="speak" data-say="Practice makes perfect">🔊</button></div>
      <div class="kv"><span>進度只存在這支手機的瀏覽器</span><span></span></div>
    </div>
    <div class="row" style="margin-top:14px"><button class="btn ghost" id="exp">匯出進度</button><button class="btn ghost" id="imp">匯入進度</button></div>
    <div class="more"><button class="btn ghost" id="reset" style="color:var(--bad)">重置所有進度</button></div>
    <p class="small muted" style="text-align:center">共 ${STORIES.length} 個故事 · ${totalItems} 個詞條</p>`;
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.theme = b.dataset.t; save(); applyTheme(); viewMe(); });
  $('#exp').onclick = async () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(S))));
    try { await navigator.clipboard.writeText(code); toast('進度代碼已複製'); } catch (e) { prompt('複製以下進度代碼：', code); }
  };
  $('#imp').onclick = () => {
    const code = prompt('貼上進度代碼：'); if (!code) return;
    try { Object.assign(S, JSON.parse(decodeURIComponent(escape(atob(code.trim()))))); save(); applyTheme(); toast('匯入成功'); viewMe(); } catch (e) { toast('代碼無效'); }
  };
  $('#reset').onclick = () => {
    if (!confirm('確定重置所有學習進度？此動作無法復原。')) return;
    Object.assign(S, { read: {}, best: {}, known: {}, star: {}, wrong: {}, last: null, days: {} }); save(); viewMe();
  };
}

/* ================= theme & router ================= */
function applyTheme() {
  if (S.theme) document.documentElement.dataset.theme = S.theme; else delete document.documentElement.dataset.theme;
}
$('#themeBtn').onclick = () => {
  const dark = S.theme ? S.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  S.theme = dark ? 'light' : 'dark'; save(); applyTheme();
};

function route() {
  closeSheet();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  const [path, query] = location.hash.slice(1).split('?');
  const parts = (path || '/').split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  scrollTo(0, 0);
  if (parts[0] === 's' && BY_ID[+parts[1]]) {
    const id = +parts[1], st = BY_ID[id];
    if (parts[2] === 'cards') return viewCards(st.items, `${id}. 單詞卡`, `#/s/${id}`);
    if (parts[2] === 'quiz') return viewQuiz(st.items, `${id}. 測驗`, `#/s/${id}`, { sid: id });
    if (parts[2] === 'list') return viewStoryList(id);
    return viewStory(id, params.get('w'));
  }
  if (parts[0] === 'words') return viewWords();
  if (parts[0] === 'star') {
    if (parts[1] === 'cards') return viewCards(starItems(), '生詞卡', '#/words');
    return viewQuiz(starItems(), '生詞測驗', '#/words', { n: 20 });
  }
  if (parts[0] === 'mistakes') {
    if (parts[1] === 'cards') return viewCards(mistakeItems(), '錯題卡', '#/mistakes');
    if (parts[1] === 'quiz') return viewQuiz(mistakeItems(), '錯題測驗', '#/mistakes', { mistakes: true, n: 20 });
    return viewMistakes();
  }
  if (parts[0] === 'me') return viewMe();
  return viewHome();
}

applyTheme();
document.documentElement.style.setProperty('--font', S.font + 'px');
fetch('data/stories.json')
  .then(r => r.json())
  .then(d => { prepare(d); addEventListener('hashchange', route); route(); })
  .catch(() => { app.innerHTML = '<div class="empty"><b>⚠️</b>資料載入失敗，請重新整理</div>'; });
