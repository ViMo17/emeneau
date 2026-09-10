// Тонкая обёртка над suhart-slots.js (общая библиотека для правил 8/9/31,
// см. её собственный заголовок) — точка входа для EXAMPLES[9]. Собственный
// файл (не просто вызов mount с опцией напрямую из data.js) нужен по двум
// причинам: (1) rule-panel.js дедуплицирует повторный монтаж по СТРОКЕ
// modulePath (`currentAnim.modulePath === modulePath`) — если бы все три
// правила ссылались на один и тот же путь `suhart-slots.js`, переключение
// между карточками 8→9→31 не перемонтировало бы анимацию заново (её
// targetRuleNum остался бы от первого открытого правила); (2) `ex.module`
// в данных — просто путь к файлу, `rule-panel.js` вызывает `mod.mount(container)`
// без второго аргумента — передать `{targetRuleNum}` иначе, кроме как
// зашив его в собственный файл, негде.
import { mount as mountShared } from './suhart-slots.js';

export function mount(container) {
  return mountShared(container, { targetRuleNum: 9 });
}
