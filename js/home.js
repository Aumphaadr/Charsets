// Главная страница. Движение конвейера живёт в CSS; здесь только начинка
// ящика — разряды, которые проявляются, гаснут и возникают в новом месте.
//
// Раскладывать их сеткой нельзя: регулярность читается как узор, а нужен
// шум работающей машины. Крупные редки, мелких много — так ящик выглядит
// глубоким.

import { initNav } from './nav.js';

const BITS = 34;
const FADE = 340;                  // должно совпадать с transition в CSS
const box = document.getElementById('blackbox');

// Уважение к системной настройке: если пользователь просил меньше движения,
// ящик остаётся статичным — картинка от этого не разваливается.
const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

const rnd = (a, b) => a + Math.random() * (b - a);

// Перестановка делается только пока разряд невидим, иначе он поехал бы
// по ящику на глазах — а нужно, чтобы он именно исчез здесь и возник там.
function place(b) {
  b.textContent = Math.random() < 0.5 ? '0' : '1';
  b.style.left = rnd(2, 94).toFixed(1) + '%';
  b.style.top = rnd(8, 86).toFixed(1) + '%';
  b.style.fontSize = (8 + Math.round(Math.pow(Math.random(), 2.2) * 20)) + 'px';
  b.dataset.level = rnd(0.18, 0.7).toFixed(2);
}

// Один разряд живёт своим циклом со своими сроками: общий таймер собрал бы
// их в синхронную пульсацию, а это выглядит фоном, а не работой.
function cycle(b) {
  b.style.opacity = b.dataset.level;                 // проявляется
  setTimeout(() => {
    b.style.opacity = '0';                           // гаснет
    setTimeout(() => {
      place(b);                                      // переезжает вслепую
      setTimeout(() => cycle(b), rnd(60, 700));      // и пауза перед возвратом
    }, FADE);
  }, rnd(1200, 3600));
}

const bits = [];
for (let i = 0; i < BITS; i++) {
  const b = document.createElement('span');
  b.className = 'bit';
  place(b);
  box.append(b);
  bits.push(b);
}

if (calm) {
  bits.forEach(b => { b.style.opacity = b.dataset.level; });
} else {
  // Разводим старты по времени, иначе первая волна вспыхнет разом.
  bits.forEach(b => setTimeout(() => cycle(b), rnd(0, 2600)));

  // Живой разряд иногда переключается, не сходя с места: ящик должен
  // считать, а не только мерцать.
  setInterval(() => {
    const b = bits[Math.floor(Math.random() * bits.length)];
    if (b.style.opacity !== '0') b.textContent = b.textContent === '0' ? '1' : '0';
  }, 380);
}

initNav('index.html');
