# Шрифты

Подмножества шрифтов под ровно тот набор знаков, который рисуют кодовые
страницы сайта: всё, что модель отдаёт как текст для одного байта любой
кодировки, плюс значки состояний и ASCII. Сейчас это 724 знака. Полные шрифты
тащить незачем — нужные знаки известны заранее и считаются из самой модели
(`npm run fonts:set`).

| Файл | Шрифт | Что в нём | Знаков | Размер |
|---|---|---|---|---|
| `DejaVuSansMono-Charsets.woff2` | DejaVu Sans Mono 2.37 | всё, кроме иврита, арабицы и `U+2044` | 611 | 19 КБ |
| `DejaVuSans-Charsets.woff2` | DejaVu Sans 2.37 | иврит и дробная косая `U+2044` | 53 | 4,5 КБ |
| `NotoSansArabic-Charsets.woff2` | Noto Sans Arabic 2.013 | арабица | 60 | 9,2 КБ |

Какой файл за какие знаки отвечает, решают `unicode-range` в `css/style.css`;
диапазоны не пересекаются, поэтому выбор файла не зависит от порядка правил.
Файлы иврита и арабицы браузер скачивает, только когда такие знаки есть
на странице.

## Почему файлов три

- **В DejaVu Sans Mono нет иврита вовсе**, а без него вся Windows-1255
  превратилась бы в квадраты. Иврит и `U+2044` есть в DejaVu Sans — том же
  семействе под той же лицензией.
- **Четырёх букв урду из Windows-1256 нет ни в одном шрифте DejaVu**
  (`U+0688`, `U+06BA`, `U+06C1`, `U+06D2`). Арабица поэтому берётся из Noto
  Sans Arabic целиком: буквы из двух гарнитур в одной таблице были бы разного
  рисунка.
- **В подмножествах иврита и арабицы сохранены правила OpenType.** Без них
  арабский текст в перекодировщике рассыпался бы на отдельные несоединённые
  буквы, а огласовки иврита сползали бы с мест.

Выносные элементы у Noto почти вдвое выше, чем у DejaVu, но на высоту строк
это не влияет: браузеры считают её по основному шрифту элемента, а Noto
для строки — запасной. Замерено в Chrome и Firefox: строки таблиц и поле
результата с арабицей той же высоты, что с латиницей, в том числе без всяких
поправок метрик в `@font-face`.

Ширину столбцов `js/explorer.js` считает от ширины знака DejaVu Sans Mono —
0,6 em. Пропорциональные DejaVu Sans и Noto её не трогают: иврит и арабица
встречаются только в столбцах символов, а там ширину задаёт имя кодировки.
Числа, шестнадцатеричная запись и «U+» набраны ASCII из моноширинного файла.

## Откуда исходники

Шрифты и тексты лицензий взяты из авторских релизов, а не из пакетов
дистрибутивов: Debian, например, собирает DejaVu сам, и его файлы отличаются
от авторских.

| Архив | Откуда | SHA-256 |
|---|---|---|
| `dejavu-fonts-ttf-2.37.zip` | https://github.com/dejavu-fonts/dejavu-fonts/releases/tag/version_2_37 | `7576310b219e04159d35ff61dd4a4ec4cdba4f35c00e002a136f00e96a908b0a` |
| `NotoSansArabic-v2.013.zip` | https://github.com/notofonts/arabic/releases/tag/NotoSansArabic-v2.013 | `1301aceaea84c501cf2e6dcfb3182e2328c8eae5725817fcb239672bda7154f1` |

Из архивов нужны `ttf/DejaVuSansMono.ttf`, `ttf/DejaVuSans.ttf` и `LICENSE`
у DejaVu, `NotoSansArabic/unhinted/ttf/NotoSansArabic-Regular.ttf` и `OFL.txt`
у Noto. `DejaVu-LICENSE.txt` и `NotoSansArabic-OFL.txt` здесь — эти `LICENSE`
и `OFL.txt` без изменений.

## Пересборка

Нужны Node 24.13.1 или новее и `pyftsubset` из fontTools (собрано версией
4.66.1). Списки знаков выдаёт `tools/font-set.mjs` — по модели и по
`unicode-range` из CSS, так что после правки диапазонов пересобирать
по ним же:

```sh
DJ=путь/к/dejavu-fonts-ttf-2.37/ttf
NO=путь/к/NotoSansArabic/unhinted/ttf

pyftsubset $DJ/DejaVuSansMono.ttf \
  --unicodes="$(node tools/font-set.mjs DejaVuSansMono-Charsets.woff2)" \
  --flavor=woff2 --layout-features='' --no-hinting --name-IDs='*' \
  --output-file=fonts/DejaVuSansMono-Charsets.woff2

pyftsubset $DJ/DejaVuSans.ttf \
  --unicodes="$(node tools/font-set.mjs DejaVuSans-Charsets.woff2)" \
  --flavor=woff2 --layout-features='*' --no-hinting --name-IDs='*' \
  --output-file=fonts/DejaVuSans-Charsets.woff2

pyftsubset $NO/NotoSansArabic-Regular.ttf \
  --unicodes="$(node tools/font-set.mjs NotoSansArabic-Charsets.woff2)" \
  --flavor=woff2 --layout-features='*' --no-hinting --name-IDs='*' \
  --output-file=fonts/NotoSansArabic-Charsets.woff2
```

Сборка детерминирована: на тех же исходниках файлы выходят байт в байт те же.
`--name-IDs='*'` оставляет в файлах строки об авторских правах и лицензии.

После пересборки — `npm run check`: раздел «шрифты» сверяет каждый нужный
знак с тем файлом, которому его отдаёт `unicode-range`.

## Лицензии

- DejaVu — Bitstream Vera Fonts License (у глифов Arev — Arev Fonts License),
  изменения DejaVu — общественное достояние: `DejaVu-LICENSE.txt`. Изменять
  шрифт можно, если в имени нет слов «Bitstream» и «Vera» («Arev» и «Tavmjong
  Bah»); подмножества сохраняют имена DejaVu Sans Mono и DejaVu Sans.
- Noto Sans Arabic — SIL Open Font License 1.1, без зарезервированного имени:
  `NotoSansArabic-OFL.txt`.

Сводка по всем сторонним файлам — в [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md).
