// Тексты: загрузка, разбор плиток перевода, проверка ответа.
import A1 from '../data/texts-a1.js';
import A2 from '../data/texts-a2.js';
import B1 from '../data/texts-b1.js';

export const LEVELS = [
  { id: 'A1', name: 'A1', title: 'Начальный', hint: 'Короткие предложения в настоящем времени', texts: A1 },
  { id: 'A2', name: 'A2', title: 'Элементарный', hint: 'Истории в прошедшем времени', texts: A2 },
  { id: 'B1', name: 'B1', title: 'Средний', hint: 'Длинные предложения и сложная грамматика', texts: B1 },
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
