// Хранение прогресса в браузере (localStorage), профили, опыт, серии дней.
const KEY = 'lumen:v1';
const APP_VERSION = 1;

export const DEFAULT_SETTINGS = { dailyCount: 15, speakOnTap: true, rate: 0.9, dailyGoal: 50 };

let state = load();

function blank() {
  return { version: APP_VERSION, active: null, profiles: {}, device: { theme: 'auto', installHintClosed: false } };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    return migrate(s);
  } catch (e) {
    console.warn('Не удалось прочитать прогресс', e);
    return blank();
  }
}

function migrate(s) {
  const b = blank();
  const out = { ...b, ...s, device: { ...b.device, ...(s.device || {}) } };
  for (const p of Object.values(out.profiles || {})) normalizeProfile(p);
  return out;
}

function normalizeProfile(p) {
  p.settings = { ...DEFAULT_SETTINGS, ...(p.settings || {}) };
  p.xp ??= 0;
  p.days ??= {};
  p.texts ??= {};
  p.words ??= {};
  p.daily ??= null;
  p.dayOffset ??= 0;
  p.tester ??= false;
  p.coach ??= {};
  return p;
}

let saveTimer = null;
export function save(now = false) {
  clearTimeout(saveTimer);
  const doSave = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { console.warn('Не удалось сохранить', e); }
  };
  if (now) doSave(); else saveTimer = setTimeout(doSave, 150);
}
window.addEventListener('pagehide', () => save(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

export const getState = () => state;
export const profile = () => (state.active ? state.profiles[state.active] : null);
export const profiles = () => Object.values(state.profiles);

export function createProfile({ name, level, tester = false }) {
  const id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  state.profiles[id] = normalizeProfile({ id, name, level, tester, created: new Date().toISOString() });
  state.active = id;
  save(true);
  return state.profiles[id];
}
export function switchProfile(id) { if (state.profiles[id]) { state.active = id; save(true); } }
export function deleteProfile(id) {
  delete state.profiles[id];
  if (state.active === id) state.active = Object.keys(state.profiles)[0] || null;
  save(true);
}
export function resetProfile(p) {
  const keep = { id: p.id, name: p.name, level: p.level, tester: p.tester, created: p.created, settings: p.settings };
  for (const k of Object.keys(p)) delete p[k];
  Object.assign(p, normalizeProfile(keep));
  save(true);
}

// ---------- Даты ----------
const pad = (n) => String(n).padStart(2, '0');
export function dateKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function today(p = profile()) {
  const d = new Date();
  d.setDate(d.getDate() + (p?.dayOffset || 0));
  return dateKey(d);
}
export function dayNum(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function keyFromNum(n) {
  const d = new Date(n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ---------- Опыт и уровни ----------
const LEVEL_NAMES = ['Новичок', 'Ученик', 'Читатель', 'Знаток слов', 'Книголюб', 'Рассказчик', 'Полиглот', 'Мастер', 'Профессор', 'Легенда'];
export const xpForNext = (lvl) => 100 + (lvl - 1) * 50;
export function levelInfo(xp) {
  let lvl = 1, rest = xp;
  while (rest >= xpForNext(lvl)) { rest -= xpForNext(lvl); lvl++; }
  const name = LEVEL_NAMES[Math.min(lvl - 1, LEVEL_NAMES.length - 1)] + (lvl > LEVEL_NAMES.length ? ' ' + (lvl - LEVEL_NAMES.length + 1) : '');
  return { level: lvl, name, into: rest, need: xpForNext(lvl) };
}

export function dayStats(p, key = today(p)) {
  return p.days[key] || { xp: 0, sentences: 0, reviews: 0, texts: 0 };
}
export function addXp(p, amount, field) {
  const key = today(p);
  const d = (p.days[key] ||= { xp: 0, sentences: 0, reviews: 0, texts: 0 });
  d.xp += amount;
  if (field) d[field] = (d[field] || 0) + 1;
  const before = levelInfo(p.xp).level;
  p.xp += amount;
  save();
  return levelInfo(p.xp).level > before; // true — новый уровень
}

export function streak(p) {
  let n = dayNum(today(p));
  const active = (k) => (p.days[k]?.xp || 0) > 0;
  if (!active(keyFromNum(n))) n--; // сегодня ещё не занимались — серия не прервана
  let count = 0;
  while (active(keyFromNum(n))) { count++; n--; }
  return count;
}
export function bestStreak(p) {
  const nums = Object.keys(p.days).filter((k) => p.days[k].xp > 0).map(dayNum).sort((a, b) => a - b);
  let best = 0, cur = 0, prev = null;
  for (const n of nums) { cur = prev !== null && n === prev + 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = n; }
  return best;
}

// ---------- Экспорт и импорт ----------
export function exportData() {
  return JSON.stringify({ app: 'lumen', exported: new Date().toISOString(), data: state }, null, 1);
}
export function importData(text) {
  const parsed = JSON.parse(text);
  const data = parsed.data || parsed;
  if (!data || typeof data !== 'object' || !data.profiles) throw new Error('В файле нет данных приложения');
  state = migrate(data);
  save(true);
}

// ---------- Тема ----------
export function applyTheme() {
  const pref = state.device.theme;
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#13101d' : '#efeaf5');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
