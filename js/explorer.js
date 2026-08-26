// Состояние страницы и связывание виджетов с рендером.
import { CHARSETS, byId } from './charsets.js';
import { bankHtml, headHtml, BANK_SIZE, bytesOf } from './render.js';
import { initPicker, initDrag, initTips } from './ui.js';
import { initNav } from './nav.js';
import { initGlyphs, markMissing } from './glyphs.js';

// Обе оси доходят ровно до 65 535: в режиме «по коду» это двухбайтовые
// последовательности, в режиме «по символу» — конец BMP.
const MAX_BANKS = 0x10000 / 256;
// Кегль по умолчанию крупный: типовой сценарий — показать таблицу, а не
// уместить в экран побольше столбцов. Кому нужно много кодировок рядом,
// уменьшит вручную.
const FS_MIN = 10, FS_MAX = 24, FS_DEFAULT = 22;

const state = {
  mode: 'code',                        // 'code' — ось байт; 'char' — ось символ
  ids: ['windows-1251', 'windows-1252', 'cp866', 'koi8-r'],
  cols: ['dec'],
  dim: false,
  join: false,               // склеивать байты в одно число
  fontSize: FS_DEFAULT,
  banks: 1,                            // сколько банков загружено в режиме «по символу»
};

/* ---------- состояние в хеше: ссылка «смотри сюда» важнее localStorage ---------- */

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get('mode') === 'char') state.mode = 'char';
  const cs = (p.get('cs') || '').split(',').filter(id => byId(id));
  if (cs.length) state.ids = CHARSETS.filter(c => cs.includes(c.id)).map(c => c.id);
  if (p.has('cols')) state.cols = p.get('cols').split(',').filter(Boolean);
  state.dim = p.get('dim') === '1';
  state.join = p.get('join') === '1';
  const fs = +p.get('fs');
  if (fs >= FS_MIN && fs <= FS_MAX) state.fontSize = fs;
  // Объём ленты задаём всегда, а не только при наличии параметра: иначе
  // переход по ссылке без него оставил бы объём от прошлого состояния.
  const bk = +p.get('rows');
  state.banks = (bk >= 1 && bk <= MAX_BANKS) ? bk : 1;
}

function writeHash() {
  const p = new URLSearchParams({ mode: state.mode, cs: state.ids.join(','), cols: state.cols.join(',') });
  if (state.dim) p.set('dim', '1');
  if (state.join) p.set('join', '1');
  if (state.fontSize !== FS_DEFAULT) p.set('fs', String(state.fontSize));
  if (state.banks !== 1) p.set('rows', String(state.banks));
  history.replaceState(null, '', '#' + p);
}

const viewport = document.querySelector('.viewport');

/* ---------- ширины колонок считаем из числа байтов ---------- */
// У DejaVu Sans Mono ширина знака ровно 0.602 em, отсюда и считаем:
// при кегле 14px это 8.4px, что совпало с замером в Chrome. Отступы — 10px
// с каждой стороны, они с кеглем не растут.

const px = chars => Math.ceil(20 + state.fontSize * 0.602 * chars);

function applyWidths(sets) {
  const maxBytes = state.mode === 'code'
    ? (state.banks > 1 ? 2 : 1)                       // второй байт — только после догрузки
    : Math.max(...sets.map(c => c.kind === 'unicode' ? 4 : 1));
  // Столбец не может быть уже своего заголовка: имя кодировки должно
  // читаться целиком, иначе сравнивать нечего с чем.
  // Плюс запас: у заголовка группы есть левая граница, и при
  // border-collapse она съедает пиксель из ширины столбца. Без запаса
  // «Windows-1251» обрезалось многоточием ровно на один пиксель.
  const maxTitle = Math.max(60, ...sets.map(c => px(c.title.length) + 4));

  // Слитная запись короче: разделителей нет, а десятичная длина считается
  // по наибольшему значению — два байта это 65535, пять знаков, а не шесть.
  let dec = px(state.join ? String(2 ** (8 * maxBytes) - 1).length : 4 * maxBytes - 1);
  // В режиме «по символу» имя кодировки стоит над группой DEC/HEX/BIN.
  // Если включён только DEC, ширину группы задаёт именно заголовок.
  if (state.mode === 'char') dec = Math.max(dec, maxTitle);

  const r = viewport.style;
  r.setProperty('--w-dec', dec + 'px');
  r.setProperty('--w-hex', px(state.join ? 2 * maxBytes : 3 * maxBytes - 1) + 'px');
  r.setProperty('--w-bin', px(state.join ? 8 * maxBytes : 9 * maxBytes - 1) + 'px');
  r.setProperty('--w-char', (state.mode === 'code' ? maxTitle : 46) + 'px');
  r.setProperty('--n-sets', String(sets.length));
  r.setProperty('--fs', state.fontSize + 'px');
}

/* ---------- рендер ---------- */

const axisnote = document.querySelector('.axisnote');
const headWrap = document.querySelector('.headwrap');
const ribbon   = document.querySelector('.ribbon');
const more     = document.querySelector('.more');

function sets() { return state.ids.map(byId); }

/* ---------- недостающие глифы ---------- */
// Проверять все 65 536 строк разом нельзя — это секунды. Смотрим блок
// в тот момент, когда он выезжает на экран: он же и так отрисовывается
// лениво из-за content-visibility, так что момент ровно тот самый.

let watcher = null;

function initMissingWatch() {
  watcher = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) {
      markMissing(e.target);
      e.target.dataset.checked = '1';    // видно снаружи, что блок уже смотрели
      watcher.unobserve(e.target);       // и второй раз незачем
    }
  }, { root: viewport, rootMargin: '300px' });
}

const watchBlocks = from => {
  if (!watcher) return;
  const blocks = ribbon.children;
  for (let i = from; i < blocks.length; i++) watcher.observe(blocks[i]);
};

/* ---------- отрисовка порциями ---------- */
// Полная лента BMP — это 65 536 строк на каждую выбранную кодировку, и
// собрать её одним куском значит подвесить вкладку на секунды. Поэтому
// банки добавляются порциями с возвратом управления браузеру между ними,
// а на время работы контролы, способные начать отрисовку заново, гаснут.

let renderGen = 0;                 // поколение: устаревшая отрисовка сама себя бросает
const frame = () => new Promise(requestAnimationFrame);

function setBusy(on) {
  if (!on) document.querySelector('.toploader .bar').style.width = '0';
  document.querySelector('.picker > button').disabled = on;
  document.querySelectorAll('.seg button, .more button').forEach(b => { b.disabled = on; });
  document.body.dataset.busy = on ? '1' : '0';
}

const toploader = document.querySelector('.toploader');

// Счёт ведём в абсолютных строках ленты, а не от начала догружаемого куска:
// «18 944 из 65 536» понятно, «18 944 из 65 280» — уже нет.
function showProgress(done, total) {
  const pct = done / total * 100;
  toploader.firstElementChild.style.width = pct.toFixed(1) + '%';
  toploader.setAttribute('role', 'progressbar');
  toploader.setAttribute('aria-valuenow', String(Math.round(pct)));
  more.innerHTML = '<span class="done">строится лента: '
    + `${(done * BANK_SIZE).toLocaleString('ru')} из ${(total * BANK_SIZE).toLocaleString('ru')}</span>`;
}

// Возвращает false, если отрисовку обогнала более свежая.
async function fillBanks(gen, s, from, to, scrollTop) {
  const long = to - from > 8;
  if (long) setBusy(true);
  let i = from, t0 = performance.now();
  while (i < to) {
    if (gen !== renderGen) return false;
    const before = ribbon.children.length;
    ribbon.insertAdjacentHTML('beforeend', bankHtml(i * BANK_SIZE, s, state.mode, state.join));
    watchBlocks(before);
    i++;
    // Отдаём управление, накопив кадр работы: так страница остаётся живой.
    if (performance.now() - t0 > 12) {
      if (long) showProgress(i, to);
      if (scrollTop) viewport.scrollTop = scrollTop;
      await frame();
      if (gen !== renderGen) return false;
      t0 = performance.now();
    }
  }
  if (long) setBusy(false);
  if (scrollTop) viewport.scrollTop = scrollTop;
  return true;
}

async function render(keepScroll) {
  const gen = ++renderGen;
  const s = sets();
  const top = keepScroll ? viewport.scrollTop : 0;

  applyWidths(s);
  viewport.dataset.cols = state.cols.join(' ');
  viewport.dataset.mode = state.mode;
  viewport.dataset.dim = state.dim ? '1' : '0';

  axisnote.textContent = state.mode === 'code'
    ? 'Ось — последовательность байтов. Строка показывает, что означает один и тот же набор битов в каждой кодировке.'
    : 'Ось — символ. Строка показывает, какими байтами один и тот же символ записан в каждой кодировке.';

  headWrap.innerHTML = headHtml(s, state.mode);
  if (watcher) watcher.disconnect();
  ribbon.innerHTML = '';
  writeHash();

  if (await fillBanks(gen, s, 0, state.banks, top)) renderMore();
}

function renderMore() {
  const shown = state.banks * BANK_SIZE;
  const less = state.banks > 1
    ? '<button data-less="1" title="Свернуть ленту обратно до первых 256 строк">Показать меньше</button>'
    : '';

  if (state.banks >= MAX_BANKS) {
    // Дальше лента не идёт не из-за недогруза, а из-за размера самого
    // пространства. Это и есть содержательный ответ, а не отговорка.
    const why = state.mode === 'code'
      ? 'Двухбайтовые последовательности кончились. Трёхбайтовых 16 777 216, '
        + 'четырёхбайтовых 4 294 967 296 — лентой такое не показать.'
      : 'Показан весь BMP — 65 536 кодовых точек. Плоскости выше U+FFFF пока не подключены.';
    more.innerHTML = less + `<span class="done">${why}</span>`;
    return;
  }

  more.innerHTML = less
    + '<button data-add="1">Показать ещё 256</button>'
    + '<button data-add="16">Показать ещё 4096</button>'
    + '<button data-add="all">Показать всё</button>'
    + `<span class="done">показано ${shown.toLocaleString('ru')} из 65 536</span>`;
}

/* ---------- события ---------- */

more.addEventListener('click', async e => {
  // Свернуть ленту — мгновенно: лишние банки просто убираются из DOM.
  // Это выход из положения, когда на 65 536 строках всё стало вязким.
  if (e.target.dataset.less) {
    state.banks = 1;
    const blocks = [...ribbon.children];
    blocks.slice(BANK_SIZE / 32).forEach(b => b.remove());
    viewport.scrollTop = 0;
    applyWidths(sets());
    renderMore(); writeHash();
    return;
  }

  const add = e.target.dataset.add; if (!add) return;
  const before = state.banks;
  state.banks = add === 'all' ? MAX_BANKS : Math.min(MAX_BANKS, state.banks + +add);
  // Дописываем только новые банки — уже отрисованное не трогаем.
  writeHash();
  // Ширина оси в режиме «по коду» меняется на втором байте — пересчитать
  // до того, как новые строки окажутся в DOM.
  if (before === 1) applyWidths(sets());
  if (await fillBanks(++renderGen, sets(), before, state.banks, 0)) renderMore();
});

function setMode(m) {
  if (m === state.mode) return;
  state.mode = m;
  state.banks = 1;
  document.querySelectorAll('.modes button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  render(false);
}

document.querySelector('.modes').addEventListener('click', e => {
  if (e.target.dataset.mode) setMode(e.target.dataset.mode);
});

// Склейка байтов меняет саму разметку строк, поэтому лента перерисовывается.
// Позиция прокрутки сохраняется: пользователь смотрит на то же место.
document.querySelector('.joinsw').addEventListener('click', e => {
  const j = e.target.dataset.join;
  if (!j || (j === '1') === state.join) return;
  state.join = j === '1';
  document.querySelectorAll('.joinsw button').forEach(b =>
    b.setAttribute('aria-pressed', String(b.dataset.join === j)));
  render(true);
});

/* ---------- кегль ---------- */
// Меняется только ширина колонок и переменная --fs: перерисовывать
// разметку незачем, содержимое строк от кегля не зависит.

function setFont(delta) {
  const next = Math.min(FS_MAX, Math.max(FS_MIN, state.fontSize + delta));
  if (next === state.fontSize) return;
  state.fontSize = next;
  document.querySelector('#fs-value').textContent = next;
  applyWidths(sets());
  writeHash();
}
document.querySelector('#fs-dec').addEventListener('click', () => setFont(-1));
document.querySelector('#fs-inc').addEventListener('click', () => setFont(+1));

document.querySelector('.cols').addEventListener('change', e => {
  const v = e.target.value;
  state.cols = e.target.checked ? [...state.cols, v] : state.cols.filter(x => x !== v);
  viewport.dataset.cols = state.cols.join(' ');
  writeHash();
});

// Признак «сравнивать нечего» уже проставлен на строках при отрисовке,
// поэтому галочка меняет ровно один атрибут — перерисовка не нужна.
document.querySelector('#dim').addEventListener('change', e => {
  state.dim = e.target.checked;
  viewport.dataset.dim = state.dim ? '1' : '0';
  writeHash();
});

/* ---------- старт ---------- */

initNav('explorer.html');
readHash();
document.querySelectorAll('.modes button').forEach(b =>
  b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode)));
document.querySelectorAll('.joinsw button').forEach(b =>
  b.setAttribute('aria-pressed', String((b.dataset.join === '1') === state.join)));
document.querySelectorAll('.cols input').forEach(i => {
  if (!i.disabled) i.checked = state.cols.includes(i.value);
});
document.querySelector('#dim').checked = state.dim;

let syncPicker;
syncPicker = initPicker(document.querySelector('.picker'), state, () => render(true));
initDrag(headWrap, state, () => { render(true); syncPicker(); });
initTips(viewport);

// Проверка глифов включается после загрузки шрифтов: до этого браузер
// рисует запасным, и ответ был бы про чужую гарнитуру.
initGlyphs(getComputedStyle(viewport).getPropertyValue('--font-glyph') || 'monospace')
  .then(ok => { if (ok) { initMissingWatch(); watchBlocks(0); } });
render(false);
