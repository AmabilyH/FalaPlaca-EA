// Gravação e preparo dos áudios.
// Todo áudio (gravado ou enviado) vira WAV mono 16 bits / 22.050 Hz, formato que o
// DFPlayer Mini toca. O silêncio do começo é cortado para a placa responder mais rápido.

export const TAXA_CARTAO = 22050;
export const DURACAO_MAXIMA_S = 10;
export const GRAVACAO_MAXIMA_S = 8;

let contexto;
export function contextoAudio() {
  contexto ??= new (window.AudioContext || window.webkitAudioContext)();
  return contexto;
}

async function decodificar(blob) {
  const dados = await blob.arrayBuffer();
  return contextoAudio().decodeAudioData(dados);
}

function mono(buffer) {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0).slice();
  const saida = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const canal = buffer.getChannelData(c);
    for (let i = 0; i < saida.length; i++) saida[i] += canal[i] / buffer.numberOfChannels;
  }
  return saida;
}

// Reamostragem por média de janela: filtro passa-baixa simples, suficiente para voz.
export function reamostrar(dados, de, para) {
  if (de === para) return dados;
  const razao = de / para;
  const total = Math.floor(dados.length / razao);
  const saida = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const inicio = Math.floor(i * razao);
    const fim = Math.min(dados.length, Math.max(inicio + 1, Math.floor((i + 1) * razao)));
    let soma = 0;
    for (let j = inicio; j < fim; j++) soma += dados[j];
    saida[i] = soma / (fim - inicio);
  }
  return saida;
}

async function paraTaxa(buffer, taxa) {
  try {
    const offline = new OfflineAudioContext(1, Math.ceil(buffer.duration * taxa), taxa);
    const fonte = offline.createBufferSource();
    fonte.buffer = buffer;
    fonte.connect(offline.destination);
    fonte.start();
    return (await offline.startRendering()).getChannelData(0);
  } catch {
    return reamostrar(mono(buffer), buffer.sampleRate, taxa);
  }
}

export function aparar(dados, taxa) {
  let pico = 0;
  for (const v of dados) pico = Math.max(pico, Math.abs(v));
  if (pico < 0.01) return new Float32Array(0);

  const limiar = Math.max(0.015, pico * 0.06);
  let inicio = 0;
  while (inicio < dados.length && Math.abs(dados[inicio]) < limiar) inicio++;
  let fim = dados.length - 1;
  while (fim > inicio && Math.abs(dados[fim]) < limiar) fim--;

  inicio = Math.max(0, inicio - Math.round(taxa * 0.04));
  fim = Math.min(dados.length, fim + Math.round(taxa * 0.2));
  const saida = dados.slice(inicio, fim);

  const rampa = Math.min(Math.round(taxa * 0.01), saida.length >> 1);
  for (let i = 0; i < rampa; i++) {
    saida[i] *= i / rampa;
    saida[saida.length - 1 - i] *= i / rampa;
  }
  return saida;
}

export function normalizar(dados) {
  let pico = 0;
  for (const v of dados) pico = Math.max(pico, Math.abs(v));
  const ganho = pico > 0 ? Math.min(6, 0.9 / pico) : 1;
  for (let i = 0; i < dados.length; i++) dados[i] *= ganho;
  return dados;
}

export function picos(dados, quantidade = 48) {
  const tamanho = Math.max(1, Math.floor(dados.length / quantidade));
  const saida = [];
  for (let i = 0; i < quantidade; i++) {
    let max = 0;
    for (let j = i * tamanho; j < Math.min(dados.length, (i + 1) * tamanho); j++) {
      max = Math.max(max, Math.abs(dados[j]));
    }
    saida.push(Math.round(max * 100) / 100);
  }
  return saida;
}

export function codificarWav(amostras, taxa) {
  const buffer = new ArrayBuffer(44 + amostras.length * 2);
  const v = new DataView(buffer);
  const texto = (pos, s) => [...s].forEach((c, i) => v.setUint8(pos + i, c.charCodeAt(0)));
  texto(0, 'RIFF');
  v.setUint32(4, 36 + amostras.length * 2, true);
  texto(8, 'WAVE');
  texto(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);            // PCM
  v.setUint16(22, 1, true);            // mono
  v.setUint32(24, taxa, true);
  v.setUint32(28, taxa * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  texto(36, 'data');
  v.setUint32(40, amostras.length * 2, true);
  for (let i = 0; i < amostras.length; i++) {
    const s = Math.max(-1, Math.min(1, amostras[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function prepararAudio(blob) {
  let buffer;
  try {
    buffer = await decodificar(blob);
  } catch {
    throw new Error('Não foi possível ler este arquivo de áudio.');
  }
  const amostras = normalizar(aparar(await paraTaxa(buffer, TAXA_CARTAO), TAXA_CARTAO));
  const duracao = amostras.length / TAXA_CARTAO;
  if (duracao < 0.2) throw new Error('Não ouvimos nada. Fale mais perto do microfone e tente de novo.');
  if (duracao > DURACAO_MAXIMA_S) {
    throw new Error(`Áudio longo demais (${duracao.toFixed(0)} s). Use frases de até ${DURACAO_MAXIMA_S} s.`);
  }
  return { wav: codificarWav(amostras, TAXA_CARTAO), duracao, picos: picos(amostras) };
}

// PCM 8 bits sem sinal: formato enviado por Bluetooth para caber na memória da placa.
export async function paraPcm8(blob, taxa) {
  const buffer = await decodificar(blob);
  const dados = reamostrar(mono(buffer), buffer.sampleRate, taxa);
  const saida = new Uint8Array(dados.length);
  for (let i = 0; i < dados.length; i++) {
    saida[i] = Math.round(Math.max(-1, Math.min(1, dados[i])) * 127 + 128);
  }
  return saida;
}

export class Gravador {
  async iniciar() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Este navegador não permite gravar. Abra o app por HTTPS ou use “Enviar arquivo”.');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
      .find((t) => window.MediaRecorder?.isTypeSupported?.(t));
    this.gravador = new MediaRecorder(this.stream, tipo ? { mimeType: tipo } : undefined);
    this.partes = [];
    this.gravador.ondataavailable = (e) => e.data.size && this.partes.push(e.data);

    const ctx = contextoAudio();
    await ctx.resume();
    this.analisador = ctx.createAnalyser();
    this.analisador.fftSize = 512;
    this.fonte = ctx.createMediaStreamSource(this.stream);
    this.fonte.connect(this.analisador);
    this.amostras = new Float32Array(this.analisador.fftSize);

    this.gravador.start();
  }

  nivel() {
    this.analisador.getFloatTimeDomainData(this.amostras);
    let soma = 0;
    for (const v of this.amostras) soma += v * v;
    return Math.min(1, Math.sqrt(soma / this.amostras.length) * 4);
  }

  parar() {
    return new Promise((resolver) => {
      this.gravador.onstop = () => {
        this.fonte.disconnect();
        this.stream.getTracks().forEach((t) => t.stop());
        resolver(new Blob(this.partes, { type: this.gravador.mimeType }));
      };
      this.gravador.stop();
    });
  }
}
