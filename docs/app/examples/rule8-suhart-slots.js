// Тонкая обёртка над suhart-slots.js — точка входа для EXAMPLES[8].
// См. комментарий в rule9-suhart-slots.js — та же причина (дедупликация
// монтажа по modulePath + отсутствие способа передать opts иначе).
import { mount as mountShared } from './suhart-slots.js';

export function mount(container) {
  return mountShared(container, { targetRuleNum: 8 });
}
