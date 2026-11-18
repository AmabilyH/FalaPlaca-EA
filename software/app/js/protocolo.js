// Protocolo comum a todas as conexões com a placa (Bluetooth BLE, HC-05, cabo USB):
// comandos de texto, uma linha por comando, descritos em software/README.md.

import { paraPcm8 } from './audio.js';

export const TAXA_AUDIO_PLACA = 8000;
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export class Dispositivo {
  ouvintesDesconexao = [];
  ouvintesBotao = [];

  aoDesconectar(callback) { this.ouvintesDesconexao.push(callback); }
  aoAcionarBotao(callback) { this.ouvintesBotao.push(callback); }
  definirVolume(volume) { return this.comando(`VOL ${volume}`); }
  tocar(numero) { return this.comando(`PLAY ${numero}`); }

  // Placa com DFPlayer: os áudios só podem ir pelo cartão SD.
  get audioPeloCartao() { return this.info?.audio === 'sd'; }

  // aoProgresso(numero, etapa, fracao): etapa = 'enviando' | 'ok' | 'sem-audio' | 'cartao'
  async enviar(placa, audios, aoProgresso) {
    await this.comando(`VOL ${placa.volume}`);
    for (const botao of placa.botoes) {
      aoProgresso(botao.numero, 'enviando', 0);
      await this.comando(`TXT ${botao.numero} ${botao.texto}`);
      if (this.audioPeloCartao) {
        aoProgresso(botao.numero, 'cartao', 1);
        continue;
      }
      const blob = botao.audio && audios.get(botao.numero);
      if (!blob) {
        await this.comando(`DEL ${botao.numero}`);
        aoProgresso(botao.numero, 'sem-audio', 1);
        continue;
      }
      const pcm = await paraPcm8(blob, TAXA_AUDIO_PLACA);
      await this.enviarAudio(botao.numero, pcm, (f) => aoProgresso(botao.numero, 'enviando', f));
      aoProgresso(botao.numero, 'ok', 1);
    }
    await this.comando('SALVAR', 'OK', 15000);
  }
}

// Placa real: casa as respostas com os comandos enviados. Cada subclasse implementa escrever().
export class DispositivoTexto extends Dispositivo {
  simulado = false;
  esperas = [];
  recebido = '';

  // Para conexões em fluxo (serial, módulo BLE): junta pedaços e separa por linha.
  receberPedaco(texto) {
    this.recebido += texto;
    const linhas = this.recebido.split(/\r?\n/);
    this.recebido = linhas.pop();
    linhas.map((l) => l.trim()).filter(Boolean).forEach((l) => this.receber(l));
  }

  receber(mensagem) {
    if (mensagem.startsWith('BTN ')) {
      const numero = Number(mensagem.slice(4));
      this.ouvintesBotao.forEach((cb) => cb(numero));
      return;
    }
    const erro = mensagem.startsWith('ERR');
    const i = this.esperas.findIndex((e) => erro || mensagem.startsWith(e.prefixo));
    if (i < 0) return;   // linhas de diagnóstico da placa (ex.: "Tocando botao 3")
    const [espera] = this.esperas.splice(i, 1);
    if (erro) espera.rejeitar(new Error(`A placa recusou o comando: ${mensagem.slice(4)}`));
    else espera.resolver(mensagem);
  }

  aguardar(prefixo, ms) {
    return new Promise((resolver, rejeitar) => {
      const espera = { prefixo, resolver, rejeitar };
      this.esperas.push(espera);
      setTimeout(() => {
        const i = this.esperas.indexOf(espera);
        if (i >= 0) {
          this.esperas.splice(i, 1);
          rejeitar(new Error('A placa não respondeu a tempo.'));
        }
      }, ms);
    });
  }

  async comando(texto, prefixoResposta = 'OK', ms = 5000) {
    const resposta = this.aguardar(prefixoResposta, ms);
    await this.escrever(texto);
    return resposta;
  }

  // repetirACada: reenvia o HELLO enquanto a placa ainda está iniciando (ex.: reinício pelo USB).
  async identificar(ms = 6000, repetirACada = ms) {
    const limite = Date.now() + ms;
    for (;;) {
      try {
        const espera = Math.max(100, Math.min(repetirACada, limite - Date.now()));
        const resposta = await this.comando('HELLO', 'FALAPLACA', espera);
        this.info = Object.fromEntries(
          resposta.split(' ').filter((p) => p.includes('=')).map((p) => p.split('=')),
        );
        return;
      } catch (err) {
        if (Date.now() >= limite || err.message.startsWith('A placa recusou')) throw err;
      }
    }
  }

  desconectou() {
    this.ouvintesDesconexao.forEach((cb) => cb());
  }
}

// Placa virtual: permite testar todo o fluxo sem hardware.
// tipo 'mega' imita o Arduino com DFPlayer (áudios pelo cartão SD); 'esp32', a placa futura.
export class DispositivoSimulado extends Dispositivo {
  simulado = true;

  constructor(tipo = 'mega') {
    super();
    this.nome = 'FalaPlaca demonstração';
    this.info = tipo === 'mega'
      ? { placa: 'mega', audio: 'sd', botoes: '10' }
      : { botoes: '10', livre: '1200000' };
  }

  async conectar() {
    await esperar(700);
  }

  async comando(texto) {
    await esperar(60);
    if (texto.startsWith('PLAY ')) {
      const numero = Number(texto.slice(5));
      this.ouvintesBotao.forEach((cb) => cb(numero));
    }
    return 'OK';
  }

  async enviarAudio(numero, pcm, aoProgresso) {
    const passos = Math.max(4, Math.ceil(pcm.length / 4000));
    for (let i = 1; i <= passos; i++) {
      await esperar(90);
      aoProgresso(i / passos);
    }
  }

  desconectar() {
    this.ouvintesDesconexao.forEach((cb) => cb());
  }
}
