// Modo de teste: sessões de validação como as descritas no artigo (seção 3).
// Para cada tentativa registra o botão pedido, o botão apertado, se o áudio correspondeu e
// o tempo de resposta (aperto -> início do áudio, medido pela placa no pino BUSY do DFPlayer).
// Este módulo só tem a lógica; a tela fica em js/app.js.

import { BLOCOS } from './layout.js';

// Ordem das tentativas: cada botão aparece `repeticoes` vezes, nunca duas vezes seguidas
// (a espera anti-tremor bloquearia a repetição imediata do mesmo botão).
export function sortearAlvos(numeros, repeticoes, aleatoria, aleatorio = Math.random) {
  if (!aleatoria) return Array.from({ length: repeticoes }, () => numeros).flat();
  const falta = new Map(numeros.map((n) => [n, repeticoes]));
  const alvos = [];
  let total = numeros.length * repeticoes;
  while (total > 0) {
    const anterior = alvos.at(-1);
    // Só escolhe x se o restante (N itens, sem começar por x) ainda puder ficar sem repetições
    // seguidas: todo botão com no máximo ⌈N/2⌉ pendentes e o próprio x com no máximo ⌊N/2⌋.
    const resto = total - 1;
    const viavel = (x) => [...falta].every(([n, c]) => {
      const pendentes = n === x ? c - 1 : c;
      return pendentes <= (n === x ? Math.floor(resto / 2) : Math.ceil(resto / 2));
    });
    const candidatos = [...falta.keys()].filter((n) => falta.get(n) > 0 && n !== anterior && viavel(n));
    const escolhido = candidatos[Math.floor(aleatorio() * candidatos.length)];
    falta.set(escolhido, falta.get(escolhido) - 1);
    alvos.push(escolhido);
    total -= 1;
  }
  return alvos;
}

export function criarSessao({ avaliador, repeticoes, aleatoria, confirmarAudio, placa, dispositivo }) {
  const alvos = sortearAlvos(placa.botoes.map((b) => b.numero), repeticoes, aleatoria);
  const agora = new Date();
  return {
    id: agora.toISOString(),
    inicio: agora.toISOString(),
    fim: null,
    avaliador: avaliador || 'Sem nome',
    repeticoes,
    aleatoria,
    confirmarAudio,
    dispositivo,
    // Copia frase e bloco do momento do teste: mudanças posteriores na placa não alteram o histórico.
    tentativas: alvos.map((numero, indice) => {
      const b = placa.botoes.find((x) => x.numero === numero);
      return {
        indice: indice + 1,
        alvo: numero,
        assento: b.assento,
        bloco: BLOCOS[b.bloco].nome,
        frase: b.texto,
        apertado: null,
        assentoApertado: null,
        botaoCerto: null,
        audio: null,          // 'sim' | 'nao' | 'nao-tocou' | 'nao-confirmado' | 'pulada'
        respostaMs: null,     // aperto -> início do áudio (pino BUSY)
        reacaoMs: null,       // pedido na tela -> aperto
      };
    }),
  };
}

// ---- estatística

export const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);

export function mediana(v) {
  if (!v.length) return null;
  const o = [...v].sort((a, b) => a - b);
  const meio = Math.floor(o.length / 2);
  return o.length % 2 ? o[meio] : (o[meio - 1] + o[meio]) / 2;
}

// Desvio padrão amostral (n − 1), como em planilhas (DESVPAD).
export function desvioPadrao(v) {
  if (v.length < 2) return v.length ? 0 : null;
  const m = media(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1));
}

const fracao = (parte, total) => (total ? parte / total : null);

export function resumir(tentativas) {
  const feitas = tentativas.filter((t) => t.audio && t.audio !== 'pulada');
  const julgadas = feitas.filter((t) => ['sim', 'nao', 'nao-tocou'].includes(t.audio));
  const tempos = feitas.map((t) => t.respostaMs).filter((ms) => ms !== null);
  return {
    acionamentos: feitas.length,
    puladas: tentativas.filter((t) => t.audio === 'pulada').length,
    acertoAudio: fracao(julgadas.filter((t) => t.audio === 'sim').length, julgadas.length),
    audiosJulgados: julgadas.length,
    botaoCerto: fracao(feitas.filter((t) => t.botaoCerto).length, feitas.length),
    tempo: { n: tempos.length, media: media(tempos), mediana: mediana(tempos), dp: desvioPadrao(tempos) },
  };
}

// Mesmo formato da Tabela 1 do artigo: tempo médio e desvio padrão por bloco temático.
export function resumirPorBloco(tentativas) {
  // Ordem fixa dos blocos da placa (Saúde, Emoções, Escola, Social), depois nomes renomeados.
  const ordem = (nome) => {
    const i = BLOCOS.findIndex((b) => b.nome === nome);
    return i < 0 ? BLOCOS.length : i;
  };
  const blocos = [...new Set(tentativas.map((t) => t.bloco))].sort((a, b) => ordem(a) - ordem(b));
  return blocos.map((bloco) => ({ bloco, ...resumir(tentativas.filter((t) => t.bloco === bloco)) }));
}

// ---- exportação (planilha)

const ROTULO_AUDIO = {
  sim: 'sim', nao: 'não', 'nao-tocou': 'não tocou', 'nao-confirmado': 'não confirmado', pulada: 'pulada',
};

// CSV com ";" e vírgula decimal, que o Excel e o LibreOffice em português abrem direto.
export function gerarCsv(sessao) {
  const campo = (v) => {
    if (v === null || v === undefined) return '';
    const texto = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };
  const cabecalho = ['sessao', 'avaliador', 'tentativa', 'botao_pedido', 'posicao_pedida', 'bloco', 'frase',
    'botao_apertado', 'posicao_apertada', 'botao_certo', 'audio_correto', 'tempo_resposta_ms', 'tempo_reacao_ms'];
  const linhas = sessao.tentativas.map((t) => [
    sessao.id, sessao.avaliador, t.indice, t.alvo, t.assento, t.bloco, t.frase,
    t.apertado, t.assentoApertado, t.botaoCerto === null ? '' : (t.botaoCerto ? 'sim' : 'não'),
    ROTULO_AUDIO[t.audio] ?? '', t.respostaMs, t.reacaoMs,
  ].map(campo).join(';'));
  return `﻿${[cabecalho.join(';'), ...linhas].join('\r\n')}\r\n`;
}
