// Сборка словаря из файлов по уровням.
import { buildLexicon } from './lexicon.js';
import A1 from '../data/dict-a1.js';
import A2 from '../data/dict-a2.js';
import B1 from '../data/dict-b1.js';
import NAMES from '../data/names.js';

export const lex = buildLexicon([['A1', A1], ['A2', A2], ['B1', B1], [null, NAMES]]);
