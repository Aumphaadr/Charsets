// Ширина конвейера тянется за кромки секций.
//
// Работы тут меньше, чем кажется: все три секции уже лежат в одном
// центрированном контейнере, поэтому «синхронно и симметрично» получается
// само собой. Меняем ширину контейнера — обе кромки расходятся поровну,
// и все секции меняются заодно, за какую бы из них ни тянули.
//
// Коэффициент два не произволен: чтобы схваченная кромка не отставала от
// курсора, ширина должна расти вдвое от его смещения — кромка ушла на Δ,
// зеркальная на столько же, итого 2Δ.

const MIN = 420;
const STEP = 40;                 // шаг стрелками: по 20 px на каждую кромку
const KEY = 'charsets.pipe-width';

const store = {
  // Приватные режимы браузера бросают на самом обращении к localStorage,
  // поэтому доступ всегда через try, а не только запись.
  get() { try { return +localStorage.getItem(KEY) || 0; } catch { return 0; } },
  set(v) { try { localStorage.setItem(KEY, v); } catch { /* переживём */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* переживём */ } },
};

export function initPipeResize(pipe) {
  const stages = [...pipe.querySelectorAll('.stage')];
  if (!stages.length) return;

  const limit = () => Math.max(MIN, pipe.parentElement.clientWidth - 24);
  const clamp = w => Math.max(MIN, Math.min(limit(), Math.round(w)));
  const width = () => pipe.getBoundingClientRect().width;
  const apply = w => pipe.style.setProperty('--pipe-w', clamp(w) + 'px');

  const saved = store.get();
  if (saved) apply(saved);

  // Ручки — чистая надстройка над разметкой, поэтому заводятся скриптом:
  // без него страница остаётся рабочей, просто нетянущейся.
  for (const st of stages) {
    for (const side of ['left', 'right']) {
      const g = document.createElement('div');
      g.className = 'grip ' + side;
      g.dataset.side = side;
      g.tabIndex = 0;
      g.setAttribute('role', 'separator');
      g.setAttribute('aria-orientation', 'vertical');
      g.setAttribute('aria-label', 'Ширина конвейера, стрелками влево и вправо');
      st.append(g);
    }
  }

  pipe.addEventListener('pointerdown', e => {
    const g = e.target.closest('.grip');
    if (!g || e.button !== 0) return;
    e.preventDefault();                       // иначе начнётся выделение текста
    g.setPointerCapture(e.pointerId);

    const startX = e.clientX, startW = width();
    const dir = g.dataset.side === 'right' ? 1 : -1;
    document.body.dataset.resizing = '1';

    const move = ev => apply(startW + dir * 2 * (ev.clientX - startX));
    const stop = () => {
      g.removeEventListener('pointermove', move);
      g.removeEventListener('pointerup', stop);
      g.removeEventListener('pointercancel', stop);
      delete document.body.dataset.resizing;
      store.set(Math.round(width()));
    };
    g.addEventListener('pointermove', move);
    g.addEventListener('pointerup', stop);
    g.addEventListener('pointercancel', stop);
  });

  // Двойной щелчок по кромке возвращает исходную ширину — привычный жест
  // для разделителей, и единственный способ вернуться, не целясь мышью.
  pipe.addEventListener('dblclick', e => {
    if (!e.target.closest('.grip')) return;
    pipe.style.removeProperty('--pipe-w');
    store.clear();
  });

  pipe.addEventListener('keydown', e => {
    const g = e.target.closest('.grip');
    if (!g) return;
    const dir = g.dataset.side === 'right' ? 1 : -1;
    let w = null;
    if (e.key === 'ArrowRight') w = width() + dir * STEP;
    else if (e.key === 'ArrowLeft') w = width() - dir * STEP;
    else if (e.key === 'Home') { pipe.style.removeProperty('--pipe-w'); store.clear(); e.preventDefault(); return; }
    if (w === null) return;
    e.preventDefault();
    apply(w);
    store.set(Math.round(width()));
  });

  // Окно уменьшили — ширина могла стать больше доступной; подрезаем,
  // но сохранённое значение не трогаем: вернут окно — вернётся и ширина.
  addEventListener('resize', () => {
    if (pipe.style.getPropertyValue('--pipe-w')) apply(width());
  });
}
