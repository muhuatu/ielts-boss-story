'use strict';

/* ================= storage ================= */
const KEY = 'ielts-boss-story-v1';
const S = Object.assign(
  {
    known: {}, star: {}, wrong: {}, srs: {}, prog: {}, newDay: {}, qstat: {}, conf: {},
    cur: null, days: {}, goal: 20, mode: 'learn', font: 17, theme: '', accent: 'en-GB', voiceName: '', rate: 0.9
  },
  load()
);
function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
const dayKey = (d = new Date()) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
function touchDay() { S.days[dayKey()] = (S.days[dayKey()] || 0) + 1; save(); }
function streak() {
  let n = 0; const d = new Date();
  if (!S.days[dayKey()]) d.setDate(d.getDate() - 1);
  while (S.days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
const newToday = () => S.newDay[dayKey()] || 0;

/* ================= spaced repetition ================= */
// Each studied word has a level. A correct answer moves it up and pushes the next review further out;
// a slow correct answer keeps the level; a wrong answer sends it back to the start.
const GAPS = [0, 1, 2, 4, 7, 15, 30, 60];
const MASTER_LV = 4;
const dayNo = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5);
function grade(k, result) {
  const today = dayNo();
  if (!S.srs[k]) S.newDay[dayKey()] = newToday() + 1;
  const r = S.srs[k] || { lv: 0, due: today };
  if (result === 'bad') { r.lv = 0; r.due = today + 1; } // missed words are retried at the end of the round, then tomorrow
  // only one level-up per day, so cramming the same word several times today doesn't inflate it
  else if (r.last === today && r.lv > 0) { r.due = Math.max(r.due, today + 1); }
  else if (result === 'slow') { r.lv = Math.max(1, r.lv); r.due = today + Math.max(1, Math.ceil(GAPS[r.lv] / 2)); }
  else { r.lv = Math.min(r.lv + 1, GAPS.length - 1); r.due = today + GAPS[r.lv]; }
  r.last = today;
  S.srs[k] = r;
  if (r.lv >= MASTER_LV) S.known[k] = 1; else delete S.known[k];
}
const dueKeys = () => Object.keys(S.srs).filter(k => S.srs[k].due <= dayNo() && WORD_MAP[k]);
const learned = k => S.known[k] || (S.srs[k] && S.srs[k].lv > 0);

/* ================= data ================= */
let STORIES = [], BY_ID = {}, WORDS = [], WORD_MAP = {}, DICT = {};
const lc = s => s.toLowerCase();
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOPICS = ['教育', '科技', '環境', '健康與醫療', '工作與經濟', '社會與文化', '城市與交通', '媒體與藝術', '人際與情感', '日常生活', '自然與科學', '法律與政府'];

function prepare(data) {
  STORIES = data;
  for (const st of STORIES) {
    BY_ID[st.id] = st;
    st.tokens = [];
    st.paras.forEach((p, pi) => p.forEach((x, xi) => { if (Array.isArray(x)) st.tokens.push({ en: x[0], zh: x[1], p: pi, i: xi }); }));
    // study items: the story's key-word list, each with the sentence where it first appears
    st.items = st.words.map(([en, zh]) => {
      const t = st.tokens.find(t => lc(t.en) === lc(en)) || null;
      return { en, zh, sid: st.id, p: t ? t.p : 0, ctx: t ? sentence(st, t) : null };
    });
    // learning units: each paragraph teaches the key words that first appear in it
    st.units = st.paras.map((_, pi) => st.items.filter(it => it.p === pi));
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
const itemFor = k => { const w = WORD_MAP[k]; return w ? w.uses[0] : null; };

/* ---------- story progress (paragraph by paragraph) ---------- */
const STEPS = ['閱讀本段', '單詞卡', '遮中文回想', '小測驗'];
function progOf(id) {
  const st = BY_ID[id], pr = S.prog[id] || { p: 0, st: [false, false, false, false] };
  while (pr.p < st.paras.length && !st.units[pr.p].length) pr.p++; // skip paragraphs without key words
  return pr;
}
const storyDone = id => progOf(id).p >= BY_ID[id].paras.length;
const storyStarted = id => !!S.prog[id];
function setStep(id, i) { const pr = progOf(id); pr.st[i] = true; S.prog[id] = pr; save(); }
function nextPara(id) {
  const pr = progOf(id); pr.p++; pr.st = [false, false, false, false]; S.prog[id] = pr; save();
  return progOf(id);
}
const unitCount = st => st.units.filter(u => u.length).length;
const unitIndex = (st, p) => st.units.slice(0, p + 1).filter(u => u.length).length;
function currentStory() {
  if (S.cur && BY_ID[S.cur] && !storyDone(S.cur)) return BY_ID[S.cur];
  return STORIES.find(st => !storyDone(st.id)) || null;
}

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const app = $('#app');
const svg = (d, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  speak: svg('<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  chev: svg('<path d="M9 5l7 7-7 7"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  star: svg('<path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17l-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/>'),
  starOn: svg('<path d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 17l-5.4 3 1.2-6-4.5-4.2 6.1-.7z"/>', 'fill')
};
const starBtn = on => `<button class="star ${on ? 'on' : ''}" aria-label="生詞本">${on ? I.starOn : I.star}</button>`;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 1800); }
function keepScroll(fn) { const y = scrollY; fn(); scrollTo(0, y); }

let voice = null;
const enVoices = () => ('speechSynthesis' in window ? speechSynthesis.getVoices() : []).filter(v => /^en/i.test(v.lang));
const accentVoices = () => enVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(S.accent.toLowerCase()));
// higher-quality voices first: enhanced/premium/neural/Google ones usually sound far more natural
const voiceRank = v => (/premium|enhanced|neural|natural/i.test(v.name) ? 0 : /google/i.test(v.name) ? 1 : 2);
function pickVoice() {
  const vs = enVoices();
  voice = vs.find(v => v.name === S.voiceName) ||
    accentVoices().sort((a, b) => voiceRank(a) - voiceRank(b))[0] || vs[0] || null;
  if ($('#voiceSel')) fillVoiceSelect();
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return toast('此瀏覽器不支援發音');
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : S.accent; if (voice) u.voice = voice; u.rate = S.rate;
  speechSynthesis.speak(u);
}

function setTop(title, back) {
  $('#pageTitle').textContent = title;
  const b = $('#backBtn'); b.hidden = !back; b.onclick = () => { location.hash = back; };
}
function setTab(tab) {
  document.body.classList.toggle('no-tab', !tab);
  document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
}
const posOf = k => (DICT[k] && DICT[k].pos) || '';

/* ================= word sheet ================= */
const wordLink = x => WORD_MAP[lc(x)] ? `<button class="tag link" data-open="${esc(x)}">${esc(x)}</button>` : `<span class="tag">${esc(x)}</span>`;
const pairKey = (a, b) => [lc(a), lc(b)].sort().join('|');
function confusables(k) {
  const fromDict = ((DICT[k] && DICT[k].conf) || []).filter(x => WORD_MAP[lc(x)]).map(lc);
  const mine = Object.keys(S.conf).filter(p => S.conf[p] >= 2 && p.split('|').includes(k)).map(p => p.split('|').find(x => x !== k));
  return [...new Set(mine.concat(fromDict))];
}
function dictHtml(k) {
  const d = DICT[k]; if (!d) return '';
  const conf = confusables(k);
  return `
    ${d.ex ? `<div class="sec">例句</div>
    <div class="ex"><div class="ex-en"><span>${esc(d.ex)}</span><button class="speak sm" data-say="${esc(d.ex)}" aria-label="朗讀例句">${I.speak}</button></div><div class="ex-zh">${esc(d.exZh)}</div></div>` : ''}
    ${d.col && d.col.length ? `<div class="sec">常用搭配</div><ul class="col">${d.col.map(([e, z]) => `<li><span class="en">${esc(e)}</span><span class="muted">${esc(z)}</span></li>`).join('')}</ul>` : ''}
    ${d.fam && d.fam.length ? `<div class="sr"><span class="sec">詞族</span><div class="tags">${d.fam.map(([w, p, z]) => `<span class="tag">${esc(w)} <i>${esc(p)}</i> <small>${esc(z)}</small></span>`).join('')}</div></div>` : ''}
    ${d.syn && d.syn.length ? `<div class="sr"><span class="sec">同義</span><div class="tags">${d.syn.map(wordLink).join('')}</div></div>` : ''}
    ${d.ant && d.ant.length ? `<div class="sr"><span class="sec">反義</span><div class="tags">${d.ant.map(wordLink).join('')}</div></div>` : ''}
    ${conf.length ? `<div class="sr"><span class="sec">易混</span><div class="tags">${conf.map(x => `<a class="tag link" href="#/pair/${encodeURIComponent(k)}/${encodeURIComponent(x)}">${esc(WORD_MAP[x].en)} 對比</a>`).join('')}</div></div>` : ''}`;
}
function openSheet(en, opts = {}) {
  const k = lc(en), w = WORD_MAP[k];
  const uses = w ? w.uses : [{ en, zh: opts.zh || '', sid: opts.sid, ctx: null }];
  const use = uses.find(u => u.sid === opts.sid) || uses[0];
  const zh = opts.zh || use.zh;
  const others = [...new Set(uses.map(u => u.sid))].filter(id => id !== opts.sid).slice(0, 6);
  const meanings = [...new Set(uses.map(u => u.zh))];
  const sh = $('#sheet');
  sh.innerHTML = `
    <div class="word"><span>${esc(w ? w.en : en)}</span>${posOf(k) ? `<span class="pos">${esc(posOf(k))}</span>` : ''}<button class="speak" data-say="${esc(en)}" aria-label="發音">${I.speak}</button></div>
    <div class="mean">${esc(zh)}${meanings.length > 1 ? `<div class="small muted">其他釋義：${esc(meanings.filter(m => m !== zh).join('；'))}</div>` : ''}</div>
    ${use.ctx ? `<div class="sec">故事原句</div><div class="ctx">${ctxHtml(use.ctx)}</div>` : ''}
    ${dictHtml(k)}
    ${others.length ? `<div class="from">也出現在：${others.map(id => `<a href="#/s/${id}?w=${encodeURIComponent(k)}">${id}. ${esc(BY_ID[id].title)}</a>`).join('、')}</div>` : ''}
    <div class="row">
      <button class="btn ghost" id="shStar">${S.star[k] ? '已在生詞本' : '加入生詞本'}</button>
      <button class="btn ${S.known[k] ? 'ghost' : ''}" id="shKnown">${S.known[k] ? '已掌握' : '標記已掌握'}</button>
    </div>`;
  sh.hidden = false; $('#sheetMask').hidden = false; sh.scrollTop = 0;
  speak(en);
  $('#shStar').onclick = () => { if (S.star[k]) delete S.star[k]; else S.star[k] = 1; save(); openSheet(en, opts); toast(S.star[k] ? '已加入生詞本' : '已移出生詞本'); };
  $('#shKnown').onclick = () => {
    if (S.known[k]) { delete S.known[k]; if (S.srs[k]) { S.srs[k].lv = Math.min(S.srs[k].lv, MASTER_LV - 1); S.srs[k].due = dayNo(); } }
    else { if (!S.srs[k]) S.newDay[dayKey()] = newToday() + 1; S.known[k] = 1; S.srs[k] = { lv: 6, due: dayNo() + GAPS[6], last: dayNo() }; touchDay(); }
    save(); closeSheet(); if (opts.onChange) opts.onChange();
  };
  sh.querySelectorAll('.from a, a.tag').forEach(a => a.addEventListener('click', closeSheet));
  sh.querySelectorAll('[data-open]').forEach(b => b.onclick = () => { const u = itemFor(lc(b.dataset.open)); openSheet(u.en, { sid: u.sid, zh: u.zh }); });
}
function closeSheet() { $('#sheet').hidden = true; $('#sheetMask').hidden = true; }
$('#sheetMask').onclick = closeSheet;
document.addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) { e.stopPropagation(); speak(b.dataset.say); } });

/* ================= 今日 ================= */
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
function weakest() {
  const rows = Object.entries(CAT_NAME).map(([c]) => { const [r, t] = S.qstat[c] || [0, 0]; return { c, r, t, pct: t ? r / t : 1 }; });
  return rows.filter(x => x.t >= 10 && x.pct < .75).sort((a, b) => a.pct - b.pct)[0] || null;
}
function viewToday() {
  setTop('今日'); setTab('today');
  const d = new Date(), due = dueKeys().length, nt = newToday(), goal = S.goal;
  const tmr = Object.values(S.srs).filter(r => r.due === dayNo() + 1).length;
  const cur = currentStory();
  const pr = cur && progOf(cur.id);
  const unit = cur ? cur.units[pr.p] : [];
  const wrongN = Object.keys(S.wrong).length, weak = weakest();
  const tasks = [
    {
      done: !due, href: '#/review',
      title: due ? `複習 ${due} 個到期單詞` : '今日複習完成',
      sub: due ? '依記憶程度出題，答錯的本輪結尾再考一次' : (tmr ? `明天有 ${tmr} 個單詞要複習` : '目前沒有到期的單詞')
    },
    cur ? {
      done: nt >= goal, href: `#/s/${cur.id}`,
      title: nt >= goal ? '今日新詞已達標' : `學新段落：${cur.id}. ${cur.title}`,
      sub: `${nt >= goal ? `${cur.id}. ${cur.title} · ` : ''}第 ${unitIndex(cur, pr.p)} / ${unitCount(cur)} 段 · ${unit.length} 個單詞`
    } : { done: true, href: '#/stories', title: '100 個故事都學完了', sub: '繼續用複習和弱點加強鞏固' },
    (wrongN || weak) ? {
      optional: true, done: false,
      href: weak ? `#/practice/${weak.c}` : '#/mistakes/quiz',
      title: '弱點加強（選做）',
      sub: weak ? `${CAT_NAME[weak.c]}正確率 ${Math.round(weak.pct * 100)}%，練一組 ${CAT_NAME[weak.c]}` : `錯題本有 ${wrongN} 個單詞`
    } : null
  ].filter(Boolean);
  const next = tasks.findIndex(t => !t.done && !t.optional);
  app.innerHTML = `
    <div class="today-head">
      <div><div class="date">${d.getMonth() + 1} 月 ${d.getDate()} 日 星期${WEEK[d.getDay()]}</div>
      <div class="small muted">連續學習 ${streak()} 天 · 學過 ${Object.keys(S.srs).length} 詞 · 已掌握 ${Object.keys(S.known).length} 詞</div></div>
    </div>
    <div class="goal">
      <div class="goal-top"><span>今日新詞</span><b>${nt} / ${goal}</b></div>
      <div class="bar"><i style="width:${Math.min(100, nt / goal * 100)}%"></i></div>
    </div>
    <ol class="tasks">${tasks.map((t, i) => `
      <li class="task ${t.done ? 'done' : ''} ${i === next ? 'next' : ''}">
        <span class="n">${t.done ? I.check : i + 1}</span>
        <a class="t" href="${t.href}"><b>${esc(t.title)}</b><small>${esc(t.sub)}</small></a>
        ${t.done && i === 0 ? '' : `<a class="btn ${i === next ? '' : 'ghost'}" href="${t.href}">${t.done ? '繼續' : '開始'}</a>`}
      </li>`).join('')}
    </ol>
    ${next < 0 ? `<p class="small muted center">今天的任務完成了。新詞超過目標時記憶效果會變差，建議明天再學新段落。</p>` : ''}
    ${due && next === 0 ? `<p class="small muted center">先複習再學新詞：到期的單詞今天不複習，就會開始遺忘。</p>` : ''}`;
}

/* ================= 故事 ================= */
let storyFilter = 'all', storyQuery = '';
function viewStories() {
  setTop('故事'); setTab('stories');
  app.innerHTML = `
    <input class="search" id="q" type="search" placeholder="搜尋故事標題或單詞…" value="${esc(storyQuery)}">
    <div class="chips" style="margin:10px 0 12px">
      ${[['all', '全部'], ['doing', '學習中'], ['done', '已完成']].map(([k, t]) => `<button class="chip ${storyFilter === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}
    </div>
    <div class="list" id="list"></div>`;
  const draw = () => {
    const q = lc(storyQuery.trim());
    const list = STORIES.filter(st =>
      (storyFilter === 'all' || (storyFilter === 'done' ? storyDone(st.id) : storyStarted(st.id) && !storyDone(st.id))) &&
      (!q || st.title.includes(storyQuery.trim()) || String(st.id) === q || st.items.some(it => lc(it.en) === q)));
    $('#list').innerHTML = list.length ? list.map(st => {
      const n = unitCount(st), done = storyDone(st.id) ? n : unitIndex(st, progOf(st.id).p) - 1;
      return `<a class="list-item" href="#/s/${st.id}">
        <div class="num">${st.id}<i style="width:${done / n * 100}%"></i></div>
        <div class="info"><div class="title">${esc(st.title)}</div>
          <div class="meta"><span>${st.items.length} 詞</span><span>${storyDone(st.id) ? '已完成' : storyStarted(st.id) ? `第 ${done + 1} / ${n} 段` : `${n} 段`}</span></div></div>
        <span class="arrow">${I.chev}</span></a>`;
    }).join('') : '<div class="empty">沒有符合的故事</div>';
  };
  draw();
  $('#q').oninput = e => { storyQuery = e.target.value; draw(); };
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { storyFilter = b.dataset.f; viewStories(); });
}

const MODES = {
  learn: ['學習', '中英對照閱讀，點單詞看例句和發音'],
  review: ['複習', '看英文回想中文，點一下揭曉'],
  recall: ['挑戰', '看中文回想英文，點一下揭曉']
};
function viewStory(id, focusWord) {
  const st = BY_ID[id]; if (!st) return viewStories();
  S.cur = id; save();
  setTop(`${st.id}. ${st.title}`, '#/stories'); setTab(null);
  const mode = S.mode, pr = progOf(id), done = storyDone(id), steps = pr.st;
  const due = dueKeys().length, nt = newToday();
  const paraHtml = (p, pi) => {
    const cls = done || pi < pr.p ? 'para done' : pi === pr.p ? 'para cur' : 'para later';
    return `<p class="${cls}" data-p="${pi}">${pi === pr.p && !done ? '<span class="para-tag">本段</span>' : ''}` + p.map(x => {
      if (!Array.isArray(x)) return esc(x);
      const k = lc(x[0]);
      const c = 'w' + (learned(k) ? ' known' : '') + (mode === 'review' ? ' blank' : '') + (mode === 'recall' ? ' hide-en' : '');
      return `<button class="${c}" data-w="${esc(x[0])}" data-z="${esc(x[1])}"><span class="en">${esc(x[0])}</span><span class="g">（${esc(x[1])}）</span></button>`;
    }).join('') + '</p>';
  };
  // the one thing to do next for this paragraph
  let action;
  if (done) action = { label: '整篇測驗', go: () => (location.hash = `#/s/${id}/quiz`) };
  else if (!steps[0]) action = { label: '本段讀完，下一步：單詞卡', go: () => { setStep(id, 0); touchDay(); location.hash = `#/s/${id}/cards`; } };
  else if (!steps[1]) action = { label: '下一步：單詞卡', go: () => (location.hash = `#/s/${id}/cards`) };
  else if (!steps[2] && mode !== 'review') action = { label: '下一步：遮住中文回想本段', go: () => { S.mode = 'review'; save(); viewStory(id); scrollToCur(); } };
  else if (!steps[2]) action = { label: '回想完成，下一步：小測驗', go: () => { setStep(id, 2); location.hash = `#/s/${id}/quiz`; } };
  else action = { label: '下一步：本段小測驗', go: () => (location.hash = `#/s/${id}/quiz`) };
  const prev = BY_ID[id - 1], next = BY_ID[id + 1];
  app.innerHTML = `
    <div class="reader-head">
      <div class="small muted">Story ${String(st.id).padStart(2, '0')} · ${done ? '全篇完成' : `第 ${unitIndex(st, pr.p)} / ${unitCount(st)} 段 · 本段 ${st.units[pr.p].length} 個單詞`}</div>
      <h2>${esc(st.title)}</h2>
      ${done ? '' : `<div class="steps">${STEPS.map((t, i) => `<button data-step="${i}" class="${steps[i] ? 'done' : ''} ${i === steps.indexOf(false) ? 'next' : ''}"><span class="n">${steps[i] ? I.check : i + 1}</span><b>${t}</b></button>`).join('')}</div>`}
      ${!done && due ? `<a class="note" href="#/review">還有 ${due} 個單詞到期，建議先複習 ${I.chev}</a>` : !done && nt >= S.goal ? `<div class="note">今日新詞已達標（${nt}/${S.goal}），可以繼續，但建議明天再學新段落</div>` : ''}
      <div class="seg">${Object.entries(MODES).map(([k, [t]]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="tools">
        <span class="small muted">${MODES[mode][1]}</span>
        <div class="fs">${mode !== 'learn' ? '<button id="revealAll" class="wide">揭曉</button>' : ''}<button id="fsDown">A-</button><button id="fsUp">A+</button></div>
      </div>
    </div>
    <article class="story" id="story">${st.paras.map(paraHtml).join('')}</article>
    <div class="pager">
      ${prev ? `<a href="#/s/${prev.id}"><div class="small">上一篇</div>${prev.id}. ${esc(prev.title)}</a>` : '<span></span>'}
      ${next ? `<a href="#/s/${next.id}"><div class="small">下一篇</div>${next.id}. ${esc(next.title)}</a>` : '<span></span>'}
    </div>
    <div class="dock">
      <a class="btn ghost" href="#/s/${id}/list">單詞表</a>
      <button class="btn" id="act">${action.label}</button>
    </div>`;
  const setFont = () => document.documentElement.style.setProperty('--font', S.font + 'px');
  setFont();
  $('#act').onclick = action.go;
  app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; save(); keepScroll(() => viewStory(id)); });
  app.querySelectorAll('[data-step]').forEach(b => b.onclick = () => {
    const i = +b.dataset.step;
    if (i === 1) return (location.hash = `#/s/${id}/cards`);
    if (i === 3) return (location.hash = `#/s/${id}/quiz`);
    S.mode = i === 0 ? 'learn' : 'review'; save(); viewStory(id); scrollToCur();
  });
  $('#fsUp').onclick = () => { S.font = Math.min(24, S.font + 1); save(); setFont(); };
  $('#fsDown').onclick = () => { S.font = Math.max(14, S.font - 1); save(); setFont(); };
  if ($('#revealAll')) $('#revealAll').onclick = () => app.querySelectorAll('.para.cur .w, .para.done .w').forEach(w => w.classList.add('show'));
  $('#story').onclick = e => {
    const w = e.target.closest('.w'); if (!w) return;
    if (mode !== 'learn' && !w.classList.contains('show')) { w.classList.add('show'); if (mode === 'recall') speak(w.dataset.w); return; }
    openSheet(w.dataset.w, { sid: id, zh: w.dataset.z, onChange: () => keepScroll(() => viewStory(id)) });
  };
  if (focusWord) {
    const el = [...app.querySelectorAll('.w')].find(w => lc(w.dataset.w) === focusWord);
    if (el) setTimeout(() => { el.scrollIntoView({ block: 'center' }); el.classList.add('flash', 'show'); }, 60);
  } else if (pr.p > 0 && !done) setTimeout(scrollToCur, 30);
}
function scrollToCur() { const p = $('.para.cur'); if (p) scrollTo(0, p.getBoundingClientRect().top + scrollY - 70); }

function viewStoryList(id) {
  const st = BY_ID[id]; if (!st) return viewStories();
  setTop(`${st.id}. 單詞表`, `#/s/${id}`); setTab(null);
  let hide = false;
  const draw = () => {
    app.innerHTML = `
      <div class="row" style="margin-bottom:12px">
        <button class="btn ghost" id="hz">${hide ? '顯示中文' : '遮住中文'}</button>
        <a class="btn ghost" href="#/s/${id}/quiz">整篇測驗</a>
      </div>
      ${st.units.map((u, pi) => u.length ? `<div class="group-title">第 ${unitIndex(st, pi)} 段</div><div class="wl">${u.map(it => {
        const k = lc(it.en);
        return `<div class="wl-item" data-k="${esc(k)}" data-z="${esc(it.zh)}"><span class="en">${esc(it.en)}</span><span class="zh">${hide ? '••••' : esc(it.zh)}</span>
          ${S.known[k] ? '<span class="badge">已掌握</span>' : learned(k) ? '<span class="badge soft">已學</span>' : ''}${starBtn(S.star[k])}</div>`;
      }).join('')}</div>` : '').join('')}`;
    $('#hz').onclick = () => { hide = !hide; keepScroll(draw); };
    app.querySelectorAll('.wl-item').forEach(el => el.onclick = e => {
      const k = el.dataset.k;
      if (e.target.closest('.star')) { if (S.star[k]) delete S.star[k]; else S.star[k] = 1; save(); return keepScroll(draw); }
      openSheet(WORD_MAP[k].en, { sid: id, zh: el.dataset.z, onChange: () => keepScroll(draw) });
    });
  };
  draw();
}

/* ================= flashcards (first exposure) ================= */
function viewCards(items, title, back, opts = {}) {
  setTop(title, back); setTab(null);
  if (!items.length) { app.innerHTML = '<div class="empty">這裡還沒有單詞</div>'; return; }
  let deck = items.slice(), idx = 0, yes = 0, again = [];
  const draw = () => {
    if (idx >= deck.length) {
      touchDay(); if (opts.onFinish) opts.onFinish();
      app.innerHTML = `<div class="result"><div class="label">本輪完成</div><div class="score">${yes}<span>/ ${deck.length}</span></div>
        <p class="muted">${opts.doneMsg || '記得的單詞會在幾天後再出現'}</p>
        <div class="row">${again.length ? `<button class="btn ghost" id="again">再看忘了的 ${again.length} 個</button>` : ''}
          <a class="btn" href="${opts.nextHref || back}">${opts.nextLabel || '完成'}</a></div></div>`;
      if ($('#again')) $('#again').onclick = () => { deck = shuffle(again); again = []; idx = 0; yes = 0; draw(); };
      return;
    }
    const it = deck[idx], k = lc(it.en), d = DICT[k];
    app.innerHTML = `
      <div class="fc-top"><span>${idx + 1} / ${deck.length}</span><span>記得 ${yes}</span></div>
      <div class="bar"><i style="width:${idx / deck.length * 100}%"></i></div>
      <div class="flip" id="flip"><div class="flip-in">
        <div class="face"><div class="big">${esc(it.en)}</div>${posOf(k) ? `<div class="pos">${esc(posOf(k))}</div>` : ''}
          <button class="speak" style="margin-top:14px" data-say="${esc(it.en)}" aria-label="發音">${I.speak}</button>
          ${it.ctx ? `<div class="ctx">${esc(it.ctx.before)} <b>${esc(it.en)}</b> ${esc(it.ctx.after)}</div>` : ''}
          <div class="hint">先在心裡說出中文，再點擊翻面</div></div>
        <div class="face back"><div class="zh">${esc(it.zh)}</div><div class="big sm">${esc(it.en)}</div>
          ${d && d.ex ? `<div class="ctx"><span class="ex-en">${esc(d.ex)}</span><br>${esc(d.exZh)}</div>` : ''}
          ${d && d.col && d.col.length ? `<div class="ctx">搭配：${esc(d.col.map(c => c[0]).join(' · '))}</div>` : ''}
          ${d && d.syn && d.syn.length ? `<div class="ctx">同義：${esc(d.syn.join(', '))}${d.ant.length ? `　反義：${esc(d.ant.join(', '))}` : ''}</div>` : ''}</div>
      </div></div>
      <div class="row fc-btns"><button class="btn no" id="no">忘了</button><button class="btn yes" id="yes">記得</button></div>`;
    speak(it.en);
    const flip = $('#flip');
    flip.onclick = e => { if (!e.target.closest('[data-say]')) flip.classList.toggle('on'); };
    $('#yes').onclick = () => { grade(k, 'ok'); save(); yes++; idx++; draw(); };
    $('#no').onclick = () => { grade(k, 'bad'); save(); again.push(it); idx++; draw(); };
    let x0 = null; // swipe: right = remembered, left = forgot
    flip.ontouchstart = e => { x0 = e.touches[0].clientX; };
    flip.ontouchend = e => {
      if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (dx > 70) $('#yes').click(); else if (dx < -70) $('#no').click();
    };
  };
  draw();
}

/* ================= questions ================= */
const QTYPES = {
  e2z: '看英文選中文', z2e: '看中文選英文', para: '同義替換', para2: '找出同義字',
  cloze: '故事填空', spell: '拼寫單詞', listen: '聽音拼字'
};
const CAT = { e2z: 'meaning', z2e: 'meaning', para: 'para', para2: 'para', cloze: 'usage', spell: 'spell', listen: 'listen' };
const CAT_NAME = { meaning: '意思辨識', para: '同義替換', usage: '用法填空', spell: '拼寫', listen: '聽音拼字' };
const CAT_TYPE = { meaning: 'z2e', para: 'para', usage: 'cloze', spell: 'spell', listen: 'listen' };
const kindOf = it => posOf(lc(it.en)) || (/的$/.test(it.zh) ? 'adj.' : /地$/.test(it.zh) ? 'adv.' : 'x');
let KIND_POOL = null;
function poolOf(kind) {
  if (!KIND_POOL) { KIND_POOL = {}; WORDS.forEach(w => { const u = w.uses[0], kd = kindOf(u); (KIND_POOL[kd] = KIND_POOL[kd] || []).push(u); }); }
  return KIND_POOL[kind] || [];
}
const synOf = it => { const d = DICT[lc(it.en)]; return d && d.syn ? d.syn.filter(s => !/\s/.test(s) || s.split(' ').length <= 2) : []; };
const exHas = it => { const d = DICT[lc(it.en)]; return d && d.ex && lc(d.ex).includes(lc(it.en).slice(0, Math.max(3, it.en.length - 3))); };
function canDo(type, it) {
  if (type === 'cloze') return !!it.ctx;
  if (type === 'para') return synOf(it).length > 0 && exHas(it);
  if (type === 'para2') return synOf(it).length > 0;
  if (type === 'spell' || type === 'listen') return !/\s/.test(it.en) && it.en.length <= 14;
  return true;
}
const FALLBACK = { para: ['cloze', 'z2e'], para2: ['z2e'], cloze: ['para2', 'z2e'], listen: ['spell', 'e2z'], spell: ['e2z'], z2e: [], e2z: [] };
const fitType = (type, it) => canDo(type, it) ? type : FALLBACK[type].find(t => canDo(t, it)) || 'e2z';

function optionsFor(it, pick, n = 4) {
  // distractors of the same part of speech, so the answer can't be guessed from the gloss or word form
  const kd = kindOf(it), seenEn = new Set([lc(it.en)]), seenZh = new Set([it.zh]), opts = [it];
  for (const o of shuffle(poolOf(kd)).concat(shuffle(WORDS.slice(0, 400)).map(w => w.uses[0]))) {
    if (opts.length >= n) break;
    if (seenEn.has(lc(o.en)) || seenZh.has(o.zh) || (pick && !pick(o))) continue;
    seenEn.add(lc(o.en)); seenZh.add(o.zh); opts.push(o);
  }
  return shuffle(opts);
}
function makeQuestion(it, type) {
  type = fitType(type, it);
  const q = { it, type };
  if (type === 'e2z' || type === 'z2e' || type === 'cloze') q.opts = optionsFor(it).map(o => ({ en: o.en, zh: o.zh, ok: o === it }));
  if (type === 'para2') {
    q.syn = shuffle(synOf(it))[0];
    const banned = new Set(synOf(it).map(lc));
    q.opts = optionsFor(it, o => !banned.has(lc(o.en))).map(o => ({ en: o.en, zh: o.zh, ok: o === it }));
  }
  if (type === 'para') {
    const right = shuffle(synOf(it))[0], banned = new Set(synOf(it).map(lc).concat(lc(it.en)));
    const wrong = [];
    for (const o of shuffle(poolOf(kindOf(it)))) {
      if (wrong.length >= 3) break;
      const s = synOf(o).find(x => !banned.has(lc(x)));
      if (s && lc(o.en) !== lc(it.en)) { banned.add(lc(s)); wrong.push({ en: s, zh: '', from: o.en }); }
    }
    q.opts = shuffle([{ en: right, zh: '', ok: true }].concat(wrong));
  }
  return q;
}
function questionHtml(q) {
  const it = q.it, d = DICT[lc(it.en)];
  const say = `<button class="speak" data-say="${esc(it.en)}" aria-label="發音">${I.speak}</button>`;
  let stem;
  if (q.type === 'e2z') stem = `<div class="q-stem"><div class="en">${esc(it.en)}${say}</div></div>`;
  else if (q.type === 'z2e') stem = `<div class="q-stem">${esc(it.zh)}</div>`;
  else if (q.type === 'cloze') stem = `<div class="q-stem sent">${esc(it.ctx.before)} <span class="gap" id="gap">　</span> ${esc(it.ctx.after)}<div class="hint-line">提示：${esc(it.zh)}</div></div>`;
  else if (q.type === 'para') {
    const re = new RegExp('(' + it.en.slice(0, Math.max(3, it.en.length - 3)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[a-z]*)', 'i');
    stem = `<div class="q-stem sent en-sent">${esc(d.ex).replace(re, '<b>$1</b>')}<div class="hint-line">哪個字可以替換粗體字，意思不變？</div></div>`;
  } else if (q.type === 'para2') stem = `<div class="q-stem"><div class="en">${esc(q.syn)}</div><div class="hint-line">哪個單詞和它意思最接近？</div></div>`;
  else if (q.type === 'spell') stem = `<div class="q-stem">${esc(it.zh)}<div class="hint-line">首字母 <b class="serif">${esc(it.en[0])}</b>，共 ${it.en.length} 個字母</div></div>`;
  else stem = `<div class="q-stem"><button class="btn ghost listen" data-say="${esc(it.en)}">${I.speak} 再聽一次</button><div class="hint-line">聽發音，拼出單詞</div></div>`;
  const body = q.opts
    ? `<div class="opts">${q.opts.map((o, i) => `<button class="opt ${q.type === 'e2z' ? '' : 'en'}" data-i="${i}">${esc(q.type === 'e2z' ? o.zh : o.en)}</button>`).join('')}</div>`
    : `<input class="spell" id="sp" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="輸入英文單詞"><button class="btn block" id="spOk">確定</button>`;
  return `<span class="q-type">${QTYPES[q.type]}</span>${stem}${body}<div id="fb"></div>`;
}

/* ================= quiz runner ================= */
// items: words to ask. opts.typeFor(it, i) picks the question type; opts.srs: grade with answer time;
// opts.requeue: ask wrong words once more at the end; opts.onDone(summary) returns the result-screen html.
function runQuiz(items, title, back, opts = {}) {
  setTop(title, back); setTab(null);
  if (!items.length) { app.innerHTML = `<div class="empty">${opts.emptyMsg || '沒有需要練習的單詞'}</div>`; return; }
  const queue = items.map((it, i) => makeQuestion(it, opts.typeFor ? opts.typeFor(it, i) : 'e2z'));
  const total = queue.length, seen = new Set();
  let idx = 0, right = 0, slow = 0; const wrongs = [];
  const record = (q, ok, ms, picked) => {
    const k = lc(q.it.en), first = !seen.has(k); seen.add(k);
    if (!first) return; // a requeued question is practice only
    const cat = CAT[q.type], st = S.qstat[cat] || [0, 0];
    st[1]++; if (ok) st[0]++; S.qstat[cat] = st;
    const limit = q.opts ? 8000 : 15000;
    if (ok) {
      right++;
      const isSlow = ms > limit; if (isSlow) slow++;
      grade(k, isSlow ? 'slow' : 'ok');
      if (S.wrong[k]) { S.wrong[k].n--; if (S.wrong[k].n <= 0) delete S.wrong[k]; }
    } else {
      wrongs.push(q.it);
      const w = S.wrong[k] || { en: q.it.en, zh: q.it.zh, sid: q.it.sid, n: 0, ty: {} };
      w.n = Math.min(w.n + 1, 3); w.t = Date.now(); w.ty = w.ty || {}; w.ty[cat] = (w.ty[cat] || 0) + 1; S.wrong[k] = w;
      grade(k, 'bad');
      if (picked && picked.en && q.type !== 'para') { const p = pairKey(q.it.en, picked.en); S.conf[p] = (S.conf[p] || 0) + 1; }
      if (opts.requeue) queue.push(makeQuestion(q.it, q.type));
    }
    save();
  };
  const draw = () => {
    if (idx >= queue.length) {
      touchDay();
      const pct = Math.round(right / total * 100);
      app.innerHTML = `<div class="result">
        <div class="label">${opts.resultLabel || '本次得分'}</div>
        <div class="score">${opts.srs ? right : pct}<span>${opts.srs ? `/ ${total}` : '分'}</span></div>
        <p class="muted">${opts.srs ? `答對 ${right} 個${slow ? `，其中 ${slow} 個想得比較久，會提早再複習` : ''}` : `答對 ${right} / ${total}`}</p>
        ${wrongs.length ? `<div class="section-title">答錯的單詞</div><div class="wl">${wrongs.map(w => `<div class="wl-item"><span class="en">${esc(w.en)}</span><span class="zh">${esc(w.zh)}</span><button class="speak sm" data-say="${esc(w.en)}" aria-label="發音">${I.speak}</button></div>`).join('')}</div>` : ''}
        ${opts.onDone ? opts.onDone({ pct, right, total }) : `<div class="row"><a class="btn" href="${back}">完成</a></div>`}
      </div>`;
      return;
    }
    const q = queue[idx], it = q.it, isRetry = idx >= total;
    app.innerHTML = `
      <div class="fc-top"><span>${isRetry ? '再試一次' : `第 ${idx + 1} / ${total} 題`}</span><span>答對 ${right}</span></div>
      <div class="bar"><i style="width:${Math.min(idx, total) / total * 100}%"></i></div>
      ${questionHtml(q)}`;
    const t0 = performance.now();
    if (q.type === 'e2z' || q.type === 'listen') speak(it.en);
    const finish = (ok, picked) => {
      const d = DICT[lc(it.en)];
      record(q, ok, performance.now() - t0, picked);
      if ($('#gap')) $('#gap').textContent = it.en;
      $('#fb').innerHTML = `<div class="feedback ${ok ? 'ok' : 'no'}"><div>${ok ? '答對了' : '正確答案'}：<b class="serif">${esc(it.en)}</b> ${esc(it.zh)}</div>
          ${!ok && picked && picked.en && q.type !== 'para' && picked.zh ? `<div class="small">你選的 <b class="serif">${esc(picked.en)}</b> 是「${esc(picked.zh)}」</div>` : ''}
          ${q.type === 'para' && d ? `<div class="small">${esc(it.en)} 的同義字：${esc(d.syn.join(', '))}</div>` : ''}</div>
        <button class="btn block" style="margin-top:12px" id="nx">${idx + 1 < queue.length ? '下一題' : '看結果'}</button>`;
      $('#nx').onclick = () => { idx++; draw(); scrollTo(0, 0); };
      if (q.type !== 'e2z') speak(it.en);
      const at = idx;
      if (ok) setTimeout(() => { if (idx === at && $('#nx')) $('#nx').click(); }, 1100);
    };
    if (q.opts) {
      app.querySelectorAll('.opt').forEach(b => b.onclick = () => {
        const o = q.opts[b.dataset.i];
        app.querySelectorAll('.opt').forEach(x => { x.disabled = true; if (q.opts[x.dataset.i].ok) x.classList.add('right'); });
        if (!o.ok) b.classList.add('wrong');
        finish(!!o.ok, o.ok ? null : o);
      });
    } else {
      const inp = $('#sp'); inp.focus();
      const check = () => {
        if (inp.disabled || !inp.value.trim()) return;
        const ok = lc(inp.value.trim()) === lc(it.en);
        inp.disabled = true; $('#spOk').remove(); inp.classList.add(ok ? 'right' : 'wrong');
        finish(ok, null);
      };
      $('#spOk').onclick = check; inp.onkeydown = e => { if (e.key === 'Enter') check(); };
    }
  };
  draw();
}

// review: the question gets harder as the word's level rises
function reviewType(it, i) {
  const r = S.srs[lc(it.en)] || { lv: 0 };
  if (r.lv <= 1) return 'e2z';
  if (r.lv === 2) return i % 2 ? 'para2' : 'z2e';
  if (r.lv === 3) return i % 2 ? 'para' : 'cloze';
  return i % 2 ? 'listen' : 'spell';
}
function viewReview() {
  const keys = dueKeys().sort((a, b) => S.srs[a].lv - S.srs[b].lv || S.srs[a].due - S.srs[b].due);
  const batch = keys.slice(0, 20).map(itemFor);
  runQuiz(batch, '今日複習', '#/', {
    srs: true, requeue: true, typeFor: reviewType, resultLabel: '本輪複習', emptyMsg: '今天沒有到期的單詞了',
    onDone: () => {
      const left = dueKeys().length;
      return `<div class="row">${left ? `<a class="btn ghost" href="#/" >回今日</a><button class="btn" onclick="viewReview()">繼續（還有 ${left} 個）</button>` : `<a class="btn" href="#/">完成，回今日</a>`}</div>`;
    }
  });
}
function viewParaQuiz(id) {
  const st = BY_ID[id], pr = progOf(id);
  if (storyDone(id)) return runQuiz(shuffle(st.items).slice(0, 20), `${id}. 整篇測驗`, `#/s/${id}`, { typeFor: (it, i) => PARA_TYPES[i % PARA_TYPES.length] });
  const unit = shuffle(st.units[pr.p]).slice(0, 12);
  runQuiz(unit, `${id}. 第 ${unitIndex(st, pr.p)} 段小測驗`, `#/s/${id}`, {
    typeFor: (it, i) => PARA_TYPES[i % PARA_TYPES.length],
    onDone: ({ pct }) => {
      if (pct < 80) return `<p class="muted">80 分才算通過。再讀一次本段，然後重測。</p><div class="row"><a class="btn ghost" href="#/s/${id}">回本段</a><button class="btn" onclick="viewParaQuiz(${id})">重測</button></div>`;
      setStep(id, 3);
      const np = nextPara(id), finished = np.p >= st.paras.length, reached = newToday() >= S.goal;
      return `<p class="muted">${finished ? '這個故事全部學完了！' : '本段通過。'}${reached ? `今日新詞已達標（${newToday()}/${S.goal}）。` : ''}</p>
        <div class="row"><a class="btn ghost" href="#/">回今日</a>${finished
          ? (BY_ID[id + 1] ? `<a class="btn" href="#/s/${id + 1}">下一個故事</a>` : '')
          : `<a class="btn" href="#/s/${id}">${reached ? '仍要繼續下一段' : '下一段'}</a>`}</div>`;
    }
  });
}
const PARA_TYPES = ['e2z', 'para2', 'cloze', 'z2e', 'para', 'spell'];

/* ================= 單詞 ================= */
let wordFilter = 'all', wordQuery = '', wordTopic = '', wordLimit = 80;
const pairsOf = () => {
  const mine = Object.entries(S.conf).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ p, n }));
  const common = [];
  WORDS.forEach(w => ((DICT[w.k] && DICT[w.k].conf) || []).forEach(x => { if (WORD_MAP[lc(x)]) common.push({ p: pairKey(w.k, x), n: 0 }); }));
  const seen = new Set(); return mine.concat(common).filter(x => !seen.has(x.p) && seen.add(x.p));
};
function viewWords() {
  setTop('單詞'); setTab('words');
  const wrongN = Object.keys(S.wrong).length, starN = Object.keys(S.star).length;
  app.innerHTML = `
    <div class="search-row">
      <input class="search" id="q" type="search" placeholder="搜尋英文或中文…" value="${esc(wordQuery)}">
      <select class="select" id="topic"><option value="">全部話題</option>${TOPICS.map(t => `<option ${t === wordTopic ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="chips" style="margin:10px 0 12px">
      ${[['all', '全部'], ['star', `生詞 ${starN}`], ['wrong', `錯題 ${wrongN}`], ['pair', '易混淆'], ['known', '已掌握']].map(([k, t]) => `<button class="chip ${wordFilter === k ? 'on' : ''}" data-f="${k}">${t}</button>`).join('')}
    </div>
    <div id="wl"></div><div class="more" id="more"></div>`;
  const draw = () => {
    if (wordFilter === 'pair') return drawPairs();
    if (wordFilter === 'wrong') return drawWrong();
    const q = lc(wordQuery.trim());
    const list = WORDS.filter(w =>
      (wordFilter === 'all' || (wordFilter === 'star' && S.star[w.k]) || (wordFilter === 'known' && S.known[w.k])) &&
      (!wordTopic || (DICT[w.k] && DICT[w.k].topic === wordTopic)) &&
      (!q || w.k.includes(q) || w.uses.some(u => u.zh.includes(wordQuery.trim()))));
    const action = wordFilter === 'star' && list.length ? `<div class="row bar-actions"><a class="btn ghost" href="#/star/cards">生詞卡</a><a class="btn" href="#/star/quiz">生詞測驗</a></div>`
      : wordTopic ? `<div class="row bar-actions"><span class="muted small">「${esc(wordTopic)}」共 ${list.length} 詞，寫作和口語常用</span><a class="btn" href="#/topic/${encodeURIComponent(wordTopic)}">話題測驗</a></div>` : '';
    $('#wl').innerHTML = action + (list.length ? `<div class="wl">${list.slice(0, wordLimit).map(w =>
      `<div class="wl-item" data-k="${esc(w.k)}"><span class="en">${esc(w.en)}</span>${posOf(w.k) ? `<span class="pos">${esc(posOf(w.k))}</span>` : ''}<span class="zh">${esc([...new Set(w.uses.map(u => u.zh))].join('；'))}</span>
       ${S.known[w.k] ? '<span class="badge">已掌握</span>' : ''}${starBtn(S.star[w.k])}</div>`).join('')}</div>`
      : `<div class="empty">${wordFilter === 'star' ? '在故事裡點單詞，就能加入生詞本' : '沒有符合的單詞'}</div>`);
    $('#more').innerHTML = list.length > wordLimit ? `<button class="btn ghost" id="mb">顯示更多（還有 ${list.length - wordLimit} 個）</button>` : '';
    if ($('#mb')) $('#mb').onclick = () => { wordLimit += 120; keepScroll(draw); };
    bindWordRows(draw);
  };
  const drawWrong = () => {
    const groups = {};
    Object.entries(S.wrong).forEach(([k, w]) => {
      const ty = w.ty && Object.keys(w.ty).length ? Object.entries(w.ty).sort((a, b) => b[1] - a[1])[0][0] : 'meaning';
      (groups[ty] = groups[ty] || []).push([k, w]);
    });
    $('#more').innerHTML = '';
    $('#wl').innerHTML = Object.keys(groups).length ? `
      <div class="row bar-actions"><span class="muted small">答對一次扣一次，扣到 0 自動移出</span><a class="btn" href="#/mistakes/quiz">錯題測驗</a></div>
      ${Object.keys(CAT_NAME).filter(c => groups[c]).map(c => `<div class="group-title">${CAT_NAME[c]}出錯 · ${groups[c].length}</div>
        <div class="wl">${groups[c].sort((a, b) => b[1].n - a[1].n).map(([k, w]) => `<div class="wl-item" data-k="${esc(k)}"><span class="en">${esc(w.en)}</span><span class="zh">${esc(w.zh)}</span><span class="cnt">×${w.n}</span></div>`).join('')}</div>`).join('')}`
      : '<div class="empty">還沒有錯題</div>';
    bindWordRows(draw);
  };
  const drawPairs = () => {
    const pairs = pairsOf();
    $('#more').innerHTML = '';
    $('#wl').innerHTML = pairs.length ? `<p class="muted small">「你的」是你在測驗中選錯過兩次以上的組合；其餘是雅思常見的易混淆字。</p>
      <div class="wl">${pairs.slice(0, 150).map(({ p, n }) => { const [a, b] = p.split('|');
        return `<a class="wl-item" href="#/pair/${encodeURIComponent(a)}/${encodeURIComponent(b)}"><span class="en">${esc(WORD_MAP[a].en)}</span><span class="vs">vs</span><span class="en">${esc(WORD_MAP[b].en)}</span><span class="zh"></span>${n ? `<span class="badge bad">你的 ×${n}</span>` : ''}<span class="arrow">${I.chev}</span></a>`; }).join('')}</div>`
      : '<div class="empty">還沒有易混淆的單詞</div>';
  };
  draw();
  $('#q').oninput = e => { wordQuery = e.target.value; wordLimit = 80; if (wordFilter === 'pair' || wordFilter === 'wrong') wordFilter = 'all'; draw(); };
  $('#topic').onchange = e => { wordTopic = e.target.value; wordLimit = 80; if (wordFilter === 'pair' || wordFilter === 'wrong') wordFilter = 'all'; viewWords(); };
  app.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { wordFilter = b.dataset.f; wordLimit = 80; viewWords(); });
}
function bindWordRows(redraw) {
  app.querySelectorAll('.wl-item[data-k]').forEach(el => el.onclick = e => {
    const k = el.dataset.k;
    if (e.target.closest('.star')) { if (S.star[k]) delete S.star[k]; else S.star[k] = 1; save(); return keepScroll(redraw); }
    const u = itemFor(k); if (u) openSheet(u.en, { sid: u.sid, zh: (S.wrong[k] && S.wrong[k].zh) || u.zh, onChange: () => keepScroll(redraw) });
  });
}
const starItems = () => Object.keys(S.star).map(itemFor).filter(Boolean);
const mistakeItems = () => Object.entries(S.wrong).map(([k, w]) => { const u = itemFor(k); return u ? Object.assign({}, u, { zh: w.zh }) : null; }).filter(Boolean);
function mistakeType(it) {
  const w = S.wrong[lc(it.en)], ty = w && w.ty && Object.keys(w.ty).length ? Object.entries(w.ty).sort((a, b) => b[1] - a[1])[0][0] : 'meaning';
  return CAT_TYPE[ty]; // practise the kind of question the word was missed on
}

function viewPair(a, b) {
  setTop('易混淆對比', '#/words'); setTab(null);
  const card = k => {
    const u = itemFor(k), d = DICT[k] || {};
    return `<div class="pair-card"><div class="word"><span>${esc(u.en)}</span>${d.pos ? `<span class="pos">${esc(d.pos)}</span>` : ''}<button class="speak" data-say="${esc(u.en)}" aria-label="發音">${I.speak}</button></div>
      <div class="mean">${esc([...new Set(WORD_MAP[k].uses.map(x => x.zh))].join('；'))}</div>
      ${d.ex ? `<div class="ex-en">${esc(d.ex)}</div><div class="ex-zh">${esc(d.exZh)}</div>` : ''}
      ${d.col && d.col.length ? `<div class="small muted" style="margin-top:8px">搭配：${esc(d.col.map(c => c[0]).join(' · '))}</div>` : ''}</div>`;
  };
  app.innerHTML = `${card(a)}<div class="vs-line">vs</div>${card(b)}
    <div class="row" style="margin-top:16px"><button class="btn" id="pq">對比測驗</button></div>`;
  $('#pq').onclick = () => runQuiz(shuffle([itemFor(a), itemFor(b), itemFor(a), itemFor(b)]), '對比測驗', `#/pair/${encodeURIComponent(a)}/${encodeURIComponent(b)}`, { typeFor: (it, i) => ['e2z', 'z2e', 'cloze', 'para2'][i] });
}

/* ================= 我的 ================= */
function viewMe() {
  setTop('我的'); setTab('me');
  const doneStories = STORIES.filter(st => storyDone(st.id)).length;
  const cats = Object.keys(CAT_NAME).map(c => { const [r, t] = S.qstat[c] || [0, 0]; return { c, r, t, pct: t ? Math.round(r / t * 100) : null }; });
  const weak = weakest();
  app.innerHTML = `
    <div class="stat-grid">
      <div><b>${Object.keys(S.srs).length}</b><span>學過單詞</span></div>
      <div><b>${Object.keys(S.known).length}</b><span>已掌握</span></div>
      <div><b>${doneStories}</b><span>完成故事</span></div>
      <div><b>${streak()}</b><span>連續天數</span></div>
    </div>
    <div class="section-title">弱點分析 <span class="small muted">各題型正確率</span></div>
    <div class="card">
      ${cats.map(x => `<div class="meter"><span>${CAT_NAME[x.c]}</span><div class="meter-bar"><i style="width:${x.pct || 0}%" class="${x.pct != null && x.pct < 75 ? 'low' : ''}"></i></div><b>${x.pct == null ? '—' : x.pct + '%'}</b><small>${x.t} 題</small></div>`).join('')}
      ${weak ? `<div class="row" style="margin-top:12px"><a class="btn" href="#/practice/${weak.c}">加強${CAT_NAME[weak.c]}</a></div>` : `<p class="small muted" style="margin:8px 0 0">每種題型做滿 10 題後，正確率低於 75% 的會標出來並建議加強。</p>`}
    </div>
    <div class="section-title">學習設定</div>
    <div class="card">
      <div class="kv"><span>每日新詞</span><span class="chips">${[10, 20, 30, 50].map(n => `<button class="chip ${S.goal === n ? 'on' : ''}" data-goal="${n}">${n}</button>`).join('')}</span></div>
      <div class="kv"><span>深淺色</span><span class="chips">${[['', '系統'], ['light', '淺色'], ['dark', '深色']].map(([k, t]) => `<button class="chip ${S.theme === k ? 'on' : ''}" data-t="${k}">${t}</button>`).join('')}</span></div>
    </div>
    <div class="section-title">發音</div>
    <div class="card">
      <div class="kv"><span>口音</span><span class="chips">${[['en-GB', '英式'], ['en-US', '美式']].map(([k, t]) => `<button class="chip ${S.accent === k ? 'on' : ''}" data-ac="${k}">${t}</button>`).join('')}</span></div>
      <div class="kv"><span>聲音</span><select class="select" id="voiceSel"></select></div>
      <div class="kv"><span>語速</span><span class="chips">${[[0.7, '慢'], [0.9, '標準'], [1.1, '快']].map(([k, t]) => `<button class="chip ${S.rate === k ? 'on' : ''}" data-rate="${k}">${t}</button>`).join('')}</span></div>
      <div class="kv"><span>試聽</span><button class="speak" data-say="The weather forecast predicts a substantial amount of rain." aria-label="試聽">${I.speak}</button></div>
      <p class="small muted" style="margin:8px 0 0"><span id="voiceCount"></span>。聲音來自手機內建語音。iPhone 可到「設定 › 輔助使用 › 朗讀內容 › 聲音 › 英文」下載「加強版／高品質」聲音，下載後要把瀏覽器完全關掉（從多工畫面滑掉）再打開，新聲音才會出現在清單裡。</p>
    </div>
    <div class="section-title">進度</div>
    <div class="card">
      <p class="small muted" style="margin:0 0 12px">進度只存在這支手機的瀏覽器裡，換手機前請先匯出。</p>
      <div class="row"><button class="btn ghost" id="exp">匯出進度</button><button class="btn ghost" id="imp">匯入進度</button></div>
    </div>
    <div class="more"><button class="btn ghost danger" id="reset">重置所有進度</button></div>`;
  app.querySelectorAll('[data-goal]').forEach(b => b.onclick = () => { S.goal = +b.dataset.goal; save(); viewMe(); });
  app.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { S.theme = b.dataset.t; save(); applyTheme(); viewMe(); });
  app.querySelectorAll('[data-ac]').forEach(b => b.onclick = () => { S.accent = b.dataset.ac; S.voiceName = ''; save(); pickVoice(); viewMe(); });
  app.querySelectorAll('[data-rate]').forEach(b => b.onclick = () => { S.rate = +b.dataset.rate; save(); viewMe(); });
  fillVoiceSelect();
  $('#voiceSel').onchange = e => { S.voiceName = e.target.value; save(); pickVoice(); speak('Practice makes perfect.'); };
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
    Object.assign(S, { known: {}, star: {}, wrong: {}, srs: {}, prog: {}, newDay: {}, qstat: {}, conf: {}, cur: null, days: {} }); save(); viewMe();
  };
}
function fillVoiceSelect() {
  const sel = $('#voiceSel'); if (!sel) return;
  const sort = l => l.sort((a, b) => voiceRank(a) - voiceRank(b) || a.name.localeCompare(b.name));
  const mine = sort(accentVoices()), rest = sort(enVoices().filter(v => !mine.includes(v)));
  const opt = v => `<option value="${esc(v.name)}" ${voice && v.name === voice.name ? 'selected' : ''}>${esc(v.name)}${rest.includes(v) ? ' · ' + esc(v.lang) : ''}</option>`;
  // list every English voice the browser exposes; some phones tag voices with an unexpected accent
  sel.innerHTML = mine.length || rest.length
    ? `<optgroup label="${S.accent === 'en-US' ? '美式' : '英式'}">${mine.map(opt).join('')}</optgroup>${rest.length ? `<optgroup label="其他英文聲音">${rest.map(opt).join('')}</optgroup>` : ''}`
    : '<option>找不到英文語音</option>';
  const n = $('#voiceCount'); if (n) n.textContent = `瀏覽器提供 ${enVoices().length} 個英文聲音`;
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
  const parts = (path || '/').split('/').filter(Boolean).map(decodeURIComponent);
  const params = new URLSearchParams(query || '');
  scrollTo(0, 0);
  if (parts[0] === 's' && BY_ID[+parts[1]]) {
    const id = +parts[1], st = BY_ID[id], pr = progOf(id);
    if (parts[2] === 'cards') {
      const unit = storyDone(id) ? st.items : st.units[pr.p];
      return viewCards(unit, `${id}. 第 ${unitIndex(st, pr.p)} 段單詞卡`, `#/s/${id}`, {
        onFinish: () => { if (!storyDone(id)) { setStep(id, 1); S.mode = 'review'; save(); } },
        doneMsg: '下一步：回到故事，遮住中文把本段再讀一遍', nextHref: `#/s/${id}`, nextLabel: '下一步：回想'
      });
    }
    if (parts[2] === 'quiz') return viewParaQuiz(id);
    if (parts[2] === 'list') return viewStoryList(id);
    return viewStory(id, params.get('w'));
  }
  if (parts[0] === 'stories') return viewStories();
  if (parts[0] === 'review') return viewReview();
  if (parts[0] === 'words') return viewWords();
  if (parts[0] === 'pair' && WORD_MAP[parts[1]] && WORD_MAP[parts[2]]) return viewPair(parts[1], parts[2]);
  if (parts[0] === 'topic' && TOPICS.includes(parts[1])) {
    const items = WORDS.filter(w => DICT[w.k] && DICT[w.k].topic === parts[1]).map(w => w.uses[0]);
    return runQuiz(shuffle(items).slice(0, 15), `話題測驗 · ${parts[1]}`, '#/words', { typeFor: (it, i) => PARA_TYPES[i % PARA_TYPES.length] });
  }
  if (parts[0] === 'practice' && CAT_TYPE[parts[1]]) {
    const items = Object.keys(S.srs).filter(k => WORD_MAP[k]).sort((a, b) => S.srs[a].lv - S.srs[b].lv).slice(0, 60).map(itemFor);
    return runQuiz(shuffle(items).slice(0, 12), `加強 · ${CAT_NAME[parts[1]]}`, '#/me', { typeFor: () => CAT_TYPE[parts[1]], emptyMsg: '先學一些單詞再來加強' });
  }
  if (parts[0] === 'star') {
    if (parts[1] === 'cards') return viewCards(shuffle(starItems()), '生詞卡', '#/words');
    return runQuiz(shuffle(starItems()).slice(0, 20), '生詞測驗', '#/words', { typeFor: (it, i) => PARA_TYPES[i % PARA_TYPES.length] });
  }
  if (parts[0] === 'mistakes') return runQuiz(shuffle(mistakeItems()).slice(0, 20), '錯題測驗', '#/words', { typeFor: mistakeType, emptyMsg: '錯題本是空的' });
  if (parts[0] === 'me') return viewMe();
  return viewToday();
}

applyTheme();
document.documentElement.style.setProperty('--font', S.font + 'px');
// the version in index.html's script URL also busts the cache for the data files
const VER = new URL(document.currentScript.src).searchParams.get('v') || '';
Promise.all([
  fetch(`data/stories.json?v=${VER}`).then(r => r.json()),
  fetch(`data/dict.json?v=${VER}`).then(r => r.json()).catch(() => ({}))
])
  .then(([d, dict]) => { DICT = dict; prepare(d); addEventListener('hashchange', route); route(); })
  .catch(() => { app.innerHTML = '<div class="empty">資料載入失敗，請重新整理</div>'; });
