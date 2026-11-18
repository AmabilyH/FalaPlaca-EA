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

const PADRAO = {
  1: { texto: 'Estou com dor.', icone: '🤕', bloco: 0 },
  2: { texto: 'Preciso ir ao banheiro.', icone: '🚽', bloco: 0 },
  3: { texto: 'Preciso de água.', icone: '💧', bloco: 0 },
  4: { texto: 'Estou feliz.', icone: '😊', bloco: 1 },
  5: { texto: 'Estou triste.', icone: '😢', bloco: 1 },
  6: { texto: 'Estou com medo.', icone: '😨', bloco: 1 },
  7: { texto: 'Preciso de ajuda.', icone: '🙋', bloco: 2 },
  8: { texto: 'Não entendi.', icone: '❓', bloco: 2 },
  9: { texto: 'Olá.', icone: '👋', bloco: 3 },
  10: { texto: 'Obrigado(a).', icone: '🙏', bloco: 3 },
};

export const ICONES = [
  '🤕', '🤒', '🚽', '💧', '🍎', '🍽️', '😴', '🩹',
  '😊', '😢', '😨', '😠', '😍', '🥱', '🤔', '😮',
  '🙋', '❓', '✏️', '📚', '✅', '⏸️', '🔊', '🧩',
  '👋', '🙏', '👍', '👎', '❤️', '🤝', '🏠', '⚽',
  '🎵', '🎨', '🧸', '🚌', '☀️', '🌧️', '👨‍👩‍👧', '⭐',
];

export const TEXTO_MAXIMO = 40;

export const nomeArquivo = (numero, extensao = 'wav') =>
  `${String(numero).padStart(3, '0')}.${extensao}`;

export const corDoBotao = (b) => CORES_BOTAO[b.coluna];
export const formaDoBotao = (b) => FORMAS[FORMAS_FILEIRA[b.fileira][b.coluna]];

export function placaPadrao() {
  return {
    versao: VERSAO_PLACA,
    volume: 22,
    botoes: POSICOES.map((p) => ({
      numero: p.numero,
      assento: `${p.fileira + 1}${COLUNAS[p.coluna]}`,
      fileira: p.fileira,
      coluna: p.coluna,
      bloco: PADRAO[p.numero].bloco,
      texto: PADRAO[p.numero].texto,
      icone: PADRAO[p.numero].icone,
      audio: null, // { duracao, picos, origem, atualizadoEm }
    })),
  };
}

// Versões anteriores tinham outro desenho de placa; frases, pictogramas e áudios
// são mantidos pelo número do botão, que não mudou.
export function migrarPlaca(salva) {
  if (salva?.versao === VERSAO_PLACA) return salva;
  const placa = placaPadrao();
  if (!salva?.botoes) return placa;
  placa.volume = salva.volume ?? placa.volume;
  for (const b of placa.botoes) {
    const antigo = salva.botoes.find((a) => a.numero === b.numero);
    if (!antigo) continue;
    b.texto = antigo.texto;
    b.icone = antigo.icone;
    b.audio = antigo.audio;
  }
  return placa;
}
