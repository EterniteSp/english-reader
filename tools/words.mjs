import a1 from '../data/texts-a1.js'; import a2 from '../data/texts-a2.js'; import b1 from '../data/texts-b1.js';
import { tokenize } from '../js/lexicon.js';
const set=new Set();
for (const t of [...a1,...a2,...b1]) for (const s of t.s) for (const tok of tokenize(s[0])) if(tok.word) set.add(tok.t.toLowerCase().replace(/’/g,"'"));
console.log([...set].sort().join(' ')); console.error(set.size);
