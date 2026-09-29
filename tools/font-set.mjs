// Какие знаки должны нарисовать шрифты сайта и какой файл за что отвечает.
//
//   node tools/font-set.mjs            сводка по файлам
//   node tools/font-set.mjs <файл>     список --unicodes= для pyftsubset
//
// Набор знаков берётся из модели, а не записывается руками: это всё, что
// atBytes() отдаёт как текст для одного байта любой кодировки, плюс значки
// состояний и ASCII, которым набраны числа и мнемоники. Раскладка по файлам —
// из unicode-range в css/style.css: так у неё один источник, и tools/check.mjs
// сверяет покрытие ровно с тем, что увидит браузер.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHARSETS, ICONS } from '../js/charsets.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function neededCodePoints() {
  const set = new Set();
  const addText = s => { for (const ch of s) set.add(ch.codePointAt(0)); };

  for (const cs of CHARSETS) {
    for (let b = 0; b < 256; b++) {
      for (const p of cs.atBytes([b]).parts) {
        if (p.char !== undefined) addText(p.char);
        if (p.icon !== undefined) addText(p.icon);
      }
    }
  }
  // Значки состояний, которые могут не выпасть на одиночный байт.
  // Первый аргумент у всех, кроме lead, — подсказка; lead ждёт длину.
  for (const make of Object.values(ICONS)) addText(make(2).icon);
  // Числа, шестнадцатеричная запись, мнемоники, «U+» — ASCII целиком;
  // «упр» на оси режима «по символу».
  for (let c = 0x20; c < 0x7f; c++) set.add(c);
  addText('упр');

  return [...set].sort((a, b) => a - b);
}

// @font-face семейства 'Charsets Mono': файл и его диапазоны.
export function cssFaces() {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
  const faces = [];
  for (const [, body] of css.matchAll(/@font-face\s*\{([^}]*)\}/gu)) {
    if (!/font-family:\s*'Charsets Mono'/u.test(body)) continue;
    const file = /url\('\.\.\/fonts\/([^']+)'\)/u.exec(body)?.[1];
    const range = /unicode-range:([^;]+);/u.exec(body)?.[1];
    if (!file || !range) throw new Error('@font-face без src или unicode-range');
    const ranges = range.split(',').map(r => {
      const m = /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/iu.exec(r.trim());
      const lo = parseInt(m[1], 16);
      return [lo, m[2] ? parseInt(m[2], 16) : lo];
    });
    faces.push({ file, ranges });
  }
  return faces;
}

export const faceFor = (cp, faces) =>
  faces.find(f => f.ranges.some(([lo, hi]) => cp >= lo && cp <= hi));

// ---------- запуск из командной строки ----------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const need = neededCodePoints();
  const faces = cssFaces();
  const byFile = new Map(faces.map(f => [f.file, []]));
  const orphan = [];
  for (const cp of need) {
    const f = faceFor(cp, faces);
    if (f) byFile.get(f.file).push(cp); else orphan.push(cp);
  }
  const want = process.argv[2];
  if (want) {
    if (!byFile.has(want)) { console.error(`нет @font-face с файлом ${want}`); process.exit(1); }
    console.log(byFile.get(want).map(c => 'U+' + c.toString(16).toUpperCase().padStart(4, '0')).join(','));
  } else {
    console.log(`знаков: ${need.length}`);
    for (const [file, cps] of byFile) console.log(`  ${file}: ${cps.length}`);
    if (orphan.length) console.log(`  вне всех диапазонов: ${orphan.length}`);
  }
}
