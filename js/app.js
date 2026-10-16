// Lumen — главный модуль: маршруты и экраны.
import { lex } from './data.js';
import { POS_LABEL, tokenize, lookupInContext } from './lexicon.js';
import { LEVELS, ALL_TEXTS, TEXT_BY_ID, parseSentence, checkAnswer, shuffle, keyOf } from './content.js';
import * as S from './store.js';
import * as R from './srs.js';
import { icon, esc, toast, dialog, speak, starsHtml, ringSvg, plural } from './ui.js';

const app = document.getElementById('app');
const P = () => S.profile();

// ---------- Маршрутизация ----------
function route() {
  closePop();
  document.querySelector('.sheet-wrap')?.remove();
  if (!P()) return renderOnboarding();
  const [name, arg, sub] = location.hash.replace(/^#\/?/, '').split('/');
  window.scrollTo(0, 0);
  switch (name) {
    case 'text': return sub === 'read' ? renderReader(arg) : renderExercise(arg);
    case 'review': return renderReview();
    case 'words': return renderWords();
    case 'progress': return renderProgress();
    case 'settings': return renderSettings();
    default: return renderHome();
  }
}
const go = (h) => { if (location.hash === h) route(); else location.hash = h; };
window.addEventListener('hashchange', route);

function reviewLeft(p) {
  const d = R.ensureDaily(p);
  return d.items.filter((id) => p.words[id] && !d.done[id]).length;
}

function tabbar(active) {
  const left = reviewLeft(P());
  const t = (h, key, ic, label, badge = '') => `<a href="${h}" class="${active === key ? 'on' : ''}" ${active === key ? 'aria-current="page"' : ''}>${ic}<span>${label}</span>${badge}</a>`;
  return `<nav class="tabbar glass" aria-label="Разделы">
    ${t('#/', 'home', icon.book, 'Тексты')}
    ${t('#/review', 'review', icon.repeat, 'Повторение', left ? `<span class="badge">${left}</span>` : '')}
    ${t('#/progress', 'progress', icon.chart, 'Прогресс')}
    ${t('#/settings', 'settings', icon.gear, 'Настройки')}
  </nav>`;
}

const ringDefs = `<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="var(--raspberry)"/></linearGradient></defs></svg>`;

// ---------- Онбординг ----------
function renderOnboarding(fromSettings = false) {
  let level = 'A1';
  app.innerHTML = `<main class="screen full onboard">
    <div class="logo">Lumen</div>
    <p class="logo-sub">Английский через чтение: переводите фразы и истории, собирая перевод из слов.</p>
    <div class="stack" style="margin-top:34px">
      <label for="nm" class="section-title" style="display:block;margin:0 4px">Как вас зовут?</label>
      <input id="nm" class="input" autocomplete="given-name" placeholder="Имя" maxlength="24">
      <div class="section-title" style="margin:22px 4px 0">С какого уровня начать?</div>
      <div class="level-pick">
        ${LEVELS.map((l) => `<button class="glass ${l.id === level ? 'on' : ''}" data-lv="${l.id}"><span class="lv">${l.id}</span><span><b>${l.title}</b><br><span class="small muted">${l.hint}</span></span></button>`).join('')}
      </div>
      <p class="small faint" style="margin:0 4px">Уровень можно сменить в любой момент — все тексты открыты.</p>
      <button id="go" class="btn primary block" style="margin-top:22px">Начать</button>
      ${fromSettings ? '<button id="cancel" class="btn ghost block">Отмена</button>' : ''}
    </div></main>`;
  app.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', () => {
    level = b.dataset.lv;
    app.querySelectorAll('[data-lv]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  app.querySelector('#go').addEventListener('click', () => {
    const name = app.querySelector('#nm').value.trim() || 'Ученик';
    S.createProfile({ name, level });
    go('#/');
  });
  app.querySelector('#cancel')?.addEventListener('click', () => go('#/settings'));
}

// ---------- Главная ----------
let homeLevel = null;
let homeKind = 'phrases';

function textProgress(p, t) {
  const st = p.texts[t.id];
  if (!st) return '';
  if (st.stars) return starsHtml(st.stars);
  if (st.session) return `<span class="pill">${st.session.done}/${t.s.length}</span>`;
  return '';
}

function nextText(p) {
  const inProgress = ALL_TEXTS.find((t) => p.texts[t.id]?.session);
  if (inProgress) return { t: inProgress, label: 'Продолжить' };
  const lvl = LEVELS.find((l) => l.id === p.level);
  const fresh = lvl.texts.find((t) => !p.texts[t.id]?.stars);
  return fresh ? { t: { ...fresh, level: lvl.id }, label: 'Следующий' } : null;
}

function isIosBrowser() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios && !navigator.standalone && !matchMedia('(display-mode: standalone)').matches;
}

function renderHome() {
  const p = P();
  homeLevel ||= p.level;
  const st = S.getState();
  const li = S.levelInfo(p.xp);
  const day = S.dayStats(p);
  const goal = p.settings.dailyGoal;
  const left = reviewLeft(p);
  const daily = R.ensureDaily(p);
  const next = nextText(p);
  const lvl = LEVELS.find((l) => l.id === homeLevel);
  const kinds = { phrases: lvl.texts.filter((t) => t.kind === 'phrases'), story: lvl.texts.filter((t) => t.kind === 'story') };
  if (!kinds[homeKind].length) homeKind = kinds.phrases.length ? 'phrases' : 'story';
  const list = kinds[homeKind];
  const doneCount = lvl.texts.filter((t) => p.texts[t.id]?.stars).length;

  app.innerHTML = `${ringDefs}<main class="screen">
    ${isIosBrowser() && !st.device.installHintClosed ? `<div class="banner glass">${icon.share}<div class="small"><b>Установите приложение</b><br>Нажмите «Поделиться» → «На экран „Домой“». Так прогресс надёжно сохранится в телефоне.</div><button class="x" id="closeHint" aria-label="Скрыть">×</button></div>` : ''}
    <header class="hello">
      <h1>Привет, ${esc(p.name)}</h1>
      <div class="chips">
        <span class="chip glass" title="Дней подряд"><span class="flame">${icon.flame}</span>${S.streak(p)}</span>
      </div>
    </header>

    <a class="card glass tap today" href="#/progress" style="text-decoration:none;color:inherit">
      <div class="ring">${ringSvg(day.xp / goal)}<b>${Math.min(100, Math.round((day.xp / goal) * 100))}%</b></div>
      <div class="lines">
        <h3>Цель на сегодня — ${goal} очков</h3>
        <p class="small muted">Набрано ${day.xp}. Уровень ${li.level} · ${li.name}</p>
        <p class="small muted">${daily.items.length ? (left ? `Слов на повторение: ${left}` : 'Повторение на сегодня пройдено') : 'Удерживайте слово в тексте, чтобы добавить его на повторение'}</p>
      </div>
    </a>

    ${next ? `<div class="section-title">${next.label}</div>
    <a class="card glass tap continue" href="#/text/${next.t.id}" style="text-decoration:none;color:inherit">
      <span class="emoji">${next.t.icon}</span>
      <span style="flex:1;min-width:0"><span class="t">${esc(next.t.title)}</span><br><span class="small muted">${esc(next.t.ru)} · ${next.t.level}</span></span>
    </a>` : ''}

    <div class="section-title">Уровень</div>
    <div class="segmented glass" role="tablist">
      ${LEVELS.map((l) => `<button role="tab" aria-selected="${l.id === homeLevel}" class="${l.id === homeLevel ? 'on' : ''}" data-level="${l.id}">${l.id}<small>${l.title}</small></button>`).join('')}
    </div>
    <p class="level-hint small muted">${lvl.hint}. Пройдено ${doneCount} из ${lvl.texts.length}.</p>

    ${kinds.phrases.length && kinds.story.length ? `<div class="segmented glass" style="margin-top:12px">
      <button class="${homeKind === 'phrases' ? 'on' : ''}" data-kind="phrases">Фразы · ${kinds.phrases.length}</button>
      <button class="${homeKind === 'story' ? 'on' : ''}" data-kind="story">Истории · ${kinds.story.length}</button>
    </div>` : ''}

    <div class="texts">
      ${list.map((t) => `<a class="card glass tap text-card" href="#/text/${t.id}" style="text-decoration:none;color:inherit">
        <span class="emoji">${t.icon}</span>
        <span style="min-width:0"><span class="t">${esc(t.title)}</span><div class="s">${esc(t.ru)} · ${t.s.length} ${plural(t.s.length, 'фраза', 'фразы', 'фраз')}</div></span>
        ${textProgress(p, t)}
      </a>`).join('')}
    </div>
  </main>${tabbar('home')}`;

  app.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => { homeLevel = b.dataset.level; renderHome(); }));
  app.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { homeKind = b.dataset.kind; renderHome(); }));
  app.querySelector('#closeHint')?.addEventListener('click', () => { st.device.installHintClosed = true; S.save(); renderHome(); });
}

// ---------- Слова в предложении: долгое нажатие ----------
let popEl = null;
function closePop() {
  popEl?.remove();
  popEl = null;
  document.querySelectorAll('.w.lit').forEach((x) => x.classList.remove('lit'));
}
document.addEventListener('pointerdown', (e) => {
  if (popEl && !popEl.contains(e.target) && !e.target.closest('.w')) closePop();
}, true);
window.addEventListener('scroll', closePop, { passive: true });

function sentenceHtml(en, p) {
  let wi = 0;
  const words = [];
  const html = tokenize(en).map((tok) => {
    if (!tok.word) return esc(tok.t);
    words.push(tok.t);
    return `<span class="w" data-i="${wi++}">${esc(tok.t)}</span>`;
  }).join('');
  return { html, words };
}

function markSaved(container, words, p) {
  container.querySelectorAll('.w').forEach((el) => {
    const hit = lookupInContext(lex, words, +el.dataset.i);
    el.classList.toggle('saved', !!hit && hit.entries.some((e) => p.words[e.id]));
  });
}

function bindWords(container, words, en, onAdd) {
  const p = P();
  markSaved(container, words, p);
  let timer = null, startX = 0, startY = 0, target = null, fired = false;
  const cancel = () => { clearTimeout(timer); target?.classList.remove('holding'); target = null; };
  container.addEventListener('contextmenu', (e) => e.preventDefault());
  container.addEventListener('pointerdown', (e) => {
    const w = e.target.closest('.w');
    if (!w) return;
    target = w; fired = false; startX = e.clientX; startY = e.clientY;
    w.classList.add('holding');
    timer = setTimeout(() => {
      fired = true;
      w.classList.remove('holding');
      showWord(w, container, words, en, onAdd);
      if (navigator.vibrate) navigator.vibrate(12);
    }, 420);
  });
  container.addEventListener('pointermove', (e) => {
    if (target && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel();
  });
  container.addEventListener('pointerup', (e) => {
    const w = target;
    cancel();
    if (w && !fired && p.settings.speakOnTap) speak(w.textContent, p.settings.rate);
  });
  container.addEventListener('pointercancel', cancel);
}

function showWord(el, container, words, en, onAdd) {
  closePop();
  const p = P();
  const i = +el.dataset.i;
  const hit = lookupInContext(lex, words, i);
  for (let k = hit ? hit.start : i; k < (hit ? hit.start + hit.len : i + 1); k++) container.querySelector(`.w[data-i="${k}"]`)?.classList.add('lit');
  const surface = hit ? words.slice(hit.start, hit.start + hit.len).join(' ') : words[i];
  let status = '';
  if (!hit) {
    status = '<div class="status known">Этого слова пока нет в словаре</div>';
  } else {
    const main = hit.entries[0];
    if (main.pos === 'name') status = '<div class="status known">Имя собственное</div>';
    else {
      const added = R.addWord(p, main, en, 'tap');
      if (added) { onAdd?.(main); status = `<div class="status">${icon.check}Добавлено в повторение</div>`; }
      else status = `<div class="status known">${icon.check}Уже в списке повторения</div>`;
    }
  }
  if (!p.coach.hold) { p.coach.hold = true; S.save(); container.closest('main')?.querySelector('.coach')?.remove(); }
  const body = hit ? hit.entries.map((e) => `<div class="pos">${POS_LABEL[e.pos] || e.pos}${e.level ? ' · ' + e.level : ''}</div><div class="tr">${esc(e.ru)}</div>`).join('') : '';
  const lemma = hit && hit.entries[0].w.toLowerCase() !== surface.toLowerCase() ? `<span class="lemma">${esc(hit.entries[0].w)}</span>` : '';
  popEl = document.createElement('div');
  popEl.className = 'pop';
  popEl.setAttribute('role', 'dialog');
  popEl.innerHTML = `<div class="head"><span class="word">${esc(surface)}</span>${lemma}<span class="spacer"></span><button class="icon-btn" aria-label="Произнести" style="width:36px;height:36px">${icon.speaker}</button></div>${body}${status}`;
  popEl.querySelector('button').addEventListener('click', () => speak(surface, p.settings.rate));
  document.body.appendChild(popEl);
  const r = el.getBoundingClientRect();
  const pr = popEl.getBoundingClientRect();
  let top = r.top - pr.height - 10;
  if (top < 12) top = r.bottom + 10;
  const left = Math.max(12, Math.min(window.innerWidth - pr.width - 12, r.left + r.width / 2 - pr.width / 2));
  popEl.style.top = top + 'px';
  popEl.style.left = left + 'px';
  markSaved(container, words, p);
}

// ---------- Упражнение ----------
function startSession(t) {
  return { queue: t.s.map((_, i) => ({ i, retry: false })), pos: 0, done: 0, mistakes: 0, hints: 0, xp: 0, added: 0 };
}

function renderExercise(id) {
  const t = TEXT_BY_ID.get(id);
  if (!t) return go('#/');
  const p = P();
  const st = (p.texts[id] ||= { stars: 0, plays: 0 });
  st.session ||= startSession(t);
  const ses = st.session;
  S.save();
  if (ses.pos >= ses.queue.length) return finishText(t);

  const item = ses.queue[ses.pos];
  const parsed = parseSentence(t.s[item.i]);
  // Плитки: правильные + обманки, перемешаны
  const bank = shuffle([...parsed.tiles, ...parsed.distractors]).map((text, k) => ({ k, text }));
  let answer = [];
  let checked = false;
  let usedHint = false;

  const { html, words } = sentenceHtml(parsed.en, p);
  const long = parsed.en.length > 70;
  app.innerHTML = `<main class="screen full">
    <div class="ex-top">
      <button class="icon-btn" id="quit" aria-label="Выйти">${icon.close}</button>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${t.s.length}" aria-valuenow="${ses.done}"><i style="width:${(ses.done / t.s.length) * 100}%"></i></div>
      <span class="counter">${Math.min(ses.done + 1, t.s.length)}/${t.s.length}</span>
    </div>
    <section class="page glass">
      <div class="label">${item.retry ? 'Ещё раз' : 'Переведите'} <button class="icon-btn speak" id="say" aria-label="Прослушать предложение" style="width:38px;height:38px">${icon.speaker}</button></div>
      <p class="sentence ${long ? 'long' : ''}" lang="en">${html}</p>
      ${!p.coach.hold ? `<div class="coach">${icon.hand}<span>Удерживайте слово — появится перевод</span></div>` : ''}
    </section>
    <div class="answer" id="answer" aria-label="Ваш перевод"></div>
    <div class="bank" id="bank"></div>
    <div class="actions">
      <button class="btn ghost" id="hint" aria-label="Подсказка">${icon.bulb}</button>
      ${p.tester ? `<button class="btn ghost" id="reveal" aria-label="Показать ответ">${icon.eye}</button>` : ''}
      <button class="btn primary" id="check" disabled>Проверить</button>
    </div>
  </main>`;

  const ansEl = app.querySelector('#answer');
  const bankEl = app.querySelector('#bank');
  const checkBtn = app.querySelector('#check');

  function draw(animK = null) {
    ansEl.innerHTML = answer.map((k) => `<button class="tile ${k === animK ? 'in' : ''}" data-k="${k}">${esc(bank[k].text)}</button>`).join('');
    bankEl.innerHTML = bank.map((b) => `<button class="tile ${answer.includes(b.k) ? 'ghost' : ''}" data-k="${b.k}" ${answer.includes(b.k) ? 'tabindex="-1" aria-hidden="true"' : ''}>${esc(b.text)}</button>`).join('');
    checkBtn.disabled = answer.length === 0;
  }
  draw();

  bankEl.addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (!b || checked) return;
    const k = +b.dataset.k;
    if (answer.includes(k)) return;
    answer.push(k);
    draw(k);
  });
  ansEl.addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (!b || checked) return;
    answer = answer.filter((k) => k !== +b.dataset.k);
    draw();
  });

  bindWords(app.querySelector('.sentence'), words, parsed.en, () => { ses.added++; });
  app.querySelector('#say').addEventListener('click', () => speak(parsed.en, p.settings.rate));
  app.querySelector('#quit').addEventListener('click', () => go('#/'));

  app.querySelector('#hint').addEventListener('click', () => {
    if (checked) return;
    // Убираем неверные плитки и добавляем следующую правильную по порядку
    const need = parsed.tiles.map(keyOf);
    const counts = {};
    need.forEach((k) => (counts[k] = (counts[k] || 0) + 1));
    answer = answer.filter((k) => {
      const key = keyOf(bank[k].text);
      if (counts[key] > 0) { counts[key]--; return true; }
      return false;
    });
    const missing = need.find((k) => counts[k] > 0);
    if (missing) {
      const free = bank.find((b) => !answer.includes(b.k) && keyOf(b.text) === missing);
      if (free) answer.push(free.k);
      usedHint = true;
      draw(free?.k);
    } else {
      toast('Все нужные слова уже на месте — можно проверять');
      draw();
    }
  });
  app.querySelector('#reveal')?.addEventListener('click', () => {
    const used = new Set();
    answer = parsed.tiles.map((tile) => {
      const b = bank.find((x) => !used.has(x.k) && keyOf(x.text) === keyOf(tile));
      used.add(b.k);
      return b.k;
    });
    usedHint = true;
    draw();
  });

  checkBtn.addEventListener('click', () => {
    if (checked) return;
    checked = true;
    const res = checkAnswer(parsed, answer.map((k) => bank[k].text));
    let gained = 0;
    if (res.ok) {
      gained = usedHint || item.retry ? 5 : 10;
      ses.done++;
    } else {
      ses.mistakes++;
      ansEl.querySelectorAll('.tile').forEach((el) => {
        const key = keyOf(el.textContent);
        if (!parsed.tiles.some((x) => keyOf(x) === key)) el.classList.add('wrong');
      });
      if (!item.retry) ses.queue.push({ i: item.i, retry: true });
      else ses.done++;
    }
    if (usedHint) ses.hints++;
    ses.pos++;
    if (gained) { ses.xp += gained; S.addXp(p, gained, 'sentences'); }
    S.save();
    showFeedback(res, parsed, item, gained, () => renderExercise(id));
  });
}

function showFeedback(res, parsed, item, gained, next) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  const good = res.ok;
  wrap.innerHTML = `<div class="sheet ${good ? 'good' : 'bad'}" role="status">
    <h2>${good ? icon.check + (gained ? `Верно! <span class="small" style="margin-left:auto">+${gained}</span>` : 'Верно!') : 'Не совсем'}</h2>
    <p class="small muted" style="margin-top:6px">${good ? (res.natural ? 'Перевод:' : 'Тоже правильно. Чаще говорят так:') : 'Правильный перевод:'}</p>
    <p class="ru">${esc(parsed.display)}</p>
    ${!good ? `<p class="small muted">${item.retry ? 'Идём дальше.' : 'Это предложение вернётся в конце.'}</p>` : ''}
    <button class="btn ${good ? 'good' : 'bad'} block" id="next">Дальше</button>
  </div>`;
  document.body.appendChild(wrap);
  const btn = wrap.querySelector('#next');
  btn.focus();
  btn.addEventListener('click', () => { wrap.remove(); next(); });
}

function finishText(t) {
  const p = P();
  const st = p.texts[t.id];
  const ses = st.session;
  const penalty = ses.mistakes + ses.hints * 0.5;
  const stars = penalty === 0 ? 3 : penalty <= 2 ? 2 : 1;
  const bonus = 15 + stars * 5;
  const newLevel = S.addXp(p, bonus, 'texts');
  const total = ses.xp + bonus;
  st.stars = Math.max(st.stars || 0, stars);
  st.plays = (st.plays || 0) + 1;
  st.last = S.today(p);
  const added = ses.added;
  delete st.session;
  S.save(true);

  app.innerHTML = `<main class="screen full result">
    <h1>${stars === 3 ? 'Безупречно!' : stars === 2 ? 'Отлично!' : 'Готово!'}</h1>
    <p class="muted" style="margin-top:6px">${esc(t.title)} · ${esc(t.ru)}</p>
    <div class="big-stars">${[1, 2, 3].map((i) => icon.star.replace('<svg', `<svg class="${i <= stars ? 'on' : ''}"`)).join('')}</div>
    ${newLevel ? `<p style="font-weight:650;color:var(--primary)">Новый уровень: ${S.levelInfo(p.xp).level} · ${S.levelInfo(p.xp).name}</p>` : ''}
    <div class="stat-row">
      <div class="stat glass"><b>+${total}</b><span>очков</span></div>
      <div class="stat glass"><b>${ses.mistakes}</b><span>${plural(ses.mistakes, 'ошибка', 'ошибки', 'ошибок')}</span></div>
      <div class="stat glass"><b>${added}</b><span>${plural(added, 'слово', 'слова', 'слов')} на повторение</span></div>
    </div>
    <div class="stack">
      <a class="btn ghost block" href="#/text/${t.id}/read">Прочитать ${t.kind === 'story' ? 'текст' : 'фразы'} целиком</a>
      <a class="btn primary block" href="#/">К текстам</a>
    </div>
  </main>`;
}

// ---------- Чтение целиком ----------
function renderReader(id) {
  const t = TEXT_BY_ID.get(id);
  if (!t) return go('#/');
  const p = P();
  let showRu = false;
  app.innerHTML = `<main class="screen full">
    <div class="ex-top">
      <a class="icon-btn" href="#/" aria-label="Назад">${icon.back}</a>
      <h2 style="flex:1">${esc(t.title)}</h2>
      <button class="btn ghost small" id="tr">Показать перевод</button>
    </div>
    <p class="small muted" style="margin:0 4px 14px">Удерживайте слово, чтобы увидеть перевод и добавить его на повторение.</p>
    <article class="card glass reader">${t.s.map((s, i) => {
      const { html } = sentenceHtml(s[0], p);
      return `<div class="pair"><p lang="en" class="en-par" data-s="${i}">${html}</p><p class="ru-par" hidden>${esc(parseSentence(s).display)}</p></div>`;
    }).join('')}</article>
    <div style="margin-top:16px" class="stack">
      <a class="btn primary block" href="#/text/${t.id}">${p.texts[t.id]?.stars ? 'Пройти ещё раз' : 'Перевести'}</a>
    </div>
  </main>`;
  app.querySelectorAll('.en-par').forEach((el) => {
    const s = t.s[+el.dataset.s];
    const { words } = sentenceHtml(s[0], p);
    bindWords(el, words, s[0]);
  });
  app.querySelector('#tr').addEventListener('click', (e) => {
    showRu = !showRu;
    app.querySelectorAll('.ru-par').forEach((x) => (x.hidden = !showRu));
    e.currentTarget.textContent = showRu ? 'Скрыть перевод' : 'Показать перевод';
  });
}

// ---------- Повторение ----------
function renderReview() {
  const p = P();
  const d = R.ensureDaily(p);
  d.items = d.items.filter((id) => p.words[id]);
  const total = d.items.length;
  const doneN = d.items.filter((id) => d.done[id]).length;
  const frac = total ? doneN / total : 0;
  const current = d.items.find((id) => !d.done[id]);
  const wordsTotal = Object.keys(p.words).length;

  const header = `<header class="row" style="margin-bottom:14px">
      <h1 style="flex:1">Повторение</h1>
      <a class="btn ghost small" href="#/words">Мои слова · ${wordsTotal}</a>
    </header>
    <div class="fill" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(frac * 100)}"><i style="width:${frac * 100}%"></i></div>
    <div class="fill-meta"><span>Сегодня: ${doneN} из ${total}</span><span>${Math.round(frac * 100)}%</span></div>`;

  if (!current) {
    let body;
    if (!wordsTotal) {
      body = `<div class="card glass empty">
        <div class="big">📖</div><h2>Пока нет слов</h2>
        <p class="muted" style="margin:8px 0 18px">Удерживайте незнакомое слово в тексте — оно появится здесь. Или возьмите слова из текстов своего уровня.</p>
        <button class="btn primary block" id="more">Подобрать слова</button></div>`;
    } else if (!total) {
      body = `<div class="card glass empty">
        <div class="big">🌙</div><h2>На сегодня слов нет</h2>
        <p class="muted" style="margin:8px 0 18px">Все слова в хорошей форме. Новая подборка появится завтра.</p>
        <button class="btn primary block" id="more">Подобрать новые слова</button></div>`;
    } else {
      if (!d.bonus) { d.bonus = true; S.addXp(p, 20); toast('Порция пройдена: +20 очков'); }
      const right = d.items.filter((id) => d.done[id] === 'right').length;
      body = `<div class="card glass empty">
        <div class="big">✨</div><h2>Порция на сегодня пройдена</h2>
        <p class="muted" style="margin:8px 0 18px">Верно с первого раза: ${right} из ${total}. Трудные слова вернутся завтра.</p>
        <button class="btn primary block" id="more">Подобрать новые слова</button></div>`;
    }
    app.innerHTML = `<main class="screen">${header}${body}</main>${tabbar('review')}`;
    app.querySelector('#more').addEventListener('click', () => {
      const n = R.addMoreWords(p, lex, 5);
      toast(n ? `Добавлено ${n} ${plural(n, 'слово', 'слова', 'слов')}` : 'Новых слов пока нет — пройдите ещё несколько текстов');
      renderReview();
    });
    return;
  }

  const entry = lex.byId.get(current);
  if (!entry) { R.removeWord(p, current); return renderReview(); }
  const w = p.words[current];
  const options = R.buildOptions(lex, entry);
  const ctx = w.ctx ? esc(w.ctx).replace(new RegExp(`\\b(${entry.w.split(' ')[0].replace(/[^a-z']/gi, '')}\\w*)`, 'i'), '<mark>$1</mark>') : '';

  app.innerHTML = `<main class="screen">${header}
    <section class="card glass quiz-word">
      <div class="en" lang="en">${esc(entry.w)}</div>
      <div class="pos">${POS_LABEL[entry.pos] || ''}</div>
      ${ctx ? `<div class="ctx" lang="en">${ctx}</div>` : ''}
      <button class="icon-btn" id="say" aria-label="Произнести" style="margin-top:14px">${icon.speaker}</button>
    </section>
    <div class="options">${options.map((o) => `<button class="option" data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    <button class="btn raspberry block dontknow" id="dk">Не знаю</button>
    <button class="btn ghost block" id="more" style="margin-top:10px">${icon.plus}Подобрать новые слова</button>
  </main>${tabbar('review')}`;

  app.querySelector('#say').addEventListener('click', () => speak(entry.w, p.settings.rate));
  let answered = false;
  const finish = (result, picked) => {
    if (answered) return;
    answered = true;
    R.answer(p, current, result);
    S.addXp(p, result === 'right' ? 3 : 1, 'reviews');
    app.querySelectorAll('.option').forEach((b) => {
      b.disabled = true;
      if (b.dataset.o === entry.main) b.classList.add('right');
      else if (b === picked) b.classList.add('wrong');
    });
    const bar = app.querySelector('.fill > i');
    const nd = d.items.filter((id) => d.done[id]).length;
    bar.style.width = (nd / total) * 100 + '%';
    app.querySelector('.fill-meta').innerHTML = `<span>Сегодня: ${nd} из ${total}</span><span>${Math.round((nd / total) * 100)}%</span>`;
    if (result === 'right') {
      setTimeout(renderReview, 650);
    } else {
      const dk = app.querySelector('#dk');
      dk.outerHTML = `<div class="card glass" style="margin-top:14px"><p class="small muted">${entry.w} —</p><p style="font-size:18px;font-weight:600">${esc(entry.ru)}</p><p class="small muted" style="margin-top:4px">Слово чаще будет попадаться в подборках.</p></div><button class="btn primary block" id="nextw" style="margin-top:12px">Дальше</button>`;
      app.querySelector('#nextw').addEventListener('click', renderReview);
      app.querySelector('#nextw').focus();
    }
  };
  app.querySelectorAll('.option').forEach((b) => b.addEventListener('click', () => finish(b.dataset.o === entry.main ? 'right' : 'wrong', b)));
  app.querySelector('#dk').addEventListener('click', () => finish('dontknow'));
  app.querySelector('#more').addEventListener('click', () => {
    const n = R.addMoreWords(p, lex, 5);
    toast(n ? `Добавлено ${n} ${plural(n, 'слово', 'слова', 'слов')}` : 'Новых слов пока нет');
    renderReview();
  });
}

function renderWords() {
  const p = P();
  const items = Object.entries(p.words)
    .map(([id, w]) => ({ id, w, e: lex.byId.get(id) }))
    .filter((x) => x.e)
    .sort((a, b) => a.w.box - b.w.box || a.e.w.localeCompare(b.e.w));
  app.innerHTML = `<main class="screen">
    <div class="ex-top"><a class="icon-btn" href="#/review" aria-label="Назад">${icon.back}</a><h2 style="flex:1">Мои слова · ${items.length}</h2></div>
    ${items.length ? `<p class="small muted" style="margin:0 4px 12px">Полоски — насколько хорошо слово запомнилось. Сверху самые трудные.</p>
    <div class="word-list">${items.map(({ id, w, e }) => `<div class="word-row glass">
      <div><div class="en" lang="en">${esc(e.w)}</div><div class="ru">${esc(e.ru)}</div></div>
      <div class="strength" aria-label="Сила ${w.box} из 6">${[1, 2, 3, 4, 5, 6].map((i) => `<i class="${i <= w.box ? 'on' : ''}"></i>`).join('')}</div>
      <button class="del" data-del="${esc(id)}" aria-label="Удалить ${esc(e.w)}">${icon.trash}</button>
    </div>`).join('')}</div>` : `<div class="card glass empty"><div class="big">📖</div><p class="muted">Список пуст. Удерживайте слово в тексте, чтобы добавить его.</p></div>`}
  </main>${tabbar('review')}`;
  app.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    R.removeWord(p, b.dataset.del);
    renderWords();
  }));
}

// ---------- Прогресс ----------
function renderProgress() {
  const p = P();
  const li = S.levelInfo(p.xp);
  const ws = R.stats(p);
  const todayN = S.dayNum(S.today(p));
  const days = Array.from({ length: 14 }, (_, k) => {
    const key = S.keyFromNum(todayN - 13 + k);
    return { key, xp: p.days[key]?.xp || 0, today: k === 13 };
  });
  const max = Math.max(30, ...days.map((d) => d.xp));
  const sentences = Object.values(p.days).reduce((a, d) => a + (d.sentences || 0), 0);
  const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  app.innerHTML = `${ringDefs}<main class="screen">
    <h1 style="margin-bottom:16px">Прогресс</h1>
    <section class="card glass level-hero">
      <div class="ring">${ringSvg(li.into / li.need, 120, 11)}<b>${li.level}<small>уровень</small></b></div>
      <div><h2>${li.name}</h2><p class="muted small" style="margin-top:4px">До следующего уровня ${li.need - li.into} ${plural(li.need - li.into, 'очко', 'очка', 'очков')}</p><p class="faint small">Всего ${p.xp} очков</p></div>
    </section>
    <div class="grid2" style="margin-top:10px">
      <div class="stat glass"><b>${S.streak(p)}</b><span>${plural(S.streak(p), 'день', 'дня', 'дней')} подряд</span></div>
      <div class="stat glass"><b>${S.bestStreak(p)}</b><span>лучшая серия</span></div>
      <div class="stat glass"><b>${sentences}</b><span>предложений переведено</span></div>
      <div class="stat glass"><b>${ws.learned}<span class="faint" style="font-size:15px"> / ${ws.total}</span></b><span>слов выучено</span></div>
    </div>
    <div class="section-title">Последние две недели</div>
    <section class="card glass">
      <div class="chart" aria-label="Очки по дням">${days.map((d) => `<div class="bar ${d.xp ? '' : 'zero'} ${d.today ? 'today' : ''}" style="height:${Math.max(3, (d.xp / max) * 100)}%" title="${d.key}: ${d.xp}"></div>`).join('')}</div>
      <div class="chart-labels">${days.map((d) => `<span>${wd[new Date(d.key + 'T12:00').getDay()]}</span>`).join('')}</div>
    </section>
    <div class="section-title">Пройдено по уровням</div>
    <section class="card glass">
      ${LEVELS.map((l) => {
        const done = l.texts.filter((t) => p.texts[t.id]?.stars).length;
        const stars = l.texts.reduce((a, t) => a + (p.texts[t.id]?.stars || 0), 0);
        return `<div class="lvl-progress"><div class="row"><span>${l.id} · ${l.title}</span><span class="small muted">${done}/${l.texts.length} · ${stars}★</span></div><div class="bar-thin"><i style="width:${(done / l.texts.length) * 100}%"></i></div></div>`;
      }).join('')}
    </section>
  </main>${tabbar('progress')}`;
}

// ---------- Настройки ----------
function renderSettings() {
  const p = P();
  const st = S.getState();
  const seg = (name, cur, opts) => `<div class="segmented glass">${opts.map(([v, label]) => `<button class="${String(cur) === String(v) ? 'on' : ''}" data-${name}="${v}">${label}</button>`).join('')}</div>`;
  app.innerHTML = `<main class="screen">
    <h1 style="margin-bottom:6px">Настройки</h1>

    <div class="section-title">Профиль</div>
    <div class="list glass">
      ${S.profiles().map((x) => `<button class="item" data-switch="${x.id}">
        <span class="avatar">${esc(x.name.slice(0, 1).toUpperCase())}</span>
        <span class="grow"><b>${esc(x.name)}</b><div class="sub">${x.level} · уровень ${S.levelInfo(x.xp).level}${x.tester ? ' · тестировщик' : ''}</div></span>
        ${x.id === p.id ? `<span class="check">${icon.check}</span>` : ''}
      </button>`).join('')}
      <button class="item" id="addProfile"><span class="avatar" style="background:var(--hair);color:var(--ink-2)">${icon.plus}</span><span class="grow">Добавить профиль</span></button>
    </div>
    <p class="small faint" style="margin:8px 4px 0">У каждого профиля свой прогресс и свои слова.</p>

    <div class="section-title">Имя</div>
    <input class="input" id="name" value="${esc(p.name)}" maxlength="24">

    <div class="section-title">Мой уровень</div>
    ${seg('lv', p.level, LEVELS.map((l) => [l.id, l.id]))}

    <div class="section-title">Тема</div>
    ${seg('theme', st.device.theme, [['auto', 'Авто'], ['light', 'Светлая'], ['dark', 'Тёмная']])}

    <div class="section-title">Слов в ежедневной подборке</div>
    ${seg('daily', p.settings.dailyCount, [[10, '10'], [15, '15'], [20, '20'], [30, '30']])}

    <div class="section-title">Цель на день</div>
    ${seg('goal', p.settings.dailyGoal, [[30, '30'], [50, '50'], [100, '100'], [150, '150']])}

    <div class="section-title">Озвучка</div>
    <div class="list glass">
      <button class="item" id="tapSpeak"><span class="grow">Произносить слово при касании<div class="sub">Долгое нажатие — перевод</div></span><span class="toggle ${p.settings.speakOnTap ? 'on' : ''}"></span></button>
      <div class="item"><span class="grow">Скорость речи</span>${seg('rate', p.settings.rate, [[0.7, 'Медленно'], [0.9, 'Обычно']])}</div>
    </div>

    <div class="section-title">Данные</div>
    <div class="list glass">
      <button class="item" id="export">${icon.download}<span class="grow">Сохранить копию прогресса<div class="sub">Файл со всеми профилями</div></span></button>
      <label class="item" style="cursor:pointer">${icon.upload}<span class="grow">Восстановить из файла</span><input type="file" id="import" accept="application/json,.json" class="sr-only"></label>
      <button class="item" id="tester"><span class="grow">Режим тестировщика<div class="sub">Кнопка ответа и инструменты проверки</div></span><span class="toggle ${p.tester ? 'on' : ''}"></span></button>
      <button class="item danger" id="reset">Сбросить прогресс профиля</button>
      ${S.profiles().length > 1 ? '<button class="item danger" id="delProfile">Удалить этот профиль</button>' : ''}
    </div>

    ${p.tester ? `<div class="section-title">Тестирование</div>
    <div class="list glass">
      <div class="item"><span class="grow">Дата в приложении<div class="sub">${S.today(p)}${p.dayOffset ? ` (сдвиг ${p.dayOffset > 0 ? '+' : ''}${p.dayOffset} дн.)` : ''}</div></span></div>
      <button class="item" id="nextDay">Перейти на следующий день</button>
      ${p.dayOffset ? '<button class="item" id="realDay">Вернуться к настоящей дате</button>' : ''}
      <button class="item" id="rebuild">Пересобрать подборку на сегодня</button>
      <button class="item" id="add20">Добавить 20 слов из текстов</button>
    </div>` : ''}

    <p class="tiny faint" style="text-align:center;margin-top:26px">Lumen · ${ALL_TEXTS.length} текстов · ${lex.entries.length} слов в словаре<br>Прогресс хранится только на этом устройстве</p>
  </main>${tabbar('settings')}`;

  const on = (sel, ev, fn) => app.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
  on('[data-switch]', 'click', (e) => { S.switchProfile(e.currentTarget.dataset.switch); homeLevel = null; renderSettings(); toast('Профиль переключён'); });
  on('#addProfile', 'click', () => renderOnboarding(true));
  on('#name', 'change', (e) => { p.name = e.target.value.trim() || p.name; S.save(); toast('Имя сохранено'); });
  on('[data-lv]', 'click', (e) => { p.level = e.currentTarget.dataset.lv; homeLevel = p.level; S.save(); renderSettings(); });
  on('[data-theme]', 'click', (e) => { st.device.theme = e.currentTarget.dataset.theme; S.save(); S.applyTheme(); renderSettings(); });
  on('[data-daily]', 'click', (e) => { p.settings.dailyCount = +e.currentTarget.dataset.daily; S.save(); renderSettings(); toast('Применится к завтрашней подборке'); });
  on('[data-goal]', 'click', (e) => { p.settings.dailyGoal = +e.currentTarget.dataset.goal; S.save(); renderSettings(); });
  on('[data-rate]', 'click', (e) => { p.settings.rate = +e.currentTarget.dataset.rate; S.save(); renderSettings(); speak('Hello! Nice to meet you.', p.settings.rate); });
  on('#tapSpeak', 'click', () => { p.settings.speakOnTap = !p.settings.speakOnTap; S.save(); renderSettings(); });
  on('#tester', 'click', () => { p.tester = !p.tester; S.save(); renderSettings(); });
  on('#export', 'click', exportProgress);
  on('#import', 'change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const ok = await dialog({ title: 'Восстановить прогресс?', text: 'Текущие данные на этом устройстве заменятся данными из файла.', buttons: [{ label: 'Восстановить', cls: 'primary', value: true }, { label: 'Отмена', value: false }] });
    if (!ok) return;
    try { S.importData(await f.text()); S.applyTheme(); toast('Прогресс восстановлен'); route(); }
    catch (err) { toast('Не получилось прочитать файл: ' + err.message, 3500); }
  });
  on('#reset', 'click', async () => {
    const ok = await dialog({ title: 'Сбросить прогресс?', text: `Очки, пройденные тексты и слова профиля «${esc(p.name)}» удалятся. Это нельзя отменить.`, buttons: [{ label: 'Сбросить', cls: 'bad', value: true }, { label: 'Отмена', value: false }] });
    if (ok) { S.resetProfile(p); toast('Прогресс сброшен'); renderSettings(); }
  });
  on('#delProfile', 'click', async () => {
    const ok = await dialog({ title: 'Удалить профиль?', text: `Профиль «${esc(p.name)}» и весь его прогресс удалятся.`, buttons: [{ label: 'Удалить', cls: 'bad', value: true }, { label: 'Отмена', value: false }] });
    if (ok) { S.deleteProfile(p.id); homeLevel = null; route(); }
  });
  on('#nextDay', 'click', () => { p.dayOffset++; S.save(); toast('Теперь в приложении ' + S.today(p)); renderSettings(); });
  on('#realDay', 'click', () => { p.dayOffset = 0; p.daily = null; S.save(); renderSettings(); });
  on('#rebuild', 'click', () => { R.rebuildDaily(p); toast('Подборка пересобрана'); renderSettings(); });
  on('#add20', 'click', () => { const n = R.addMoreWords(p, lex, 20); toast(`Добавлено ${n}`); renderSettings(); });
}

async function exportProgress() {
  const data = S.exportData();
  const name = `lumen-progress-${S.dateKey(new Date())}.json`;
  const file = new File([data], name, { type: 'application/json' });
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Прогресс Lumen' }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Файл сохранён');
}

// ---------- Запуск ----------
S.applyTheme();
navigator.storage?.persist?.().catch(() => {});
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
route();
