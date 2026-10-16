// Тексты: загрузка, разбор плиток перевода, проверка ответа.
import A1 from '../data/texts-a1.js';
import A2 from '../data/texts-a2.js';
import B1 from '../data/texts-b1.js';
import PA1 from '../data/phrases-a1.js';
import PA2 from '../data/phrases-a2.js';
import PB1 from '../data/phrases-b1.js';

import { lex } from './data.js';

// Русские имена из словаря — их не переводим в нижний регистр
const NAMES = new Set(lex.entries.filter((e) => e.pos === 'name').map((e) => e.main.split(' ')[0].toLowerCase()));
const isName = (word) => NAMES.has(word.toLowerCase().replace(/ё/g, 'е')) || NAMES.has(word.toLowerCase());

const tag = (arr, kind) => arr.map((t) => ({ ...t, kind }));

export const LEVELS = [
  { id: 'A1', name: 'A1', title: 'Начальный', hint: 'Короткие предложения в настоящем времени', texts: [...tag(PA1, 'phrases'), ...tag(A1, 'story')] },
  { id: 'A2', name: 'A2', title: 'Элементарный', hint: 'Истории в прошедшем времени', texts: [...tag(PA2, 'phrases'), ...tag(A2, 'story')] },
  { id: 'B1', name: 'B1', title: 'Средний', hint: 'Длинные предложения и сложная грамматика', texts: [...tag(PB1, 'phrases'), ...tag(B1, 'story')] },
];

export const ALL_TEXTS = LEVELS.flatMap((l) => l.texts.map((t) => ({ ...t, level: l.id })));
export const TEXT_BY_ID = new Map(ALL_TEXTS.map((t) => [t.id, t]));

// Плитка без знаков препинания (для сравнения и показа)
export function cleanTile(s) {
  return s.replace(/[«»"“”!?.,;:]/g, '').replace(/(^|\s)—(\s|$)/g, ' ').replace(/^—|—$/g, '').replace(/\s+/g, ' ').trim();
}
export const keyOf = (s) => cleanTile(s).toLowerCase().replace(/ё/g, 'е');

export function parseSentence([en, ru, distractors = [], alts = []]) {
  const parts = ru.split('|').map((p) => p.trim());
  const tiles = parts.map(cleanTile).filter(Boolean);
  // Первую плитку пишем с маленькой буквы, чтобы заглавная не подсказывала начало фразы
  if (tiles.length && !isName(tiles[0].split(' ')[0])) tiles[0] = tiles[0].charAt(0).toLowerCase() + tiles[0].slice(1);
  // Красивая строка перевода с пунктуацией из исходника
  let display = parts.join(' ').replace(/\s+([,.:;!?»])/g, '$1').replace(/«\s+/g, '«').trim();
  display = display.charAt(0).toUpperCase() + display.slice(1);
  if (!/[.!?»]$/.test(display)) {
    const end = (en.trim().match(/[.!?]["”]?$/) || ['.'])[0].replace(/["”]/, '');
    display += end;
  }
  const altKeys = alts.map((a) => a.split('|').map(keyOf).filter(Boolean).join(' '));
  return {
    en,
    display,
    tiles,
    distractors: distractors.map(cleanTile),
    orders: [tiles.map(keyOf).join(' '), ...altKeys],
  };
}

const sorted = (arr) => [...arr].map(keyOf).sort().join('\u0001');

// Проверка: набор плиток совпадает с правильным (порядок в русском свободный).
// Возвращает { ok, natural } — natural=false, если порядок необычный.
export function checkAnswer(parsed, answerTiles) {
  const ok = sorted(answerTiles) === sorted(parsed.tiles);
  const order = answerTiles.map(keyOf).join(' ');
  return { ok, natural: ok && parsed.orders.includes(order) };
}

// Перемешать плитки (стабильно для одного предложения в рамках попытки)
export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
