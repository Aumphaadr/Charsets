// Боковое меню — общее для всех страниц. Заодно держит легенду значков:
// они встречаются и в обозревателе, и в перекодировщике, а расшифровка
// нужна под рукой, а не на отдельной странице.

const PAGES = [
  { href: 'index.html',    title: 'Главная',
    note: 'С чего всё начинается и что здесь есть' },
  { href: 'explorer.html', title: 'Обозреватель кодировок',
    note: 'Таблицы всех кодировок, сравнение бок о бок' },
  { href: 'convert.html',  title: 'Перекодировщик',
    note: 'Текст в байты и обратно, кракозябры вживую' },
];

const LEGEND = [
  ['<span class="box">LF</span>', 'управляющий символ; наведите — увидите имя'],
  ['<span class="ic t-none">·</span>', 'позиция в кодировке не занята'],
  ['<span class="ic t-part">…</span>', 'продолжающий байт UTF-8'],
  ['<span class="ic t-lead">2</span>', 'начало последовательности такой длины'],
  ['<span class="ic t-bad">⊘</span>', 'так не бывает: недопустимый байт или непредставимый символ'],
  ['<span class="ic t-part">½</span>', 'половина кодовой единицы UTF-16'],
  ['<span class="ic t-part">¼</span>', 'четверть кодовой единицы UTF-32'],
  ['<span class="ic t-part">◌</span>', 'суррогатная половина'],
];

export function initNav(currentHref) {
  const sidebar = document.querySelector('.sidebar');
  sidebar.innerHTML =
      '<h3>Кодировки</h3>'
    // Ссылкой должен быть весь подсвечиваемый прямоугольник, а не только
    // заголовок внутри него. Поэтому <a> блочный и вмещает и название,
    // и пояснение: обработчик на <li> сломал бы среднюю кнопку,
    // контекстное меню и переход с клавиатуры.
    + '<ul class="pages">' + PAGES.map(p => p.href
        ? `<li><a href="${p.href}"${p.href === currentHref ? ' class="cur" aria-current="page"' : ''}>`
          + `<span class="t">${p.title}</span><span class="note">${p.note}</span></a></li>`
        : `<li><span class="soon"><span class="t">${p.title}</span>`
          + `<span class="note">${p.note}</span></span></li>`
      ).join('') + '</ul>'
    + '<h4>Обозначения</h4>'
    + '<dl class="legend">' + LEGEND.map(([sign, text]) =>
        `<dt>${sign}</dt><dd>${text}</dd>`).join('') + '</dl>';

  const scrim = document.querySelector('.scrim');
  document.querySelector('.burger').addEventListener('click', () => {
    const open = sidebar.dataset.open === '1';
    sidebar.dataset.open = open ? '0' : '1';
    scrim.hidden = open;
  });
  scrim.addEventListener('click', () => {
    sidebar.dataset.open = '0';
    scrim.hidden = true;
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { sidebar.dataset.open = '0'; scrim.hidden = true; }
  });
}
