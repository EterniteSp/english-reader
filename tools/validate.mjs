// Проверка данных: node tools/validate.mjs
// — каждое английское слово есть в словаре;
// — плитки-обманки не совпадают с правильными;
// — id текстов уникальны, у каждого предложения есть плитки.
import { lex } from '../js/data.js';
import { tokenize, lookupInContext, REVIEWABLE } from '../js/lexicon.js';
import { ALL_TEXTS, parseSentence, keyOf } from '../js/content.js';


const errors = [];
const warn = [];
const ids = new Set();
let sentences = 0;

for (const t of ALL_TEXTS) {
  if (ids.has(t.id)) errors.push(`Повтор id ${t.id}`);
  ids.add(t.id);
  if (!t.title || !t.ru || !t.icon) errors.push(`${t.id}: нет title/ru/icon`);
  t.s.forEach((raw, i) => {
    sentences++;
    const where = `${t.id} #${i + 1}`;
    if (!Array.isArray(raw) || raw.length < 2) return errors.push(`${where}: плохой формат`);
    const p = parseSentence(raw);
    if (p.tiles.length < 1) errors.push(`${where}: нет плиток`);
    if (p.distractors.length < 2) warn.push(`${where}: меньше 2 обманок`);
    const correct = new Set(p.tiles.map(keyOf));
    for (const d of p.distractors) if (correct.has(keyOf(d))) errors.push(`${where}: обманка «${d}» совпадает с правильной плиткой`);
    const words = tokenize(p.en).filter((x) => x.word).map((x) => x.t);
    words.forEach((w, wi) => {
      if (!lookupInContext(lex, words, wi)) errors.push(`${where}: нет в словаре «${w}»`);
    });
  });
}

const reviewable = lex.entries.filter((e) => REVIEWABLE.has(e.pos));
const byPos = {};
for (const e of reviewable) byPos[e.pos] = (byPos[e.pos] || 0) + 1;
for (const [pos, n] of Object.entries(byPos)) if (n < 4) warn.push(`Часть речи ${pos}: только ${n} слов — мало для вариантов ответа`);

console.log(`Текстов: ${ALL_TEXTS.length}, предложений: ${sentences}, слов в словаре: ${lex.entries.length}`);
console.log('По частям речи:', byPos);
if (warn.length) console.log('\nПредупреждения:\n' + warn.join('\n'));
if (errors.length) {
  console.log('\nОШИБКИ:\n' + [...new Set(errors)].join('\n'));
  process.exit(1);
}
console.log('\nВсё в порядке.');
