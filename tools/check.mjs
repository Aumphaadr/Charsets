// Самопроверка: node tools/check.mjs (или npm run check).
//
// Сначала — годится ли движок: таблицы большинства кодировок строит его
// TextDecoder, и у Node до 24.13.1 они расходятся с браузерными.
// Затем три раздела:
//   модель   — кодировки сходятся туда и обратно, утверждения сайта о конкретных
//              байтах верны;
//   шрифты   — каждый знак, который рисуют кодовые страницы, есть в том файле,
//              которому его отдаёт unicode-range в css/style.css;
//   значки   — каждый значок, на который ссылается CSS, лежит в icons/, лишних
//              нет, и раздел «Значки» в THIRD-PARTY-NOTICES.md называет их число.
//
// Зависимостей нет: WOFF2 разбирается здесь же, Brotli есть в самом Node.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { CHARSETS, byId } from '../js/charsets.js';
import { ROOT, neededCodePoints, cssFaces, faceFor } from './font-set.mjs';

let checks = 0, failed = 0;
function ok(cond, what) {
  checks++;
  if (!cond) { failed++; console.error('ПРОВАЛ: ' + what); process.exitCode = 1; }
}
function section(name) {
  const before = { checks, failed };
  return () => console.log(`${name}: ${failed > before.failed ? 'есть провалы' : 'порядок'},`
    + ` ${checks - before.checks} проверок`);
}
const hex = cp => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
const read = rel => fs.readFileSync(path.join(ROOT, rel));

// ---------- движок ----------

// Таблицы большинства кодировок строит TextDecoder движка, и проверять модель
// имеет смысл только там, где он совпадает с браузером. Два известных места
// расхождения: Node до 22.22.1 и 24.13.1 читал windows-1252 как Latin-1
// (байт 80 — U+0080 вместо €), а Node 22 даже последних версий не знает, что
// в windows-1255 байт CA — огласовка U+05BA. Node 24.13.1 и новее совпадает
// с Chrome в обоих (24.13.0 ошибается в обоих) — сверено на версиях подряд.
const engine = [
  ['windows-1252', 0x80, '€', 'читает windows-1252 как Latin-1'],
  ['windows-1255', 0xca, 'ֺ', 'не знает огласовку U+05BA в windows-1255'],
].filter(([label, b, want]) => new TextDecoder(label).decode(Uint8Array.of(b)) !== want);
if (engine.length) {
  for (const [, , , why] of engine) console.error(`ПРОВАЛ: Node ${process.version} ${why}.`);
  console.error('Таблицы этого движка расходятся с браузерными, и проверять по ним сайт бессмысленно. '
    + 'Нужен Node 24.13.1 или новее — такой стоит и в CI.');
  process.exit(1);
}

// ---------- модель ----------

let done = section('модель');

// Однобайтовые: каждый занятый байт записывается обратно байтом с тем же символом.
// Байт может оказаться другим, если символ в кодировке встречается дважды.
for (const cs of CHARSETS.filter(c => c.kind === 'sbcs')) {
  for (let b = 0; b < 256; b++) {
    const text = cs.decodeText([b]);
    if (text === '�') continue;                       // позиция не занята
    const back = cs.encode(text.codePointAt(0));
    ok(back && back.length === 1 && cs.decodeText(back) === text,
      `${cs.title}: байт ${b} ↔ ${hex(text.codePointAt(0))}`);
  }
}

// Формы Unicode: кодовая точка туда и обратно — по всей плоскости с шагом
// и на границах длин UTF-8 и суррогатов.
const probes = [0, 0x7f, 0x80, 0x7ff, 0x800, 0xd7ff, 0xe000, 0xfffd, 0xffff,
  0x10000, 0x1f600, 0x10ffff];
for (let cp = 0; cp < 0x10000; cp += 97) probes.push(cp);
for (const id of ['utf-8', 'utf-16le', 'utf-16be', 'utf-32le', 'utf-32be']) {
  const cs = byId(id);
  for (const cp of probes) {
    if (cp >= 0xd800 && cp <= 0xdfff) {
      ok(cs.encode(cp) === null, `${cs.title}: суррогат ${hex(cp)} не кодируется`);
      continue;
    }
    ok(cs.decodeText(cs.encode(cp)) === String.fromCodePoint(cp), `${cs.title}: ${hex(cp)} туда и обратно`);
  }
}

// Якоря: значения, которые сайт утверждает в подписях и примерах. Круговая
// проверка выше их не заменяет — таблица, испорченная согласованно, сходится
// туда и обратно так же хорошо, как верная.
const at = (id, b) => byId(id).decodeText([b]);
const anchors = [
  ['windows-1251', 0xc0, 'А'], ['windows-1252', 0xc0, 'À'], ['cp866', 0xc0, '└'], ['koi8-r', 0xc0, 'ю'],
  ['cp437', 0x80, 'Ç'], ['cp437', 0xb0, '░'], ['cp437', 0xdb, '█'], ['cp850', 0xd5, 'ı'],
  ['iso-8859-1', 0x80, '\u0080'],          // настоящий Latin-1: управляющий C1, а не € из 1252
  ['windows-1252', 0x80, '€'], ['iso-8859-16', 0xa4, '€'], ['ascii', 0x80, '�'],
  ['cp857', 0xd5, '�'], ['cp857', 0xe7, '�'], ['cp857', 0xf2, '�'],   // дыры CP857
  ['macintosh', 0xf0, ''],           // логотип Apple в области частного использования
];
for (const [id, b, want] of anchors) {
  ok(at(id, b) === want, `${byId(id).title}: байт ${b.toString(16).toUpperCase()} — ${hex(want.codePointAt(0))}, а не ${hex(at(id, b).codePointAt(0))}`);
}
ok(byId('utf-8').decodeText([0xd0, 0x90]) === 'А', 'UTF-8: D0 90 — «А»');
ok(byId('utf-32be').encode(0x410).reduce((a, b) => a * 256 + b, 0) === 1040,
  'UTF-32 BE: «А» слитно даёт 1040 — номер кодовой точки');

// Главный пример сайта — на главной и в перекодировщике.
const bytes = byId('utf-8').encodeText('Привет, мир!').bytes;
const spoiled = byId('windows-1251').decodeText(bytes);
ok(spoiled === 'РџСЂРёРІРµС‚, РјРёСЂ!', `UTF-8 → Windows-1251 даёт «${spoiled}»`);
const back = byId('windows-1251').encodeText(spoiled).bytes;
ok(String(back) === String(bytes) && byId('utf-8').decodeText(back) === 'Привет, мир!',
  '«Прогнать обратно» возвращает исходные байты и текст');
ok(byId('windows-1252').decodeText(byId('windows-1251').encodeText('Привет').bytes) === 'Ïðèâåò',
  'Windows-1251 → Windows-1252 даёт «Ïðèâåò»');

done();

// ---------- шрифты ----------

done = section('шрифты');

// Таблица известных тегов WOFF2 (спецификация W3C, раздел 5.2).
const KNOWN = ('cmap head hhea hmtx maxp name OS/2 post cvt_ fpgm glyf loca prep CFF_ VORG EBDT '
  + 'EBLC gasp hdmx kern LTSH PCLT VDMX vhea vmtx BASE GDEF GPOS GSUB EBSC JSTF MATH CBDT CBLC '
  + 'COLR CPAL SVG_ sbix acnt avar bdat bloc bsln cvar fdsc feat fmtx fvar gvar hsty just lcar '
  + 'mort morx opbd prop trak Zapf Silf Glat Gloc Feat Sill').split(' ').map(t => t.replace('_', ' '));

// Кодовые точки, у которых в шрифте есть глиф (не нулевой).
function woff2Coverage(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('не WOFF2');
  const numTables = buf.readUInt16BE(12);
  const compressed = buf.readUInt32BE(20);
  let at = 48;
  const base128 = () => {
    let v = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buf[at++];
      v = v * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return v;
    }
    throw new Error('битое число UIntBase128');
  };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[at++];
    let tag = KNOWN[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = buf.toString('latin1', at, at + 4); at += 4; }
    const version = flags >> 6;
    const length = base128();
    // У glyf и loca преобразование — это версия 0, у остальных — любая, кроме 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    tables.push({ tag, length: transformed ? base128() : length });
  }
  // Таблицы лежат в распакованном потоке подряд, в порядке каталога.
  const data = zlib.brotliDecompressSync(buf.subarray(at, at + compressed));
  let offset = 0;
  for (const t of tables) { t.offset = offset; offset += t.length; }
  const cmap = tables.find(t => t.tag === 'cmap');
  return parseCmap(data.subarray(cmap.offset, cmap.offset + cmap.length));
}

function parseCmap(d) {
  const have = new Set();
  const count = d.readUInt16BE(2);
  for (let i = 0; i < count; i++) {
    const platform = d.readUInt16BE(4 + i * 8), encoding = d.readUInt16BE(6 + i * 8);
    const sub = d.readUInt32BE(8 + i * 8), format = d.readUInt16BE(sub);
    const unicode = platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (!unicode) continue;
    if (format === 4) {
      const segs = d.readUInt16BE(sub + 6) / 2;
      const ends = sub + 14, starts = ends + segs * 2 + 2;
      const deltas = starts + segs * 2, ranges = deltas + segs * 2;
      for (let s = 0; s < segs; s++) {
        const end = d.readUInt16BE(ends + s * 2), start = d.readUInt16BE(starts + s * 2);
        const delta = d.readInt16BE(deltas + s * 2), range = d.readUInt16BE(ranges + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          let gid = 0;
          if (range === 0) gid = (c + delta) & 0xffff;
          else {
            const g = d.readUInt16BE(ranges + s * 2 + range + (c - start) * 2);
            gid = g ? (g + delta) & 0xffff : 0;
          }
          if (gid) have.add(c);
        }
      }
    } else if (format === 12) {
      const groups = d.readUInt32BE(sub + 12);
      for (let g = 0; g < groups; g++) {
        const base = sub + 16 + g * 12;
        const start = d.readUInt32BE(base), end = d.readUInt32BE(base + 4), gid = d.readUInt32BE(base + 8);
        for (let c = start; c <= end; c++) if (gid + (c - start)) have.add(c);
      }
    }
  }
  return have;
}

const faces = cssFaces();
const notices = read('THIRD-PARTY-NOTICES.md').toString('utf8');
const fontFiles = fs.readdirSync(path.join(ROOT, 'fonts')).filter(f => f.endsWith('.woff2'));
const coverage = new Map();
for (const f of faces) {
  const exists = fs.existsSync(path.join(ROOT, 'fonts', f.file));
  ok(exists, `fonts/${f.file} из css/style.css есть на диске`);
  if (exists) coverage.set(f.file, woff2Coverage(read(`fonts/${f.file}`)));
}
for (const file of fontFiles) {
  ok(faces.some(f => f.file === file), `fonts/${file} подключён в css/style.css`);
  ok(notices.includes(file), `fonts/${file} назван в THIRD-PARTY-NOTICES.md`);
}
for (const cp of neededCodePoints()) {
  const face = faceFor(cp, faces);
  ok(face, `${hex(cp)} ${String.fromCodePoint(cp)} попадает в unicode-range какого-нибудь файла`);
  if (face && coverage.has(face.file)) {
    ok(coverage.get(face.file).has(cp), `${hex(cp)} ${String.fromCodePoint(cp)} есть в ${face.file}`);
  }
}
// Диапазоны не должны пересекаться: иначе выбор файла зависит от порядка правил.
const spans = faces.flatMap(f => f.ranges.map(r => [...r, f.file])).sort((a, b) => a[0] - b[0]);
for (let i = 1; i < spans.length; i++) {
  ok(spans[i][0] > spans[i - 1][1], `диапазоны ${spans[i - 1][2]} и ${spans[i][2]} не пересекаются`);
}

done();

// ---------- значки ----------

done = section('значки');

const css = read('css/style.css').toString('utf8');
const used = new Set([...css.matchAll(/url\(\.\.\/icons\/([a-z0-9-]+)\.svg\)/gu)].map(m => m[1]));
const files = fs.readdirSync(path.join(ROOT, 'icons')).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4));
for (const name of used) ok(files.includes(name), `icons/${name}.svg, на который ссылается CSS, есть на диске`);
for (const name of files) {
  ok(used.has(name), `icons/${name}.svg используется в css/style.css`);
  const svg = read(`icons/${name}.svg`).toString('utf8');
  ok(/^<svg[^>]*viewBox="0 0 24 24"/u.test(svg) && /fill="currentColor"/u.test(svg),
    `icons/${name}.svg — контур набора на сетке 24 с цветом currentColor`);
}
const said = /В Charsets (?:входит|входят) (\d+) знач/u.exec(notices)?.[1];
ok(Number(said) === files.length, `THIRD-PARTY-NOTICES.md называет ${said} значков, в icons/ их ${files.length}`);

done();

console.log(process.exitCode ? 'есть провалы' : `всё в порядке: ${checks} проверок`);
