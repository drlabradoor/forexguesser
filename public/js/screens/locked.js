import { icons } from '../icons.js';

export function renderLocked({ icon, title, subtitle }) {
  const section = document.createElement('section');
  section.className = 'locked';
  section.innerHTML = `
    <div class="locked__icon">${icon}</div>
    <h2 class="locked__title">${title}</h2>
    <p class="locked__subtitle">${subtitle}</p>
    <button class="button button--primary" data-action="cta">Получить полный доступ</button>
  `;
  section.querySelector('.locked__icon').insertAdjacentHTML('beforeend', icons.lock);
  return section;
}
