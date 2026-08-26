// Отрисовка «частей» — общая для обозревателя и перекодировщика.
// Часть — это либо готовый символ, либо служебный значок с подсказкой.

export const esc = s => String(s).replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Служебные состояния показываем значком с подсказкой, а не словами:
// «продолжающий байт» занимало полстроки на каждую кодировку.
export function partHtml(p) {
  if (p.char !== undefined) {
    return p.tip ? `<span data-tip="${esc(p.tip)}">${esc(p.char)}</span>` : esc(p.char);
  }
  if (p.mn !== undefined) return `<span class="box" data-tip="${esc(p.tip)}">${esc(p.mn)}</span>`;
  return `<span class="ic t-${p.tone}" data-tip="${esc(p.tip)}">${esc(p.icon)}</span>`;
}

export const partsHtml = parts => parts.map(partHtml).join('');
