// Словарь: разбор data/dict.js, автоматические формы слов, поиск слова по его форме в тексте.
// Используется и приложением, и валидатором (tools/validate.mjs).

export const POS_LABEL = {
  n: 'существительное', v: 'глагол', adj: 'прилагательное', adv: 'наречие',
  pron: 'местоимение', prep: 'предлог', conj: 'союз', num: 'числительное',
  det: 'определитель', ph: 'выражение', int: 'междометие', name: 'имя',
};

// Части речи, которые имеет смысл тренировать в разделе «Повторение».
export const REVIEWABLE = new Set(['n', 'v', 'adj', 'adv', 'ph', 'pron', 'prep', 'conj', 'num', 'det', 'int']);
export const CONTENT_POS = new Set(['n', 'v', 'adj', 'adv', 'ph']);

const VOWELS = 'aeiou';
const isCons = (c) => c && !VOWELS.includes(c) && /[a-z]/.test(c);

function sForms(w) {
  if (/(s|x|z|ch|sh|o)$/.test(w)) return [w + 'es', w + 's'];
  if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'ies'];
  if (/fe?$/.test(w)) return [w + 's', w.replace(/fe?$/, 'ves')];
  return [w + 's'];
}
function doubled(w) {
  const a = w[w.length - 3], b = w[w.length - 2], c = w[w.length - 1];
  return w.length >= 3 && isCons(a) && VOWELS.includes(b) && isCons(c) && !'wxy'.includes(c) ? w + c : null;
}
function edForms(w) {
  if (w.endsWith('e')) return [w + 'd'];
  if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'ied'];
  const d = doubled(w);
  return d ? [d + 'ed', w + 'ed'] : [w + 'ed'];
}
function ingForms(w) {
  if (w.endsWith('ie')) return [w.slice(0, -2) + 'ying'];
  if (w.endsWith('e') && !w.endsWith('ee') && w.length > 2) return [w.slice(0, -1) + 'ing'];
  const d = doubled(w);
  return d ? [d + 'ing', w + 'ing'] : [w + 'ing'];
}
function cmpForms(w) {
  if (w.endsWith('e')) return [w + 'r', w + 'st'];
  if (/[^aeiou]y$/.test(w)) return [w.slice(0, -1) + 'ier', w.slice(0, -1) + 'iest'];
  const d = doubled(w);
  return d ? [d + 'er', d + 'est'] : [w + 'er', w + 'est'];
}

export function autoForms(lemma, pos) {
  if (lemma.includes(' ')) {
    // выражение: склоняем первое слово как глагол
    const [first, ...rest] = lemma.split(' ');
    const tail = ' ' + rest.join(' ');
    return [...sForms(first), ...edForms(first), ...ingForms(first)].map((f) => f + tail);
  }
  switch (pos) {
    case 'n': return sForms(lemma);
    case 'v': return [...sForms(lemma), ...edForms(lemma), ...ingForms(lemma)];
    case 'adj': return cmpForms(lemma);
    case 'name': return [];
    default: return [];
  }
}

// Строка словаря: lemma | pos | перевод (варианты через запятую) | особые формы через запятую (необязательно)
export function parseDict(text, level = null) {
  const entries = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('@')) { level = line.slice(1).trim(); continue; } // @A2 — дальше слова уровня A2
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 3) throw new Error('Плохая строка словаря: ' + line);
    const [w, pos, ru, forms = ''] = parts;
    entries.push({
      w, pos, ru, level,
      main: ru.split(',')[0].trim(),
      forms: forms ? forms.split(',').map((f) => f.trim().toLowerCase()).filter(Boolean) : [],
    });
  }
  return entries;
}

// sources: строка словаря или массив [уровень, строка]
export function buildLexicon(sources) {
  const list = typeof sources === 'string' ? [[null, sources]] : sources;
  const entries = list.flatMap(([level, text]) => parseDict(text, level));
  const byId = new Map();
  const strong = new Map(); // форма -> [entry] (слово и явные формы)
  const weak = new Map(); // автоматические формы — слабее явных
  const add = (map, f, e) => {
    const list = map.get(f) || [];
    if (!list.includes(e)) list.push(e);
    map.set(f, list);
  };
  for (const e of entries) {
    e.id = e.w.toLowerCase() + '|' + e.pos;
    if (byId.has(e.id)) throw new Error('Дубликат в словаре: ' + e.w + ' (' + e.pos + ')');
    byId.set(e.id, e);
  }
  for (const e of entries) {
    add(strong, e.w.toLowerCase(), e);
    for (const f of e.forms) add(strong, f, e);
  }
  for (const e of entries) {
    for (const f of autoForms(e.w.toLowerCase(), e.pos)) if (!strong.has(f)) add(weak, f, e);
  }
  // Возвращает список статей (основная — первая) или пустой список.
  const lookupForm = (form) => {
    const f = form.toLowerCase().replace(/’/g, "'");
    return strong.get(f) || weak.get(f) || [];
  };
  return { entries, byId, lookupForm };
}

// Разбивка английского предложения на слова и промежутки.
export function tokenize(sentence) {
  const out = [];
  const re = /[A-Za-zÀ-ÿ]+(?:['’][A-Za-zÀ-ÿ]+)*(?:-[A-Za-zÀ-ÿ]+)*/g;
  let last = 0, m;
  while ((m = re.exec(sentence))) {
    if (m.index > last) out.push({ t: sentence.slice(last, m.index), word: false });
    out.push({ t: m[0], word: true });
    last = m.index + m[0].length;
  }
  if (last < sentence.length) out.push({ t: sentence.slice(last), word: false });
  return out;
}

// Найти словарные статьи для слова в позиции i (среди слов предложения).
// Сначала ищем выражения из 4, 3 и 2 слов, содержащие это слово.
export function lookupInContext(lex, words, i) {
  const norm = (s) => s.toLowerCase().replace(/’/g, "'");
  for (const len of [4, 3, 2]) {
    for (let start = i - len + 1; start <= i; start++) {
      if (start < 0 || start + len > words.length) continue;
      const phrase = words.slice(start, start + len).map(norm).join(' ');
      const found = lex.lookupForm(phrase).filter((e) => e.w.includes(' '));
      if (found.length) return { entries: found, start, len };
    }
  }
  const w = norm(words[i]);
  let found = lex.lookupForm(w);
  if (!found.length && w.endsWith("'s")) found = lex.lookupForm(w.slice(0, -2));
  // Слово с большой буквы не в начале предложения — сначала имя собственное
  if (i > 0 && /^[A-Z]/.test(words[i])) found = [...found].sort((a, b) => (b.pos === 'name') - (a.pos === 'name'));
  if (!found.length && w.includes('-')) found = lex.lookupForm(w.split('-')[0]);
  return found.length ? { entries: found, start: i, len: 1 } : null;
}
