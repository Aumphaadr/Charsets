// Модель кодировок. Всё разнообразие спрятано за одним интерфейсом,
// рендер о различиях не знает.
//
//   atBytes(bytes) -> { parts: [...] }   режим «по коду»: что означает
//                                        эта последовательность байтов
//   encode(cp)     -> number[] | null    режим «по символу»: какими
//                                        байтами записан этот символ
//
// Часть — это либо готовый символ, либо служебный значок с подсказкой.
// Значки нужны, чтобы «продолжающий байт» не занимал полстроки.

import { CP437_HIGH, CP850_HIGH, CP852_HIGH, CP855_HIGH, CP857_HIGH,
         LATIN1_HIGH, ISO8859_16_HIGH, ASCII_HIGH } from './tables.js';

const UNASSIGNED = '￿';   // маркер «слот не назначен» в наших таблицах

/* ---------- части строки ---------- */

// Мнемоника в рамке: ровно то, чем являются глифы Unicode-блока
// Control Pictures, только рисуем сами — в моноширинных шрифтах
// этого блока нет, были бы квадраты.
const box  = (mn, tip) => ({ mn, tip, tone: 'ctl' });
const sign = (icon, tip, tone) => ({ icon, tip, tone });
const text = ch => ({ char: ch });

export const ICONS = {
  unassigned: tip => sign('·', tip || 'в этой кодировке позиция не занята', 'none'),
  invalid:    tip => sign('⊘', tip, 'bad'),
  ring:       tip => sign('◌', tip, 'part'),
  half:       tip => sign('½', tip, 'part'),
  quarter:    tip => sign('¼', tip, 'part'),
  tail:       tip => sign('…', tip, 'part'),
  lead:       (n, tip) => sign(String(n), tip, 'lead'),
};

/* ---------- имена управляющих символов ---------- */

const C0 = ['NUL','SOH','STX','ETX','EOT','ENQ','ACK','BEL','BS','HT','LF','VT',
            'FF','CR','SO','SI','DLE','DC1','DC2','DC3','DC4','NAK','SYN','ETB',
            'CAN','EM','SUB','ESC','FS','GS','RS','US'];

const C0_RU = {
  NUL: 'пусто', BEL: 'звонок', BS: 'забой', HT: 'горизонтальная табуляция',
  LF: 'перевод строки', VT: 'вертикальная табуляция', FF: 'прогон страницы',
  CR: 'возврат каретки', ESC: 'переключение', SUB: 'замена', DEL: 'удаление',
  SO: 'сдвиг наружу', SI: 'сдвиг внутрь', EM: 'конец носителя',
};

const hex4 = cp => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');

function controlPart(cp) {
  const mn = cp === 0x7f ? 'DEL' : C0[cp];
  const ru = C0_RU[mn];
  return box(mn, `${mn}${ru ? ' — ' + ru : ''} (${hex4(cp)})`);
}

// Символы без собственного рисунка. Их нельзя отдавать шрифту: он
// нарисует пустоту, и занятая позиция будет выглядеть незанятой.
// Ни один шрифт этого не исправит — рисовать тут нечего по определению.
const INVISIBLE = {
  0x200b: ['ZWSP', 'пробел нулевой ширины'],
  0x200c: ['ZWNJ', 'разделитель нулевой ширины: запрещает слияние букв'],
  0x200d: ['ZWJ',  'соединитель нулевой ширины: наоборот, требует слияния'],
  0x200e: ['LRM',  'метка направления письма слева направо'],
  0x200f: ['RLM',  'метка направления письма справа налево'],
  0x2028: ['LS',   'разделитель строк'],
  0x2029: ['PS',   'разделитель абзацев'],
  0xfeff: ['BOM',  'метка порядка байтов'],
};

const isPrivate = cp =>
  (cp >= 0xe000 && cp <= 0xf8ff) || (cp >= 0xf0000 && cp <= 0x10fffd);

// Разбор одного байта однобайтовой кодировки.
function classify(byte, ch) {
  if (byte < 0x20 || byte === 0x7f) return controlPart(byte);
  if (byte === 0x20) return box('SP', `пробел (${hex4(0x20)})`);
  if (ch === undefined || ch === UNASSIGNED || ch === '�') return ICONS.unassigned();
  const cp = ch.codePointAt(0);
  if (cp >= 0x80 && cp <= 0x9f) return box('C1', `управляющий C1 (${hex4(cp)})`);
  if (cp === 0xa0) return box('NB', `неразрывный пробел (${hex4(cp)})`);
  if (cp === 0xad) return box('SH', `мягкий перенос (${hex4(cp)})`);
  const inv = INVISIBLE[cp];
  if (inv) return box(inv[0], `${inv[1]} (${hex4(cp)})`);
  // Область частного использования: символ есть, но что он изображает —
  // договор между конкретной системой и конкретным шрифтом. В MacRoman
  // здесь логотип Apple, и нарисовать его нам нечем и незачем.
  if (isPrivate(cp)) return box('PUA', `область частного использования (${hex4(cp)}): вид зависит от системы`);
  return text(ch);
}

/* ---------- источники таблиц 0..255 ---------- */

// Нативно: один прогон декодера, ноль данных в репозитории.
// Декодируем побайтно — иначе многобайтовые кодировки склеят соседей.
function fromDecoder(label) {
  const dec = new TextDecoder(label);
  return Array.from({ length: 256 }, (_, b) => dec.decode(new Uint8Array([b])));
}

// Своей таблицей: там, где браузеру верить нельзя.
function fromHigh(high) {
  return Array.from({ length: 256 }, (_, b) =>
    b < 0x80 ? String.fromCharCode(b) : high[b - 0x80]);
}

/* ---------- однобайтовая кодировка ---------- */

class Sbcs {
  constructor(id, title, table, note) {
    this.id = id; this.title = title; this.kind = 'sbcs'; this.note = note;
    this.table = table;
    this.reverse = new Map();
    // первым выигрывает младший байт — важно там, где символ встречается дважды
    table.forEach((ch, b) => {
      if (ch !== UNASSIGNED && ch !== '�' && !this.reverse.has(ch)) this.reverse.set(ch, b);
    });
  }
  // Однобайтовая кодировка читает последовательность просто побайтно —
  // именно поэтому UTF-8, прочитанный как Windows-1251, даёт кракозябры.
  atBytes(bytes) {
    return { parts: bytes.map(b => classify(b, this.table[b])) };
  }
  encode(cp) {
    const b = this.reverse.get(String.fromCodePoint(cp));
    return b === undefined ? null : [b];
  }
}

/* ---------- UTF-8 ---------- */

const UTF8_ROLE = b =>
  b <= 0x7f ? null :
  b <= 0xbf ? ICONS.tail('продолжающий байт: сам по себе символа не даёт') :
  b <= 0xc1 ? ICONS.invalid('такого байта в UTF-8 не бывает') :
  b <= 0xdf ? ICONS.lead(2, 'начало двухбайтовой последовательности') :
  b <= 0xef ? ICONS.lead(3, 'начало трёхбайтовой последовательности') :
  b <= 0xf4 ? ICONS.lead(4, 'начало четырёхбайтовой последовательности') :
              ICONS.invalid('такого байта в UTF-8 не бывает');

class Utf8 {
  constructor() { this.id = 'utf-8'; this.title = 'UTF-8'; this.kind = 'unicode';
                  this.family = 'Unicode'; this.enc = new TextEncoder();
                  this.dec = new TextDecoder('utf-8'); }

  atBytes(bytes) {
    if (bytes.length === 1) {
      const role = UTF8_ROLE(bytes[0]);
      return { parts: [role || classify(bytes[0], String.fromCharCode(bytes[0]))] };
    }
    // Декодируем нестрого и ловим U+FFFD: так видно, какая именно часть
    // последовательности негодная, а не «всё целиком неверно».
    const out = this.dec.decode(new Uint8Array(bytes));
    return { parts: [...out].map(ch => ch === '�'
      ? ICONS.invalid('недопустимая последовательность')
      : classify(ch.codePointAt(0) < 0x100 ? ch.codePointAt(0) : 0x21, ch)) };
  }

  encode(cp) {
    if (cp >= 0xd800 && cp <= 0xdfff) return null;      // суррогаты не кодируются
    return Array.from(this.enc.encode(String.fromCodePoint(cp)));
  }
}

/* ---------- UTF-16 ---------- */

class Utf16 {
  constructor(be) { this.be = be; this.id = be ? 'utf-16be' : 'utf-16le';
                    this.title = 'UTF-16' + (be ? ' BE' : ' LE'); this.kind = 'unicode';
                    this.family = 'Unicode'; }

  atBytes(bytes) {
    const parts = [];
    for (let i = 0; i + 1 < bytes.length; i += 2) {
      const u = this.be ? (bytes[i] << 8 | bytes[i + 1]) : (bytes[i + 1] << 8 | bytes[i]);
      if (u >= 0xd800 && u <= 0xdfff) {
        parts.push(ICONS.ring('суррогатная половина: не самостоятельный символ'));
      } else {
        parts.push(classify(u < 0x100 ? u : 0x21, String.fromCharCode(u)));
      }
    }
    // Нечётный остаток — ровно половина кодовой единицы.
    if (bytes.length % 2) parts.push(ICONS.half('половина кодовой единицы UTF-16'));
    return { parts };
  }

  encode(cp) {
    if (cp >= 0xd800 && cp <= 0xdfff) return null;
    const s = String.fromCodePoint(cp), out = [];
    for (let i = 0; i < s.length; i++) {
      const u = s.charCodeAt(i);
      out.push(...(this.be ? [u >> 8, u & 255] : [u & 255, u >> 8]));
    }
    return out;
  }
}

/* ---------- UTF-32 ---------- */

class Utf32 {
  constructor(be) { this.be = be; this.id = be ? 'utf-32be' : 'utf-32le';
                    this.title = 'UTF-32' + (be ? ' BE' : ' LE'); this.kind = 'unicode';
                    this.family = 'Unicode'; }

  atBytes(bytes) {
    const parts = [];
    let i = 0;
    for (; i + 3 < bytes.length; i += 4) {
      const b = this.be ? bytes.slice(i, i + 4) : bytes.slice(i, i + 4).reverse();
      const cp = b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3];
      parts.push(cp > 0x10ffff ? ICONS.invalid('за пределами диапазона Unicode')
                               : classify(cp < 0x100 ? cp : 0x21, String.fromCodePoint(cp)));
    }
    const rest = bytes.length - i;
    for (let k = 0; k < rest; k++) parts.push(ICONS.quarter('четверть кодовой единицы UTF-32'));
    return { parts };
  }

  encode(cp) {
    if (cp >= 0xd800 && cp <= 0xdfff) return null;
    const b = [cp >>> 24 & 255, cp >>> 16 & 255, cp >>> 8 & 255, cp & 255];
    return this.be ? b : b.reverse();
  }
}

/* ---------- Base64 ---------- */

const B64_ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

class Base64 {
  constructor() { this.id = 'base64'; this.title = 'Base64'; this.kind = 'transport';
                  this.family = 'Транспортные'; }
  atBytes(bytes) {
    return { parts: bytes.map(b => {
      const ch = String.fromCharCode(b);
      const v = B64_ALPHA.indexOf(ch);
      if (v >= 0) return { char: ch, tip: `в алфавите Base64 это значение ${v}` };
      if (ch === '=') return box('=', 'символ дополнения до длины, кратной четырём');
      return ICONS.unassigned('такого символа в алфавите Base64 нет');
    }) };
  }
  // Base64 кодирует байты, а не символы: в режиме «по символу» он неприменим.
  encode() { return null; }
}

/* ---------- байты в текст ---------- */
// Отличается от decodeBytes(): тот отдаёт части со значками для показа,
// а здесь нужна настоящая строка — её кладут в поле исходного текста,
// когда разворачивают конвейер. Всё, что не декодировалось, становится
// U+FFFD: это честный признак потери, и при обратном кодировании он
// сразу всплывёт как непредставимый символ.

const BAD = '\ufffd';

Sbcs.prototype.decodeText = function (bytes) {
  return bytes.map(b => {
    const ch = this.table[b];
    return (ch === undefined || ch === UNASSIGNED || ch === BAD) ? BAD : ch;
  }).join('');
};

Utf8.prototype.decodeText = function (bytes) {
  return this.dec.decode(new Uint8Array(bytes));
};

Utf16.prototype.decodeText = function (bytes) {
  const units = [];
  for (let i = 0; i + 1 < bytes.length; i += 2)
    units.push(this.be ? (bytes[i] << 8 | bytes[i + 1]) : (bytes[i + 1] << 8 | bytes[i]));

  let out = '';
  for (let i = 0; i < units.length; i++) {
    const u = units[i], next = units[i + 1];
    // Пара суррогатов — один символ; одинокий суррогат строкой быть не может.
    if (u >= 0xd800 && u <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
      out += String.fromCharCode(u, next); i++;
    } else if (u >= 0xd800 && u <= 0xdfff) {
      out += BAD;
    } else {
      out += String.fromCharCode(u);
    }
  }
  return out + (bytes.length % 2 ? BAD : '');   // нечётный хвост — половина единицы
};

Utf32.prototype.decodeText = function (bytes) {
  let out = '', i = 0;
  for (; i + 3 < bytes.length; i += 4) {
    const b = this.be ? bytes.slice(i, i + 4) : bytes.slice(i, i + 4).reverse();
    const cp = b[0] << 24 | b[1] << 16 | b[2] << 8 | b[3];
    out += (cp < 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))
      ? BAD : String.fromCodePoint(cp);
  }
  return out + BAD.repeat(bytes.length - i ? 1 : 0);
};

Base64.prototype.decodeText = function () { return ''; };

/* ---------- текст в байты ---------- */
// Общая реализация поверх encode(): разбираем текст по кодовым точкам,
// непредставимые собираем отдельно. Потеря символов при кодировании —
// не сбой, а главный сюжет: именно из-за неё «одной кодировки» не вышло.

function encodeText(s) {
  const bytes = [], lost = [];
  for (const ch of s) {
    const b = this.encode(ch.codePointAt(0));
    if (b === null) lost.push(ch); else bytes.push(...b);
  }
  return { bytes, lost };
}

for (const C of [Sbcs, Utf8, Utf16, Utf32, Base64]) C.prototype.encodeText = encodeText;

// Чтение байтов обратно в текст — это ровно то же, что строка таблицы
// в режиме «по коду»: та же логика, тот же набор значков.
for (const C of [Sbcs, Utf8, Utf16, Utf32, Base64])
  C.prototype.decodeBytes = function (bytes) { return this.atBytes(bytes).parts; };

/* ---------- реестр ---------- */

const native = (id, title, family, label) =>
  Object.assign(new Sbcs(id, title, fromDecoder(label || id)), { family });

const own = (id, title, family, high, note) =>
  Object.assign(new Sbcs(id, title, fromHigh(high), note), { family });

export const CHARSETS = [
  own('cp437', 'CP437', 'DOS', CP437_HIGH,
      'Исходная страница IBM PC. TextDecoder её не знает — таблица из iconv.'),
  own('cp850', 'CP850', 'DOS', CP850_HIGH,
      'TextDecoder не поддерживает CP850 вовсе — таблица из iconv.'),
  own('cp852', 'CP852', 'DOS', CP852_HIGH, 'Своя таблица: TextDecoder не знает CP852.'),
  own('cp855', 'CP855', 'DOS', CP855_HIGH, 'Своя таблица: TextDecoder не знает CP855.'),
  own('cp857', 'CP857', 'DOS', CP857_HIGH,
      'Своя таблица. Три позиции (D5, E7, F2) в самой кодировке не заняты.'),
  native('cp866', 'CP866', 'DOS', 'ibm866'),

  native('windows-1250', 'Windows-1250', 'Windows'),
  native('windows-1251', 'Windows-1251', 'Windows'),
  native('windows-1252', 'Windows-1252', 'Windows'),
  native('windows-1253', 'Windows-1253', 'Windows'),
  native('windows-1254', 'Windows-1254', 'Windows'),
  native('windows-1255', 'Windows-1255', 'Windows'),
  native('windows-1256', 'Windows-1256', 'Windows'),
  native('windows-1257', 'Windows-1257', 'Windows'),
  native('windows-1258', 'Windows-1258', 'Windows'),

  own('ascii', 'ASCII', 'ISO 8859 и ASCII', ASCII_HIGH,
      'TextDecoder("ascii") на деле отдаёт windows-1252 — здесь своя таблица.'),
  own('iso-8859-1', 'ISO-8859-1', 'ISO 8859 и ASCII', LATIN1_HIGH,
      'TextDecoder подменяет ISO-8859-1 на windows-1252 — здесь своя таблица.'),
  native('iso-8859-2', 'ISO-8859-2', 'ISO 8859 и ASCII'),
  native('iso-8859-3', 'ISO-8859-3', 'ISO 8859 и ASCII'),
  native('iso-8859-4', 'ISO-8859-4', 'ISO 8859 и ASCII'),
  native('iso-8859-5', 'ISO-8859-5', 'ISO 8859 и ASCII'),
  native('iso-8859-6', 'ISO-8859-6', 'ISO 8859 и ASCII'),
  native('iso-8859-7', 'ISO-8859-7', 'ISO 8859 и ASCII'),
  native('iso-8859-8', 'ISO-8859-8', 'ISO 8859 и ASCII'),
  native('iso-8859-10', 'ISO-8859-10', 'ISO 8859 и ASCII'),
  native('iso-8859-13', 'ISO-8859-13', 'ISO 8859 и ASCII'),
  native('iso-8859-14', 'ISO-8859-14', 'ISO 8859 и ASCII'),
  native('iso-8859-15', 'ISO-8859-15', 'ISO 8859 и ASCII'),
  own('iso-8859-16', 'ISO-8859-16', 'ISO 8859 и ASCII', ISO8859_16_HIGH,
      'Своя таблица: TextDecoder не знает ISO-8859-16.'),

  native('koi8-r', 'KOI8-R', 'КОИ-8 и Macintosh'),
  native('koi8-u', 'KOI8-U', 'КОИ-8 и Macintosh'),
  native('macintosh', 'Mac Roman', 'КОИ-8 и Macintosh'),
  native('x-mac-cyrillic', 'Mac Cyrillic', 'КОИ-8 и Macintosh'),

  new Utf8(),
  new Utf16(false),
  new Utf16(true),
  new Utf32(false),
  new Utf32(true),

  new Base64(),
];

export const GROUPS = [
  { title: 'Кодовые страницы', kind: 'sbcs' },
  { title: 'Формы Unicode',    kind: 'unicode' },
  { title: 'Транспортные',     kind: 'transport' },
];

export const byId = id => CHARSETS.find(c => c.id === id);
