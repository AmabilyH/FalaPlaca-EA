// Conexão por Bluetooth Low Energy (Web Bluetooth). Dois tipos de placa:
// - Arduino + módulo BLE serial (HM-10, AT-09, HC-08: serviço FFE0). Recebe frases e
//   volume e avisa os botões apertados; os áudios continuam no cartão SD do DFPlayer.
// - FalaPlaca com ESP32 (futura), com serviço próprio, que guarda também os áudios, sem cartão.

import { crc32 } from './zip.js';
import { DispositivoTexto, TAXA_AUDIO_PLACA, esperar } from './protocolo.js';

export const UUID = {
  servico: 'f1a1a000-6c61-4e50-8d1a-46616c61506c',
  controle: 'f1a1a001-6c61-4e50-8d1a-46616c61506c',
  dados: 'f1a1a002-6c61-4e50-8d1a-46616c61506c',
  status: 'f1a1a003-6c61-4e50-8d1a-46616c61506c',
  // UART transparente dos módulos HM-10 e compatíveis
  serialServico: '0000ffe0-0000-1000-8000-00805f9b34fb',
  serialCaracteristica: '0000ffe1-0000-1000-8000-00805f9b34fb',
};
const TAMANHO_PACOTE = 180;
const TAMANHO_PACOTE_SERIAL = 20;          // limite de escrita dos módulos HM-10

export const bluetoothExiste = () => Boolean(navigator.bluetooth);

export async function bluetoothDisponivel() {
  if (!navigator.bluetooth) return false;
  try {
    return await navigator.bluetooth.getAvailability();
  } catch {
    return true;
  }
}

class DispositivoBluetooth extends DispositivoTexto {
  constructor(aparelho) {
    super();
    this.aparelho = aparelho;
    this.nome = aparelho.name || 'FalaPlaca';
    aparelho.addEventListener('gattserverdisconnected', () => this.desconectou());
  }

  async conectar() {
    const servidor = await this.aparelho.gatt.connect();
    const servico = await servidor.getPrimaryService(UUID.servico).catch(() => null);
    if (servico) {
      this.controle = await servico.getCharacteristic(UUID.controle);
      this.dados = await servico.getCharacteristic(UUID.dados);
      this.status = await servico.getCharacteristic(UUID.status);
      this.serial = false;
    } else {
      // Módulo BLE serial ligado ao Arduino: uma característica para enviar e receber.
      const uart = await servidor.getPrimaryService(UUID.serialServico).catch(() => {
        throw new Error('Este aparelho não é uma FalaPlaca: não tem o serviço Bluetooth esperado.');
      });
      this.controle = this.status = await uart.getCharacteristic(UUID.serialCaracteristica);
      this.serial = true;
    }
    await this.status.startNotifications();
    this.status.addEventListener('characteristicvaluechanged', (e) => {
      const texto = new TextDecoder().decode(e.target.value);
      // Na serial as respostas chegam em pedaços de até 20 bytes.
      if (this.serial) this.receberPedaco(texto);
      else this.receber(texto.trim());
    });
    await this.identificar().catch(() => {
      throw new Error('O módulo Bluetooth conectou, mas a placa não respondeu. Confira os fios TX/RX e se o firmware da FalaPlaca está gravado.');
    });
  }

  async escrever(texto) {
    if (!this.serial) return this.controle.writeValueWithResponse(new TextEncoder().encode(texto));
    const bytes = new TextEncoder().encode(`${texto}\n`);
    const semResposta = this.controle.properties.writeWithoutResponse;
    for (let i = 0; i < bytes.length; i += TAMANHO_PACOTE_SERIAL) {
      const pedaco = bytes.subarray(i, i + TAMANHO_PACOTE_SERIAL);
      if (semResposta) {
        await this.controle.writeValueWithoutResponse(pedaco);
        await esperar(15);                 // dá tempo de o módulo repassar a 9600 baud
      } else {
        await this.controle.writeValueWithResponse(pedaco);
      }
    }
  }

  async enviarAudio(numero, pcm, aoProgresso) {
    await this.comando(`AUD ${numero} ${pcm.length} ${TAXA_AUDIO_PLACA}`);
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
  const aparelho = await navigator.bluetooth.requestDevice({
    filters: [
      { services: [UUID.servico] },
      { services: [UUID.serialServico] },  // módulos HM-10 e compatíveis
      { namePrefix: 'FalaPlaca' },
      // nomes de fábrica, para módulos que não anunciam o serviço FFE0
      { namePrefix: 'HMSoft' },
      { namePrefix: 'BT05' },
      { namePrefix: 'HC-08' },
      { namePrefix: 'JDY' },
    ],
    optionalServices: [UUID.servico, UUID.serialServico],
  });
  const dispositivo = new DispositivoBluetooth(aparelho);
  await dispositivo.conectar();
  return dispositivo;
}

// Aparelhos já autorizados antes (só em navegadores com navigator.bluetooth.getDevices).
export async function reconectarBluetooth() {
  if (!navigator.bluetooth?.getDevices) return null;
  for (const aparelho of await navigator.bluetooth.getDevices()) {
    const dispositivo = new DispositivoBluetooth(aparelho);
    try {
      await Promise.race([
        dispositivo.conectar(),
        esperar(5000).then(() => { throw new Error('fora de alcance'); }),
      ]);
      return dispositivo;
    } catch {
      aparelho.gatt?.disconnect();
    }
  }
  return null;
}
