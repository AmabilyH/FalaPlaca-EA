// Ícones de interface em SVG (traço), inseridos em elementos com data-icone="nome".

const CAMINHOS = {
  microfone: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8"/>',
  tocar: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor" stroke="none"/>',
  parar: '<rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" stroke="none"/>',
  enviar: '<path d="M12 16V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  lixeira: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  bluetooth: '<path d="M7 7l10 10-5 5V2l5 5L7 17"/>',
  cartao: '<path d="M8 2h9a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7z"/><path d="M10 6v3M13 6v3M16 6v3"/>',
  anterior: '<path d="M15 6l-6 6 6 6"/>',
  proximo: '<path d="M9 6l6 6-6 6"/>',
  fechar: '<path d="M6 6l12 12M18 6L6 18"/>',
  imprimir: '<path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/><rect x="7" y="14" width="10" height="7"/>',
  sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
  volume: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>',
  voz: '<path d="M4 12h1M8 8v8M12 5v14M16 8v8M20 11v2"/>',
  ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  lapis: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  baixar: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  instalar: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M12 7v8M9 12l3 3 3-3"/>',
  teste: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 13l2 2 4-4"/>',
  placa: '<rect x="4" y="2" width="16" height="20" rx="3"/><circle cx="9" cy="9" r="1.6"/><circle cx="15" cy="9" r="1.6"/><circle cx="9" cy="15" r="1.6"/><circle cx="15" cy="15" r="1.6"/>',
};

export function icone(nome, classe = 'ico') {
  return `<svg class="${classe}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CAMINHOS[nome] ?? ''}</svg>`;
}

export function preencherIcones(raiz = document) {
  raiz.querySelectorAll('[data-icone]').forEach((el) => {
    el.insertAdjacentHTML('afterbegin', icone(el.dataset.icone));
    el.removeAttribute('data-icone');
  });
}
