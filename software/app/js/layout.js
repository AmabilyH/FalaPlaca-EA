// Layout físico da FalaPlaca: espelha PINOS_BOTOES do firmware.
// O número do botão é a ordem de leitura da placa e o nome do arquivo no cartão (/01/00n).

export const VERSAO_PLACA = 3;

// Placa de MDF na horizontal: 2 fileiras × 5 colunas. Cada coluna tem uma cor de botão.
export const COLUNAS = ['A', 'B', 'C', 'D', 'E'];

export const CORES_BOTAO = [
  { nome: 'vermelho', cor: '#e2343a' },
  { nome: 'laranja', cor: '#f5a00f' },
  { nome: 'branco', cor: '#e9ebee' },
  { nome: 'verde', cor: '#33c24a' },
  { nome: 'azul', cor: '#2e86e3' },
];

// Formas gravadas a laser atrás de cada botão (viewBox 0 0 100 100).
export const FORMAS = {
  coracao: { nome: 'coração', d: 'M50 90C22 70 5 52 5 32 5 17 16 7 29 7c9 0 16 5 21 12 5-7 12-12 21-12 13 0 24 10 24 25 0 20-17 38-45 58z' },
  estrela: { nome: 'estrela', d: 'M50 5 64 35 96 39 73 61 78 93 50 78 22 93 27 61 4 39 36 35z' },
  triangulo: { nome: 'triângulo', d: 'M50 8 94 88H6z' },
  quadrado: { nome: 'quadrado', d: 'M18 8h64a10 10 0 0 1 10 10v64a10 10 0 0 1-10 10H18A10 10 0 0 1 8 82V18A10 10 0 0 1 18 8z' },
  cruz: { nome: 'cruz', d: 'M27 6h46v21h21v46H73v21H27V73H6V27h21z' },
  losango: { nome: 'losango', d: 'M50 6 94 50 50 94 6 50z' },
};
const FORMAS_FILEIRA = [
  ['coracao', 'estrela', 'triangulo', 'quadrado', 'cruz'],
  ['losango', 'losango', 'losango', 'losango', 'losango'],
];

// Blocos temáticos: organizam o vocabulário e colorem as etiquetas no app.
export const BLOCOS = [
  { nome: 'Saúde', cor: '#e5484d', clara: '#fde8e8' },
  { nome: 'Emoções', cor: '#e09a00', clara: '#fdf1d2' },
  { nome: 'Escola', cor: '#3e7bfa', clara: '#e4edff' },
  { nome: 'Social', cor: '#1f9d63', clara: '#d9f4e7' },
];

export const POSICOES = Array.from({ length: 10 }, (_, i) => ({
  numero: i + 1,
  fileira: Math.floor(i / 5),
  coluna: i % 5,
}));

// arasaac: id do pictograma padrão (ver js/arasaac.js); icone: emoji alternativo, sem internet.
const PADRAO = {
  1: { texto: 'Estou com dor.', icone: '🤕', arasaac: 2367, bloco: 0 },
  2: { texto: 'Preciso ir ao banheiro.', icone: '🚽', arasaac: 2430, bloco: 0 },
  3: { texto: 'Preciso de água.', icone: '💧', arasaac: 2248, bloco: 0 },
  4: { texto: 'Estou feliz.', icone: '😊', arasaac: 32123, bloco: 1 },
  5: { texto: 'Estou triste.', icone: '😢', arasaac: 2606, bloco: 1 },
  6: { texto: 'Estou com medo.', icone: '😨', arasaac: 10261, bloco: 1 },
  7: { texto: 'Preciso de ajuda.', icone: '🙋', arasaac: 7171, bloco: 2 },
  8: { texto: 'Não entendi.', icone: '❓', arasaac: 27363, bloco: 2 },
  9: { texto: 'Olá.', icone: '👋', arasaac: 6009, bloco: 3 },
  10: { texto: 'Obrigado(a).', icone: '🙏', arasaac: 8128, bloco: 3 },
};

export const ICONES = [
  '🤕', '🤒', '🚽', '💧', '🍎', '🍽️', '😴', '🩹',
  '😊', '😢', '😨', '😠', '😍', '🥱', '🤔', '😮',
  '🙋', '❓', '✏️', '📚', '✅', '⏸️', '🔊', '🧩',
  '👋', '🙏', '👍', '👎', '❤️', '🤝', '🏠', '⚽',
  '🎵', '🎨', '🧸', '🚌', '☀️', '🌧️', '👨‍👩‍👧', '⭐',
];

export const TEXTO_MAXIMO = 40;

// Ajustes anti-tremor enviados à placa (comando AJUSTE). O padrão é o comportamento original.
// Os perfis são pontos de partida: ajuste com o estudante, observando toques acidentais e repetições.
export const LIMITES_AJUSTES = { pressaoMin: 50, pressaoMax: 1500, repeticaoMax: 10000 };
export const PERFIS_TREMOR = [
  { nome: 'Padrão', pressaoMs: 50, repeticaoMs: 0 },
  { nome: 'Leve', pressaoMs: 150, repeticaoMs: 1000 },
  { nome: 'Moderado', pressaoMs: 300, repeticaoMs: 2000 },
  { nome: 'Intenso', pressaoMs: 600, repeticaoMs: 3000 },
];
const ajustesPadrao = () => ({ pressaoMs: PERFIS_TREMOR[0].pressaoMs, repeticaoMs: PERFIS_TREMOR[0].repeticaoMs });

export const nomeArquivo = (numero, extensao = 'wav') =>
  `${String(numero).padStart(3, '0')}.${extensao}`;

export const corDoBotao = (b) => CORES_BOTAO[b.coluna];
export const formaDoBotao = (b) => FORMAS[FORMAS_FILEIRA[b.fileira][b.coluna]];

export function placaPadrao() {
  return {
    versao: VERSAO_PLACA,
    volume: 22,
    ajustes: ajustesPadrao(),
    botoes: POSICOES.map((p) => ({
      numero: p.numero,
      assento: `${p.fileira + 1}${COLUNAS[p.coluna]}`,
      fileira: p.fileira,
      coluna: p.coluna,
      bloco: PADRAO[p.numero].bloco,
      texto: PADRAO[p.numero].texto,
      icone: PADRAO[p.numero].icone,
      picto: { id: PADRAO[p.numero].arasaac }, // pictograma ARASAAC; null = usa o emoji
      audio: null, // { duracao, picos, origem, atualizadoEm }
    })),
  };
}

// Placas salvas antes dos pictogramas ARASAAC: usa o pictograma padrão só onde o emoji
// também era o padrão; um emoji escolhido pela professora é mantido.
function pictoInicial(b) {
  const padrao = PADRAO[b.numero];
  return padrao && b.icone === padrao.icone ? { id: padrao.arasaac } : null;
}

// Versões anteriores tinham outro desenho de placa; frases, pictogramas e áudios
// são mantidos pelo número do botão, que não mudou.
export function migrarPlaca(salva) {
  if (salva?.versao === VERSAO_PLACA) {
    return {
      ...salva,
      ajustes: salva.ajustes ?? ajustesPadrao(),
      botoes: salva.botoes.map((b) => ({ ...b, picto: b.picto === undefined ? pictoInicial(b) : b.picto })),
    };
  }
  const placa = placaPadrao();
  if (!salva?.botoes) return placa;
  placa.volume = salva.volume ?? placa.volume;
  placa.ajustes = salva.ajustes ?? placa.ajustes;
  for (const b of placa.botoes) {
    const antigo = salva.botoes.find((a) => a.numero === b.numero);
    if (!antigo) continue;
    b.texto = antigo.texto;
    b.icone = antigo.icone;
    b.picto = pictoInicial(antigo);
    b.audio = antigo.audio;
  }
  return placa;
}
