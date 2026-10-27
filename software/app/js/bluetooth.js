// Cadastro da placa por Bluetooth Low Energy (Web Bluetooth).
// O protocolo está documentado em software/README.md. Ele pressupõe a versão da FalaPlaca
// com ESP32, que guarda os áudios na memória flash interna, sem cartão.

import { crc32 } from './zip.js';
import { paraPcm8 } from './audio.js';

export const UUID = {
  servico: 'f1a1a000-6c61-4e50-8d1a-46616c61506c',
  controle: 'f1a1a001-6c61-4e50-8d1a-46616c61506c',
  dados: 'f1a1a002-6c61-4e50-8d1a-46616c61506c',
  status: 'f1a1a003-6c61-4e50-8d1a-46616c61506c',
};
export const TAXA_BLUETOOTH = 8000;
const TAMANHO_PACOTE = 180;

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export async function bluetoothDisponivel() {
  if (!navigator.bluetooth) return false;
  try {
    return await navigator.bluetooth.getAvailability();
  } catch {
    return true;
  }
}

class Dispositivo {
  ouvintesDesconexao = [];
  ouvintesBotao = [];

  aoDesconectar(callback) { this.ouvintesDesconexao.push(callback); }
  aoAcionarBotao(callback) { this.ouvintesBotao.push(callback); }
  definirVolume(volume) { return this.comando(`VOL ${volume}`); }
  tocar(numero) { return this.comando(`PLAY ${numero}`); }

  // aoProgresso(numero, etapa, fracao): etapa = 'enviando' | 'ok' | 'sem-audio'
  async enviar(placa, audios, aoProgresso) {
    await this.comando(`VOL ${placa.volume}`);
    for (const botao of placa.botoes) {
      aoProgresso(botao.numero, 'enviando', 0);
      await this.comando(`TXT ${botao.numero} ${botao.texto}`);
      const blob = botao.audio && audios.get(botao.numero);
      if (!blob) {
        await this.comando(`DEL ${botao.numero}`);
        aoProgresso(botao.numero, 'sem-audio', 1);
        continue;
      }
      const pcm = await paraPcm8(blob, TAXA_BLUETOOTH);
      await this.enviarAudio(botao.numero, pcm, (f) => aoProgresso(botao.numero, 'enviando', f));
      aoProgresso(botao.numero, 'ok', 1);
    }
    await this.comando('SALVAR', 'OK', 15000);
  }
}

class DispositivoBluetooth extends Dispositivo {
  simulado = false;
  esperas = [];

  constructor(aparelho) {
    super();
    this.aparelho = aparelho;
    this.nome = aparelho.name || 'FalaPlaca';
    aparelho.addEventListener('gattserverdisconnected', () => {
      this.ouvintesDesconexao.forEach((cb) => cb());
    });
  }

  async conectar() {
    const servidor = await this.aparelho.gatt.connect();
    const servico = await servidor.getPrimaryService(UUID.servico);
    this.controle = await servico.getCharacteristic(UUID.controle);
    this.dados = await servico.getCharacteristic(UUID.dados);
    this.status = await servico.getCharacteristic(UUID.status);
    await this.status.startNotifications();
    this.status.addEventListener('characteristicvaluechanged', (e) => {
      this.receber(new TextDecoder().decode(e.target.value).trim());
    });
    const resposta = await this.comando('HELLO', 'FALAPLACA');
    this.info = Object.fromEntries(
      resposta.split(' ').filter((p) => p.includes('=')).map((p) => p.split('=')),
    );
  }

  receber(mensagem) {
    if (mensagem.startsWith('BTN ')) {
      const numero = Number(mensagem.slice(4));
      this.ouvintesBotao.forEach((cb) => cb(numero));
      return;
    }
    const erro = mensagem.startsWith('ERR');
    const i = this.esperas.findIndex((e) => erro || mensagem.startsWith(e.prefixo));
    if (i < 0) return;
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
    await this.controle.writeValueWithResponse(new TextEncoder().encode(texto));
    return resposta;
  }

  async enviarAudio(numero, pcm, aoProgresso) {
    await this.comando(`AUD ${numero} ${pcm.length} ${TAXA_BLUETOOTH}`);
    for (let i = 0; i < pcm.length; i += TAMANHO_PACOTE) {
      await this.dados.writeValueWithResponse(pcm.subarray(i, i + TAMANHO_PACOTE));
      aoProgresso(Math.min(1, (i + TAMANHO_PACOTE) / pcm.length));
    }
    const crc = crc32(pcm).toString(16).padStart(8, '0');
    await this.comando(`FIM ${numero} ${crc}`, 'OK', 15000);
  }

  desconectar() {
    this.aparelho.gatt.disconnect();
  }
}

export async function conectarBluetooth() {
  if (!navigator.bluetooth) {
    throw new Error('Este navegador não tem Bluetooth. Use Chrome ou Edge no Android ou no computador, ou o modo demonstração.');
  }
  const aparelho = await navigator.bluetooth.requestDevice({
    filters: [{ services: [UUID.servico] }, { namePrefix: 'FalaPlaca' }],
    optionalServices: [UUID.servico],
  });
  const dispositivo = new DispositivoBluetooth(aparelho);
  await dispositivo.conectar();
  return dispositivo;
}

// Placa virtual: permite testar todo o fluxo sem hardware.
export class DispositivoSimulado extends Dispositivo {
  simulado = true;
  nome = 'FalaPlaca demonstração';
  info = { botoes: '10', livre: '1200000' };

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
