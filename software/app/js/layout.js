// Layout físico da FalaPlaca: espelha PINOS_BOTOES do firmware.
// O número do botão é a ordem de leitura da placa e o nome do arquivo no cartão (/01/00n).

export const VERSAO_PLACA = 2;

export const FILEIRAS = [
  { nome: 'Saúde', cor: '#e5484d', clara: '#fde8e8' },
  { nome: 'Emoções', cor: '#e09a00', clara: '#fdf1d2' },
  { nome: 'Escola', cor: '#3e7bfa', clara: '#e4edff' },
  { nome: 'Social', cor: '#1f9d63', clara: '#d9f4e7' },
];

export const COLUNAS = ['A', 'B', 'C'];

// Grade 3×4 do corte a laser original; as posições 3B e 4B ficam sem botão.
export const POSICOES = [
  { numero: 1, fileira: 0, coluna: 0 },
  { numero: 2, fileira: 0, coluna: 1 },
  { numero: 3, fileira: 0, coluna: 2 },
  { numero: 4, fileira: 1, coluna: 0 },
  { numero: 5, fileira: 1, coluna: 1 },
  { numero: 6, fileira: 1, coluna: 2 },
  { numero: 7, fileira: 2, coluna: 0 },
  { numero: 8, fileira: 2, coluna: 2 },
  { numero: 9, fileira: 3, coluna: 0 },
  { numero: 10, fileira: 3, coluna: 2 },
];

const PADRAO = {
  1: { texto: 'Estou com dor.', icone: '🤕' },
  2: { texto: 'Preciso ir ao banheiro.', icone: '🚽' },
  3: { texto: 'Preciso de água.', icone: '💧' },
  4: { texto: 'Estou feliz.', icone: '😊' },
  5: { texto: 'Estou triste.', icone: '😢' },
  6: { texto: 'Estou com medo.', icone: '😨' },
  7: { texto: 'Preciso de ajuda.', icone: '🙋' },
  8: { texto: 'Não entendi.', icone: '❓' },
  9: { texto: 'Olá.', icone: '👋' },
  10: { texto: 'Obrigado(a).', icone: '🙏' },
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

export function placaPadrao() {
  return {
    versao: VERSAO_PLACA,
    volume: 22,
    fileiras: FILEIRAS.map((f) => ({ nome: f.nome })),
    botoes: POSICOES.map((p) => ({
      numero: p.numero,
      assento: `${p.fileira + 1}${COLUNAS[p.coluna]}`,
      fileira: p.fileira,
      coluna: p.coluna,
      texto: PADRAO[p.numero].texto,
      icone: PADRAO[p.numero].icone,
      audio: null, // { duracao, picos, origem, atualizadoEm }
    })),
  };
}
