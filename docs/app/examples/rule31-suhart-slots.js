// Тонкая обёртка над suhart-slots.js — точка входа для НОВОГО (второго)
// элемента EXAMPLES[31] (первый элемент — vid-/vetsi, khari-случай cartva,
// не тронут). См. комментарий в rule9-suhart-slots.js — та же причина
// (дедупликация монтажа по modulePath + отсутствие способа передать opts
// иначе). Имя файла совпадает с прежним именем общей библиотеки НЕ
// случайно — общая библиотека переименована в suhart-slots.js именно
// чтобы освободить это имя под настоящую точку входа правила 31.
import { mount as mountShared } from './suhart-slots.js';

export function mount(container) {
  return mountShared(container, { targetRuleNum: 31 });
}
