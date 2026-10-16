// Повторение слов: ежедневная подборка, интервалы, «Не знаю», подбор новых слов.
import { today, dayNum, save } from './store.js';
import { tokenize, lookupInContext, CONTENT_POS } from './lexicon.js';
import { ALL_TEXTS } from './content.js';

// Через сколько дней показать слово снова (по «силе» слова 0…6)
const INTERVALS = [1, 1, 2, 4, 7, 14, 30];
export const MAX_BOX = 6;

export function hasWord(p, id) { return !!p.words[id]; }

export function addWord(p, entry, ctx, src = 'tap') {
  if (p.words[entry.id]) return false;
  p.words[entry.id] = {
    added: today(p), box: 0, due: dayNum(today(p)), lapses: 0, boost: src === 'tap' ? 1 : 0,
    right: 0, seen: 0, ctx: ctx || '', src,
  };
  save();
  return true;
}
export function removeWord(p, id) {
  delete p.words[id];
  if (p.daily) {
    p.daily.items = p.daily.items.filter((x) => x !== id);
    delete p.daily.done[id];
  }
  save();
}

// Чем выше — тем важнее повторить сегодня.
export function priority(w, todayN) {
  let s = 0;
  if (w.due <= todayN) s += 100 + Math.min(30, (todayN - w.due) * 3);
  s += w.boost * 40;          // «Не знаю» и ошибки сильно поднимают слово
  s += w.lapses * 6;
  s += (MAX_BOX - w.box) * 5; // слабые слова важнее
  return s;
}

function ranked(p, exclude = new Set()) {
  const t = dayNum(today(p));
  return Object.entries(p.words)
    .filter(([id]) => !exclude.has(id))
    .map(([id, w]) => [id, priority(w, t) + Math.random() * 4])
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

// Ежедневная подборка: создаётся один раз в день.
export function ensureDaily(p) {
  const key = today(p);
  if (p.daily && p.daily.day === key) return p.daily;
  const t = dayNum(key);
  // Слова, которые сегодня по плану или помечены как трудные; затем — самые слабые из остальных
  const ids = ranked(p).filter((id) => {
    const w = p.words[id];
    return w.due <= t || w.boost > 0 || w.box < 4;
  });
  p.daily = { day: key, items: ids.slice(0, p.settings.dailyCount), done: {}, bonus: false, extra: 0 };
  save();
  return p.daily;
}

export function rebuildDaily(p) { p.daily = null; return ensureDaily(p); }

export function answer(p, id, result) {
  const w = p.words[id];
  if (!w) return;
  const t = dayNum(today(p));
  w.seen++;
  if (result === 'right') {
    w.right++;
    w.box = Math.min(MAX_BOX, w.box + 1);
    w.due = t + INTERVALS[w.box];
    w.boost = Math.max(0, w.boost - 1);
  } else if (result === 'wrong') {
    w.lapses++;
    w.box = Math.max(0, w.box - 1);
    w.due = t + 1;
    w.boost += 1;
  } else { // 'dontknow'
    w.lapses++;
    w.box = 0;
    w.due = t + 1;
    w.boost += 3;
  }
  if (p.daily && p.daily.items.includes(id)) p.daily.done[id] = result;
  save();
}

// Служебные слова, которые нет смысла учить отдельно
const SKIP = new Set(['be|v', 'have|v', 'do|v', 'will|v', 'can|v', 'get|v', 'there is|ph']);

// Слова из текстов, которые пользователь уже читал (или текущего уровня).
function candidateWordsFromTexts(p, lex) {
  const levelOrder = ['A1', 'A2', 'B1'];
  const maxLevel = levelOrder.indexOf(p.level);
  const touched = ALL_TEXTS.filter((t) => p.texts[t.id]);
  const rest = ALL_TEXTS.filter((t) => !p.texts[t.id] && levelOrder.indexOf(t.level) <= maxLevel);
  const out = [];
  const seen = new Set();
  for (const t of [...touched, ...rest]) {
    for (const s of t.s) {
      const words = tokenize(s[0]).filter((x) => x.word).map((x) => x.t);
      words.forEach((_, i) => {
        const hit = lookupInContext(lex, words, i);
        if (!hit) return;
        const e = hit.entries[0];
        if (!CONTENT_POS.has(e.pos) || SKIP.has(e.id) || seen.has(e.id) || p.words[e.id]) return;
        seen.add(e.id);
        out.push({ entry: e, ctx: s[0] });
      });
    }
  }
  // Если слова из текстов закончились — берём из словаря своего уровня и ниже
  const extra = lex.entries.filter((e) => CONTENT_POS.has(e.pos) && e.level && levelOrder.indexOf(e.level) <= maxLevel && !seen.has(e.id) && !p.words[e.id]);
  for (let i = extra.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [extra[i], extra[j]] = [extra[j], extra[i]];
  }
  // Сначала слова текущего уровня, затем более простые
  extra.sort((a, b) => (b.level === p.level) - (a.level === p.level));
  for (const e of extra) out.push({ entry: e, ctx: '' });
  return out;
}

// «Подобрать новые слова»: сначала из своего списка, затем новые из текстов.
export function addMoreWords(p, lex, n = 5) {
  const d = ensureDaily(p);
  const inToday = new Set(d.items);
  const t = dayNum(today(p));
  const own = ranked(p, inToday).filter((id) => p.words[id].due <= t + 2 || p.words[id].box < 5);
  const picked = own.slice(0, n);
  if (picked.length < n) {
    for (const { entry, ctx } of candidateWordsFromTexts(p, lex).slice(0, n - picked.length)) {
      addWord(p, entry, ctx, 'auto');
      picked.push(entry.id);
    }
  }
  d.items.push(...picked);
  d.extra = (d.extra || 0) + picked.length;
  save();
  return picked.length;
}

// Варианты ответа: та же часть речи, разные переводы.
export function buildOptions(lex, entry, count = 4) {
  const samePos = (e) => e.pos === entry.pos || (entry.pos === 'ph' && e.pos === 'v') || (entry.pos === 'v' && e.pos === 'ph');
  let pool = lex.entries.filter((e) => e.id !== entry.id && samePos(e) && e.main !== entry.main && e.pos !== 'name');
  // Варианты того же уровня правдоподобнее
  const sameLevel = pool.filter((e) => e.level === entry.level);
  if (sameLevel.length >= 12) pool = sameLevel;
  const picked = [];
  const usedMain = new Set([entry.main]);
  while (picked.length < count - 1 && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    const e = pool.splice(i, 1)[0];
    if (usedMain.has(e.main)) continue;
    usedMain.add(e.main);
    picked.push(e.main);
  }
  const all = [...picked, entry.main];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all;
}

export function stats(p) {
  const words = Object.values(p.words);
  return {
    total: words.length,
    learned: words.filter((w) => w.box >= 4).length,
  };
}
