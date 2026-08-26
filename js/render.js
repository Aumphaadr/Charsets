// Рендер ленты. Строки собираются в строку HTML и вставляются одним куском:
// на десятках тысяч строк это заметно быстрее поэлементного DOM API.
//
// Таблицы идут порциями по 32 строки, как отдельные <table>. Чтобы восемь
// соседних таблиц выровнялись между собой, у каждой свой <colgroup> с теми же
// классами ширин, а table-layout: fixed запрещает браузеру мерить содержимое.

import { ICONS } from './charsets.js';
import { esc, partHtml, partsHtml } from './parts.js';

const BANK = 256;   // размер порции догрузки
const CHUNK = 32;   // строк в одной таблице

// Два взгляда на одно и то же. «Раздельно» показывает, что байтов два:
// 1 0. «Слитно» показывает значение последовательности: 256. Обе записи
// верны, и обе кому-то нужны — отсюда переключатель, а не выбор за
// пользователя.
const bin = (bs, j) => bs.map(b => b.toString(2).padStart(8, '0')).join(j ? '' : ' ');
const hex = (bs, j) => bs.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(j ? '' : ' ');
const dec = (bs, j) => j ? String(bs.reduce((a, b) => a * 256 + b, 0)) : bs.join(' ');

// Ось режима «по коду» — значение последовательности байтов. До 255 это
// один байт, дальше два: строка 53 392 — это байты D0 90.
export const bytesOf = n => n <= 0xff ? [n] : [n >> 8 & 255, n & 255];

const cellHtml = cell => `<td class="c-char">${partsHtml(cell.parts)}</td>`;
const sig = cell => cell.parts.map(p => p.char ?? p.mn ?? p.icon).join('');

/* ---------- Режим «по коду»: ось — байты, у кодировок символы ---------- */

function colsByCode(sets) {
  return '<colgroup>'
    + '<col class="w-dec"><col class="w-hex"><col class="w-bin">'
    + sets.map(() => '<col class="w-char">').join('')
    + '</colgroup>';
}

function rowByCode(code, sets, join) {
  const bytes = bytesOf(code);
  const cells = sets.map(cs => cs.atBytes(bytes));
  // Признак пишем всегда, независимо от галочки: он зависит от набора
  // кодировок, а не от того, включено ли приглушение. Тогда сама галочка
  // становится чистым CSS и не стоит перерисовки.
  const first = sig(cells[0]);
  const same = cells.length > 1 && cells.every(c => sig(c) === first);
  return `<tr${same ? ' data-same="1"' : ''} class="${code % 32 === 15 ? 'split' : ''}">`
    + `<td class="c-dec">${dec(bytes, join)}</td>`
    + `<td class="c-hex">${hex(bytes, join)}</td>`
    + `<td class="c-bin">${bin(bytes, join)}</td>`
    + cells.map(cellHtml).join('')
    + '</tr>';
}

/* ---------- Режим «по символу»: ось — символ, у кодировок числа ---------- */

function colsByChar(sets) {
  return '<colgroup>'
    + '<col class="w-point"><col class="w-char">'
    + sets.map(() => '<col class="w-dec"><col class="w-hex"><col class="w-bin">').join('')
    + '</colgroup>';
}

// Пробел и его родня рисуются пустотой, поэтому на оси помечаются рамкой:
// иначе занятая строка выглядит пустой. Раньше 0x20 не попадал в условие
// вовсе, и ветка с мнемоникой SP была недостижимой.
const INVISIBLE_AXIS = { 0x20: 'SP', 0xa0: 'NB', 0xad: 'SH', 0x200b: 'ZWSP',
  0x200c: 'ZWNJ', 0x200d: 'ZWJ', 0x200e: 'LRM', 0x200f: 'RLM', 0xfeff: 'BOM' };

function axisChar(cp) {
  const u = `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  if (cp >= 0xd800 && cp <= 0xdfff)
    return partHtml(ICONS.ring('суррогатная половина: не самостоятельный символ'));
  if (cp < 0x20 || cp === 0x7f || (cp >= 0x80 && cp <= 0x9f))
    return partHtml({ mn: 'упр', tone: 'ctl', tip: `управляющий символ (${u})` });
  const inv = INVISIBLE_AXIS[cp];
  if (inv) return partHtml({ mn: inv, tone: 'ctl', tip: `невидимый символ (${u})` });
  return esc(String.fromCodePoint(cp));
}

function rowByChar(cp, sets, join) {
  const encoded = sets.map(cs => cs.encode(cp));
  // Неинтересная строка — та, где сравнивать нечего: либо символ непредставим
  // везде, либо все кодировки записали его одними и теми же байтами
  // (так выглядит весь диапазон ASCII почти в любом наборе).
  const dead = sets.length > 1 && (
    encoded.every(b => b === null) ||
    encoded.every(b => b !== null && String(b) === String(encoded[0])));

  // Три отдельные ячейки вместо colspan: при выключенной колонке colspan
  // разъезжается, а так каждая ячейка живёт по своему правилу видимости.
  const no = partHtml(ICONS.invalid('символ непредставим в этой кодировке'));
  const none = `<td class="c-dec">${no}</td><td class="c-hex">${no}</td><td class="c-bin">${no}</td>`;

  return `<tr${dead ? ' data-same="1"' : ''} class="${cp % 32 === 15 ? 'split' : ''}">`
    + `<td class="c-point">U+${cp.toString(16).toUpperCase().padStart(4, '0')}</td>`
    + `<td class="c-char">${axisChar(cp)}</td>`
    + encoded.map(b => b === null ? none
        : `<td class="c-dec">${dec(b, join)}</td><td class="c-hex">${hex(b, join)}</td>`
          + `<td class="c-bin">${bin(b, join)}</td>`
      ).join('')
    + '</tr>';
}

/* ---------- сборка ---------- */

export function bankHtml(start, sets, mode, join) {
  const row = mode === 'code' ? rowByCode : rowByChar;
  const cols = mode === 'code' ? colsByCode(sets) : colsByChar(sets);
  let out = '';
  for (let t = 0; t < BANK / CHUNK; t++) {
    let rows = '';
    for (let r = 0; r < CHUNK; r++) rows += row(start + t * CHUNK + r, sets, join);
    // content-visibility на обёртке: браузер пропускает раскладку блоков
    // за пределами экрана, и накопленный DOM перестаёт что-либо стоить
    out += `<div class="blk"><table>${cols}<tbody>${rows}</tbody></table></div>`;
  }
  return out;
}

// Заголовок строится отдельно: он липкий и живёт вне ленты.
export function headHtml(sets, mode) {
  const grp = sets.map(cs => `<th class="grp"${mode === 'char' ? ' colspan="3"' : ''}`
    + ` draggable="true" data-id="${cs.id}" title="${esc(cs.title)}">${esc(cs.title)}</th>`).join('');
  const sub = mode === 'code'
    ? sets.map(() => '<th class="c-char">CHAR</th>').join('')
    : sets.map(() => '<th class="c-dec">DEC</th><th class="c-hex">HEX</th><th class="c-bin">BIN</th>').join('');
  const axisGrp = mode === 'code'
    ? '<th class="axis" colspan="3">Код</th>'
    : '<th class="axis" colspan="2">Символ</th>';
  const axisSub = mode === 'code'
    ? '<th class="c-dec">DEC</th><th class="c-hex">HEX</th><th class="c-bin">BIN</th>'
    : '<th class="c-point">U+</th><th class="c-char">CHAR</th>';
  const cols = mode === 'code' ? colsByCode(sets) : colsByChar(sets);
  return `<table class="head">${cols}<thead>`
    + `<tr class="lvl1">${axisGrp}${grp}</tr>`
    + `<tr class="lvl2">${axisSub}${sub}</tr>`
    + '</thead></table>';
}

export const BANK_SIZE = BANK;
