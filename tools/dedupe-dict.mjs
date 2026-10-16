// Убирает повторы словаря между уровнями (оставляет первое вхождение A1→A2→B1)
// и строки «(не используется)». Запуск: node tools/dedupe-dict.mjs
import fs from 'fs';
const files = ['data/dict-a1.js', 'data/dict-a2.js', 'data/dict-b1.js'];
const seen = new Map();
let removed = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  const out = [];
  let inBody = false;
  for (const line of lines) {
    if (line.startsWith('export default `')) { inBody = true; out.push(line); continue; }
    if (line.startsWith('`;')) { inBody = false; out.push(line); continue; }
    const t = line.trim();
    if (inBody && t && !t.startsWith('#') && !t.startsWith('@') && t.includes('|')) {
      const [w, pos, ru] = t.split('|').map((x) => x.trim());
      if (/не используется/.test(ru)) { removed.push(`${f}: ${t}`); continue; }
      const id = w.toLowerCase() + '|' + pos;
      if (seen.has(id)) { removed.push(`${f}: ${t}  (уже в ${seen.get(id)})`); continue; }
      seen.set(id, f);
    }
    out.push(line);
  }
  fs.writeFileSync(f, out.join('\n'));
}
console.log(removed.join('\n'));
console.log('Удалено:', removed.length, 'Итого слов:', seen.size);
