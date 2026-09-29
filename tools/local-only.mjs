// Страж: страницы Charsets ничего не грузят извне.
//
//   node tools/local-only.mjs [корень]
//
// Всё, что нужно странице, — стили, сценарии, шрифты, значки, картинки —
// лежит в репозитории Charsets. Ни CDN, ни прямых ссылок на файлы репозиториев
// GitHub и сайтов на GitHub Pages, в том числе набора Klaarheid Icons:
// GitHub не хостинг для раздачи файлов сайтам. Значки набора копируются
// в репозиторий файлами (CONTRIBUTING.md, раздел «Чужие файлы»).
//
// Проверяются файлы, которые отдаёт сайт: *.html, *.css, *.js, *.svg.
// Внешний адрес разрешён в двух случаях: в ссылке для перехода
// (<a href="https://…">, в том числе внутри строки сценария) и в строке-
// комментарии. Пространства имён XML (http://www.w3.org/…) — не адреса
// загрузки, они тоже пропускаются.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const SERVED = new Set(['.html', '.css', '.js', '.svg']);
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'tools']);
const NAMESPACE = /^http:\/\/www\.w3\.org\/(?:2000\/svg|1999\/xlink|1999\/xhtml|XML\/1998\/namespace)$/u;

// Полный адрес или адрес без протокола: «//cdn.example.com/…».
const ADDRESS = /(?:\bhttps?:)?\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`)<>]*/giu;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*|<!--)/u;

function servedFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) out.push(...servedFiles(path.join(dir, entry.name)));
    } else if (SERVED.has(path.extname(entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Адрес стоит в href ссылки <a …>: от последнего «<» до адреса — открытый тег <a
// с атрибутом href. Так пропускаются и ссылки в разметке, и ссылки, которые
// сценарий собирает строкой.
function inAnchorHref(text, index) {
  const open = text.lastIndexOf('<', index);
  if (open < 0) return false;
  return /^<a\s[^<>]*\bhref\s*=\s*["']?$/iu.test(text.slice(open, index));
}

const files = servedFiles(ROOT).sort();
let failures = 0;

for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const lineStarts = [0];
  for (let i = 0; i < text.length; i = i + 1) if (text[i] === '\n') lineStarts.push(i + 1);

  for (const match of text.matchAll(ADDRESS)) {
    const address = match[0];
    if (NAMESPACE.test(address)) continue;
    if (inAnchorHref(text, match.index)) continue;
    let line = lineStarts.length;
    while (lineStarts[line - 1] > match.index) line = line - 1;
    const lineEnd = text.indexOf('\n', match.index);
    const lineText = text.slice(lineStarts[line - 1], lineEnd < 0 ? text.length : lineEnd);
    if (COMMENT_LINE.test(lineText)) continue;
    console.error(`ПРОВАЛ: внешний адрес ${path.relative(ROOT, file)}:${line} — ${address}`);
    failures = failures + 1;
  }
}

if (failures) {
  console.error('страница грузит файлы извне — всё, что ей нужно, кладите в репозиторий Charsets');
  process.exitCode = 1;
} else {
  console.log(`внешние адреса: порядок, файлов проверено ${files.length}`);
}
