// Есть ли у посетителя шрифт, чтобы нарисовать этот символ.
//
// Свою гарнитуру мы кладём в комплект, но она покрывает только кодовые
// страницы — 726 символов. В режиме «по символу» ось идёт по всему BMP,
// и туда попадают иероглифы, деванагари, эмодзи. Уложить это в комплект
// нельзя: одни только CJK-шрифты весят десятки мегабайт против наших 32 КБ.
//
// Запретить браузеру подставлять системные шрифты тоже нельзя — да и не
// нужно: у японца иероглифы нарисуются, у нас нет. Поэтому вопрос не
// «есть ли глиф в комплекте», а «увидит ли его именно этот посетитель».
// На него отвечает только проверка тем же движком, который и рисует.
//
// Сравнение по ширине здесь не работает: в моноширинном шрифте у .notdef
// ширина такая же, как у буквы. Сравниваем по пикселям.

const SIZE = 24;                       // мельче — быстрее, различимости хватает
const cache = new Map();

let draw = null;                       // готовится лениво, после загрузки шрифтов
let notdef = '', blank = '', usable = false;

function prepare(font) {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.font = Math.round(SIZE * 0.7) + 'px ' + font;
  x.textBaseline = 'top';

  draw = t => {
    x.clearRect(0, 0, SIZE, SIZE);
    x.fillText(t, 1, 1);
    return x.getImageData(0, 0, SIZE, SIZE).data.join(',');
  };

  notdef = draw('￿');             // не назначен в Unicode: глифа нет нигде
  blank = draw(' ');

  // Защита от режимов приватности, где canvas отдаёт шум: если «А» и «中»
  // не отличаются от .notdef, проверке верить нельзя — молчим совсем.
  usable = draw('A') !== notdef && draw('A') !== blank;
}

// Пустота — законный вид для целого класса символов: пробелы, форматирующие,
// комбинирующие знаки. Их нельзя ловить сравнением с пустым растром, иначе
// обычный пробел объявляется отсутствующим глифом.
const INVISIBLE = /^[\p{White_Space}\p{Cc}\p{Cf}\p{Mn}\p{Me}\p{Zl}\p{Zp}]$/u;

// true — символ отрисуется; false — выйдет .notdef или пустота.
export function hasGlyph(ch) {
  if (!usable) return true;
  if (INVISIBLE.test(ch)) return true;
  const cp = ch.codePointAt(0);
  let v = cache.get(cp);
  if (v === undefined) {
    const d = draw(ch);
    v = d !== notdef && d !== blank;
    cache.set(cp, v);
  }
  return v;
}

export async function initGlyphs(font) {
  try { await document.fonts.ready; } catch { /* не критично */ }
  prepare(font);
  return usable;
}

// Одиночные символы, которые система нарисовать не может, заменяем своим
// значком. Смысла в подмене нет только на первый взгляд: браузер и так
// покажет квадрат, но квадрат неотличим от настоящих символов рамок
// (CP437 состоит из них наполовину) — а значок ни с чем не спутать.
export function markMissing(root) {
  if (!usable) return 0;
  let n = 0;
  for (const td of root.querySelectorAll('.c-char')) {
    if (td.firstElementChild) continue;          // там уже значок или мнемоника
    const t = td.textContent;
    if (!t || [...t].length !== 1) continue;     // ячейку из двух букв не трогаем
    if (hasGlyph(t)) continue;
    td.innerHTML = '<span class="box t-missing" data-tip="Символ в кодировке есть, '
      + 'но в вашей системе не нашлось шрифта, чтобы его нарисовать">?</span>';
    n++;
  }
  return n;
}
