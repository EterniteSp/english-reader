// Сборка словаря из файлов по уровням.
import { buildLexicon } from './lexicon.js';
import D from '../data/dict.js';

export const lex = buildLexicon([[null, D]]);
