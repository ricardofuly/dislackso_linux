/* ==========================================================================
   icons.js — conjunto de ícones em SVG inline
   --------------------------------------------------------------------------
   Nada de emoji: eles mudam de desenho, de tamanho e de alinhamento conforme
   o sistema operacional e a fonte, o que é exatamente a origem dos
   desalinhamentos em botões.

   Aqui todo ícone é a mesma grade 24x24, traço de 2, pontas arredondadas e
   `currentColor` — então herdam a cor do botão e alinham sempre igual.
   SVG inline também é obrigatório: a página roda sob CSP que bloqueia
   qualquer script ou fonte de fora.
   ========================================================================== */

'use strict';

const ICON_PATHS = {
  /* ---- áudio ---- */
  mic: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/><path d="M12 18v4"/><path d="M8 22h8"/>',
  micOff: '<path d="M2 2l20 20"/><path d="M9 9v2a3 3 0 0 0 5.1 2.1"/><path d="M15 9.3V5a3 3 0 0 0-5.9-.7"/><path d="M5 10v1a7 7 0 0 0 10.6 6"/><path d="M19 11v1a6.9 6.9 0 0 1-.9 3.4"/><path d="M12 18v4"/><path d="M8 22h8"/>',
  headphones: '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2-2h1v7H6a2 2 0 0 1-2-2z"/><path d="M20 14a2 2 0 0 0-2-2h-1v7h1a2 2 0 0 0 2-2z"/>',
  volume: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  volumeLow: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 9.5a4 4 0 0 1 0 5"/>',
  volumeOff: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M22 9l-6 6"/><path d="M16 9l6 6"/>',
  speaker: '<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',

  /* ---- tela ---- */
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  screenShare: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/><path d="M12 13V7"/><path d="M9.5 9.5L12 7l2.5 2.5"/>',
  screenOff: '<path d="M2 2l20 20"/><path d="M22 15V5a2 2 0 0 0-2-2H7"/><path d="M2 6.5V15a2 2 0 0 0 2 2h13"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  minimize: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  pip: '<path d="M2 10V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-6"/><rect x="2" y="13" width="10" height="8" rx="2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7.5 7.5"/><path d="M3 21l7.5-7.5"/>',
  shrink: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',

  /* ---- anotação ---- */
  pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  highlighter: '<path d="M9 14l6-6 4 4-6 6H6v-3z"/><path d="M3 21h18"/>',
  arrow: '<path d="M7 17L17 7"/><path d="M8 7h9v9"/>',
  trash: '<path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M18.5 6l-.9 13.1a2 2 0 0 1-2 1.9H8.4a2 2 0 0 1-2-1.9L5.5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>',

  /* ---- navegação e ações ---- */
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  x: '<path d="M18 6L6 18"/><path d="M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronRight: '<path d="M9 6l6 6-6 6"/>',
  more: '<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
  home: '<path d="M3 10.5L12 3l9 7.5"/><path d="M5.5 9.3V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.3"/>',
  logIn: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>',
  logOut: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
  upload: '<path d="M12 16V4"/><path d="M8 8l4-4 4 4"/><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',

  /* ---- pessoas ---- */
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 21a6.5 6.5 0 0 1 13 0"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.6a6.5 6.5 0 0 1 3.5 5.8"/>',

  /* ---- configurações ---- */
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  sliders: '<path d="M4 21v-6"/><path d="M4 11V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-4"/><path d="M20 13V3"/><path d="M1.5 15h5"/><path d="M9.5 8h5"/><path d="M17.5 17h5"/>',
  palette: '<path d="M12 2.5a9.5 9.5 0 1 0 0 19c1.1 0 2-.9 2-2 0-.5-.2-.95-.5-1.3-.3-.35-.5-.8-.5-1.2 0-1.1.9-2 2-2h1.8a4.7 4.7 0 0 0 4.7-4.7c0-4.3-4.3-7.8-9.5-7.8z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="16.5" cy="11" r="1.2" fill="currentColor" stroke="none"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>',
  zap: '<path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12z"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15.5l-4.5-4.5L5.5 21"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01"/><path d="M10 10h.01"/><path d="M14 10h.01"/><path d="M18 10h.01"/><path d="M7 14h10"/>',
  info: '<circle cx="12" cy="12" r="9.5"/><path d="M12 11.5V17"/><circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none"/>',
  activity: '<path d="M22 12h-4l-3 8-6-16-3 8H2"/>',
  shield: '<path d="M12 22s8-4 8-10V5.5L12 2.5 4 5.5V12c0 6 8 10 8 10z"/>',
};

/**
 * Devolve o SVG de um ícone.
 * @param {string} name  chave de ICON_PATHS
 * @param {number} size  lado em pixels (a grade é 24x24)
 */
function icon(name, size = 20) {
  const body = ICON_PATHS[name];
  if (!body) {
    console.warn('[icons] ícone desconhecido:', name);
    return '';
  }
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"`
    + ` stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
    + ` aria-hidden="true" focusable="false">${body}</svg>`;
}

/**
 * Troca `<span data-icon="mic" data-size="18">` pelo SVG correspondente.
 * Roda no HTML estático e em qualquer trecho criado depois.
 */
function hydrateIcons(root = document) {
  for (const slot of root.querySelectorAll('[data-icon]')) {
    const name = slot.dataset.icon;
    const size = Number(slot.dataset.size) || 20;
    slot.innerHTML = icon(name, size);
    slot.classList.add('i');
    delete slot.dataset.icon;
  }
}

/** Substitui o ícone de um elemento já hidratado. */
function setIcon(node, name, size = 20) {
  if (node) node.innerHTML = icon(name, size);
}

window.icon = icon;
window.hydrateIcons = hydrateIcons;
window.setIcon = setIcon;
window.ICON_PATHS = ICON_PATHS;
