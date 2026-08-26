// Виджеты шапки: список кодировок с чекбоксами и перетаскивание столбцов.
import { CHARSETS, GROUPS } from './charsets.js';

/* ---------- выпадающий список с чекбоксами ---------- */
// Нативный <select multiple> не годится: не стилизуется, не группируется
// по-человечески и непредсказуем на сенсорных экранах.

export function initPicker(root, state, onChange) {
  const btn = root.querySelector('button');
  const panel = root.querySelector('.panel');

  // Кодировок под сорок — без поиска список превращается в простыню.
  const groupsHtml = GROUPS.map(g => {
    const inGroup = CHARSETS.filter(c => c.kind === g.kind);
    const families = [...new Set(inGroup.map(c => c.family))];
    return `<h4>${g.title}</h4>` + families.map(f =>
      (families.length > 1 || f !== g.title ? `<h5>${f}</h5>` : '')
      + inGroup.filter(c => c.family === f).map(c =>
          `<label data-search="${(c.title + ' ' + c.id).toLowerCase()}">`
        + `<input type="checkbox" value="${c.id}">`
        + `<span>${c.title}</span>`
        + (c.note ? `<span class="note" title="${c.note}">ⓘ</span>` : '')
        + '</label>').join('')).join('');
  }).join('');

  panel.innerHTML = '<input class="find" type="search" placeholder="Поиск кодировки" aria-label="Поиск кодировки">'
    + `<div class="list">${groupsHtml}</div>`
    + '<div class="foot"><span class="count"></span><button type="button">Оставить одну</button></div>';

  const boxes = [...panel.querySelectorAll('input[type=checkbox]')];
  const count = panel.querySelector('.count');
  const find = panel.querySelector('.find');

  function sync() {
    boxes.forEach(b => { b.checked = state.ids.includes(b.value); });
    // Снятие последней галочки запрещено — по той же логике,
    // что и неотключаемый CHAR: пустая таблица бессмысленна.
    boxes.forEach(b => { b.disabled = b.checked && state.ids.length === 1; });
    const titles = state.ids.map(id => CHARSETS.find(c => c.id === id).title);
    btn.firstChild.textContent = titles.length === 1
      ? titles[0] : `${titles[0]} +${titles.length - 1}`;
    count.textContent = `выбрано: ${state.ids.length}`;
  }

  find.addEventListener('input', () => {
    const q = find.value.trim().toLowerCase();
    const nodes = [...panel.querySelector('.list').children];
    nodes.forEach(n => {
      if (n.tagName === 'LABEL') n.hidden = q !== '' && !n.dataset.search.includes(q);
    });
    // Заголовок прячем, если под ним не осталось ни одной видимой строки.
    // Идём с конца: так h5 успевает посчитаться раньше, чем h4 над ним.
    let seenLabel = false, seenSub = false;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.tagName === 'LABEL') { if (!n.hidden) { seenLabel = true; seenSub = true; } }
      else if (n.tagName === 'H5') { n.hidden = !seenLabel; seenLabel = false; }
      else if (n.tagName === 'H4') { n.hidden = !seenSub; seenSub = false; seenLabel = false; }
    }
  });

  panel.addEventListener('change', e => {
    if (e.target.type !== 'checkbox') return;
    const id = e.target.value;
    if (e.target.checked) {
      // Порядок колонок — порядок списка, а не порядок выбора:
      // столбцы не должны прыгать при снятии галочки.
      state.ids = CHARSETS.filter(c => state.ids.includes(c.id) || c.id === id).map(c => c.id);
    } else {
      state.ids = state.ids.filter(x => x !== id);
    }
    sync(); onChange();
  });

  panel.querySelector('.foot button').addEventListener('click', () => {
    state.ids = state.ids.slice(0, 1); sync(); onChange();
  });

  btn.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) find.focus();
  });
  document.addEventListener('click', e => {
    if (!root.contains(e.target)) panel.hidden = true;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') panel.hidden = true; });

  sync();
  return sync;
}

/* ---------- перетаскивание столбцов ---------- */
// Живой предпросмотр идёт только по шапке — она дёшева. Тело
// перестраивается один раз, на отпускании.

export function initDrag(headWrap, state, onChange) {
  let from = null;

  headWrap.addEventListener('dragstart', e => {
    const th = e.target.closest('.grp'); if (!th) return;
    from = th.dataset.id; th.classList.add('drag');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', from);
  });

  headWrap.addEventListener('dragover', e => {
    const th = e.target.closest('.grp'); if (!th || !from) return;
    e.preventDefault();
    headWrap.querySelectorAll('.grp.over').forEach(x => x.classList.remove('over'));
    if (th.dataset.id !== from) th.classList.add('over');
  });

  headWrap.addEventListener('drop', e => {
    const th = e.target.closest('.grp'); if (!th || !from) return;
    e.preventDefault();
    const to = th.dataset.id;
    if (to !== from) {
      const rest = state.ids.filter(id => id !== from);
      rest.splice(rest.indexOf(to), 0, from);
      state.ids = rest;
      onChange();
    }
    from = null;
  });

  headWrap.addEventListener('dragend', () => {
    headWrap.querySelectorAll('.drag, .over').forEach(x => x.classList.remove('drag', 'over'));
    from = null;
  });
}

/* ---------- подсказки ---------- */
// Один плавающий элемент на всю страницу и делегирование событий: вешать
// обработчик на каждую ячейку при 65 536 строках нельзя. Нативный title
// не годится — он медленный, не стилизуется и обрезает длинный текст.

export function initTips(root) {
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  document.body.append(tip);

  let current = null;

  function show(el) {
    current = el;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    // Не даём подсказке уехать за край окна.
    const left = Math.min(Math.max(6, r.left + r.width / 2 - t.width / 2),
                          innerWidth - t.width - 6);
    const above = r.top > t.height + 12;
    tip.style.left = left + 'px';
    tip.style.top = (above ? r.top - t.height - 8 : r.bottom + 8) + 'px';
  }

  function hide() { current = null; tip.hidden = true; }

  root.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-tip]');
    if (el !== current) el ? show(el) : hide();
  });
  root.addEventListener('mouseleave', hide);
  addEventListener('scroll', hide, true);
}
