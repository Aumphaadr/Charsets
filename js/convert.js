// Перекодировщик: текст → байты → текст.
//
//   Текст  ──[записать как X]──▶  байты  ──[прочитать как Y]──▶  текст
//
// Если X и Y разные, на выходе получаются кракозябры — и видно, из чего
// именно они складываются. Панель байтов редактируемая: можно вбить числа
// руками и посмотреть, во что они превратятся.

import { CHARSETS, GROUPS, byId } from './charsets.js';
import { partsHtml, esc } from './parts.js';
import { initTips } from './ui.js';
import { initNav } from './nav.js';
import { initPipeResize } from './resize.js';

const el = id => document.getElementById(id);
const src = el('src'), bytesBox = el('bytes'), out = el('out');
const encSel = el('enc'), decSel = el('dec');

// Base64 кодирует байты, а не текст: в качестве кодировки записи или
// чтения он бессмыслен, поэтому в списки не попадает. Зато сами байты
// показываем в нём отдельной строкой — это его настоящая работа.
const usable = CHARSETS.filter(c => c.kind !== 'transport');

let radix = 'hex';
let manual = false;      // байты правили руками — не перезатирать их из текста

/* ---------- списки кодировок ---------- */

function fillSelect(sel, current) {
  sel.innerHTML = GROUPS.map(g => {
    const inGroup = usable.filter(c => c.kind === g.kind);
    if (!inGroup.length) return '';
    return `<optgroup label="${g.title}">` + inGroup.map(c =>
      `<option value="${c.id}"${c.id === current ? ' selected' : ''}>${esc(c.title)}</option>`
    ).join('') + '</optgroup>';
  }).join('');
}

/* ---------- форматирование и разбор байтов ---------- */

const FMT = {
  dec: b => String(b),
  hex: b => b.toString(16).toUpperCase().padStart(2, '0'),
  bin: b => b.toString(2).padStart(8, '0'),
};
const BASE = { dec: 10, hex: 16, bin: 2 };
// Проверка своя на каждую систему: parseInt('1F', 10) молча вернул бы 1,
// и опечатка в режиме DEC превратилась бы в тихо неверный байт.
const VALID = { dec: /^[0-9]+$/, hex: /^[0-9A-Fa-f]+$/, bin: /^[01]+$/ };

const formatBytes = bs => bs.map(FMT[radix]).join(' ');

// Разбираем терпимо: разделителем считается что угодно, кроме букв и цифр.
// Так переживает и «D0 90», и «D0,90», и «0xD0 0x90». Но именно терпимо,
// а не молча: всё, что не разобралось, попадает в список и показывается.
function parseBytes(text) {
  const bad = [], bytes = [];
  for (const tok of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!tok) continue;
    const t = tok.replace(/^0[xX]/, '');
    const v = parseInt(t, BASE[radix]);
    if (!VALID[radix].test(t) || Number.isNaN(v) || v > 255) { bad.push(tok); continue; }
    bytes.push(v);
  }
  return { bytes, bad };
}

const toBase64 = bs => bs.length
  ? btoa(String.fromCharCode(...bs))       // btoa работает с latin1, а у нас
  : '';                                    // ровно байты 0..255 — то, что нужно

/* ---------- запись в поле исходного текста ---------- */

// Присваивание value стирает нативную историю отмены: нажал «Очистить»
// не глядя — и Ctrl+Z уже ничего не вернёт. Правка через execCommand
// ложится в ту же историю, что и набор с клавиатуры, поэтому отменяется
// штатно. Метод объявлен устаревшим, замены ему нет, поэтому есть запасной
// путь на случай, если он однажды перестанет работать.
function setSrc(text) {
  src.focus();
  src.select();
  const ok = text
    ? document.execCommand('insertText', false, text)
    : document.execCommand('delete');
  if (!ok) src.value = text;
  syncClear();
}

function syncClear() { el('clear').disabled = src.value === ''; }

/* ---------- шаги конвейера ---------- */

function encodeStep() {
  const cs = byId(encSel.value);
  const { bytes, lost } = cs.encodeText(src.value);

  const chars = [...src.value].length;
  // На пустом поле «0 символов, все представимы» формально верно, но читается
  // глупо: утверждать что-то обо всех символах, когда их нет, незачем.
  el('src-meta').innerHTML = !chars
    ? 'Поле пустое — впишите текст или вставьте байты ниже.'
    : lost.length
    ? `${chars} символов. <span class="warn">Не представимы в ${esc(cs.title)}: `
      + `${esc([...new Set(lost)].join(' '))} — ${lost.length} шт., они просто пропали.</span>`
    : `${chars} символов, все представимы в ${esc(cs.title)}.`;

  bytesBox.value = formatBytes(bytes);
  manual = false;
  return bytes;
}

// В таблице обозреватель помечает пробел рамкой SP — там это правильно,
// каждая строка про один байт. Здесь результат читают как текст, и рамка
// на каждом пробеле мешает; возвращаем ему обычный вид.
const readable = parts => parts.map(p => p.mn === 'SP' ? { char: ' ' } : p);

function decodeStep(bytes, bad) {
  const cs = byId(decSel.value);
  out.innerHTML = bytes.length ? partsHtml(readable(cs.decodeBytes(bytes))) : '';

  el('bytes-meta').innerHTML = `${bytes.length} байт`
    + (manual ? ' <span class="hint">— правлены вручную</span>' : '')
    + (bad?.length ? ` <span class="warn">— не разобрано: ${esc(bad.join(' '))}</span>` : '');
  el('b64').textContent = toBase64(bytes) || '—';

  // Подпись — только о том, что видно. Судить по нажатой кнопке нельзя:
  // «Прогнать обратно» с уже целого текста снова его портит, и рапорт об
  // успехе оказался бы ложью поверх кракозябр. Направление процесса
  // страница не знает и знать не может — ломают текст и лечат его одним
  // и тем же действием.
  const from = byId(encSel.value), text = cs.decodeText(bytes);
  el('out-meta').textContent =
      encSel.value === decSel.value
        ? 'Кодировки записи и чтения совпадают — текст возвращается без потерь.'
    : text === src.value && !manual
        ? 'Кодировки разные, но на этом тексте они не расходятся: он целиком в их общей части.'
        : `Записано как ${from.title}, прочитано как ${cs.title} — правила разные, `
          + 'поэтому текст на выходе другой. Так кракозябры и появляются; '
          + 'кнопка «Прогнать обратно» разворачивает то же самое действие.';
}

function runAll() { decodeStep(encodeStep()); }

function runFromBytes() {
  const { bytes, bad } = parseBytes(bytesBox.value);
  decodeStep(bytes, bad);
  el('b64').textContent = toBase64(bytes) || '—';
}

/* ---------- события ---------- */

src.addEventListener('input', () => { syncClear(); runAll(); });

// Очистка снимает и ручную правку байтов: поле снова ведёт конвейер.
el('clear').addEventListener('click', () => { setSrc(''); runAll(); });
encSel.addEventListener('change', runAll);
decSel.addEventListener('change', () => manual ? runFromBytes() : runAll());

bytesBox.addEventListener('input', () => { manual = true; runFromBytes(); });

document.querySelector('.radix').addEventListener('click', e => {
  const r = e.target.dataset.radix;
  if (!r || r === radix) return;
  // Уже введённые байты не теряем — просто переписываем в другой системе.
  const { bytes } = parseBytes(bytesBox.value);
  radix = r;
  document.querySelectorAll('.radix button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.radix === r)));
  bytesBox.value = formatBytes(bytes);
});

// Разворот без данных: те же байты, прочитанные наоборот. Честно бесполезен
// в большинстве случаев — о чём и предупреждает подсказка на кнопке.
el('flip').addEventListener('click', () => {
  [encSel.value, decSel.value] = [decSel.value, encSel.value];
  manual ? runFromBytes() : runAll();
});

// Разворот вместе с данными — точная обратная операция: то, что вышло
// испорченным, кладём на вход и читаем прежней кодировкой записи.
// Это и есть «мне прислали кракозябры, верните текст».
el('undo').addEventListener('click', () => {
  const { bytes } = manual ? parseBytes(bytesBox.value) : { bytes: byId(encSel.value).encodeText(src.value).bytes };
  setSrc(byId(decSel.value).decodeText(bytes));
  [encSel.value, decSel.value] = [decSel.value, encSel.value];
  runAll();
});

document.querySelector('.presets').addEventListener('click', e => {
  const p = e.target.dataset.preset;
  if (!p) return;
  const [a, b] = p.split('|');
  encSel.value = a; decSel.value = b;
  runAll();
});

/* ---------- старт ---------- */

initNav('convert.html');
fillSelect(encSel, 'utf-8');
fillSelect(decSel, 'windows-1251');
document.querySelectorAll('.radix button').forEach(b =>
  b.setAttribute('aria-pressed', String(b.dataset.radix === radix)));
syncClear();
initTips(document.querySelector('.viewport'));
initPipeResize(document.querySelector('.pipe'));
runAll();
