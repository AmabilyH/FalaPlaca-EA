// Conexão por porta serial (Web Serial): módulo Bluetooth clássico HC-05/HC-06 pareado no
// computador (aparece como porta COM) ou cabo USB direto no Arduino. Mesmo protocolo de linhas.

import { DispositivoTexto, esperar } from './protocolo.js';

const PERFIL_SERIAL_BLUETOOTH = '00001101-0000-1000-8000-00805f9b34fb';  // SPP do HC-05

export const serialExiste = () => Boolean(navigator.serial);

class DispositivoSerial extends DispositivoTexto {
  constructor(porta) {
    super();
    this.porta = porta;
    const info = porta.getInfo?.() ?? {};
    this.usb = Boolean(info.usbVendorId);
    this.nome = this.usb ? 'FalaPlaca (cabo USB)' : 'FalaPlaca (Bluetooth HC-05)';
  }

  async conectar() {
    await this.porta.open({ baudRate: 9600 });
    this.escritor = this.porta.writable.getWriter();
    this.ler();
    // Pelo cabo USB, abrir a porta reinicia o Arduino e o primeiro HELLO se perde:
    // repete a cada segundo enquanto a placa inicia.
    try {
      await this.identificar(this.usb ? 9000 : 4000, 1000);
    } catch (err) {
      await this.fechar();
      throw err;
    }
  }

  async ler() {
    const decodificador = new TextDecoder();
    while (this.porta.readable) {
      this.leitor = this.porta.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.leitor.read();
          if (done) break;
          this.receberPedaco(decodificador.decode(value, { stream: true }));
        }
      } catch {
        break;                              // cabo removido ou Bluetooth fora de alcance
      } finally {
        this.leitor.releaseLock();
      }
      if (this.fechando) break;
    }
    if (!this.fechando) this.desconectou();
  }

  escrever(texto) {
    return this.escritor.write(new TextEncoder().encode(`${texto}\n`));
  }

  async fechar() {
    this.fechando = true;
    await this.leitor?.cancel().catch(() => {});
    this.escritor?.releaseLock();
    await this.porta.close().catch(() => {});
  }

  async desconectar() {
    await this.fechar();
    this.desconectou();
  }
}

export async function conectarSerial() {
  const porta = await navigator.serial.requestPort({
    // Chrome 117+ também lista dispositivos Bluetooth seriais sem parear no sistema.
    allowedBluetoothServiceClassIds: [PERFIL_SERIAL_BLUETOOTH],
  });
  const dispositivo = new DispositivoSerial(porta);
  await dispositivo.conectar().catch((err) => {
    throw new Error(`Essa porta não respondeu como FalaPlaca. ${err.message}`);
  });
  return dispositivo;
}

// Portas já autorizadas antes: tenta cada uma e fica com a que responder como FalaPlaca.
export async function reconectarSerial() {
  if (!navigator.serial) return null;
  for (const porta of await navigator.serial.getPorts()) {
    const dispositivo = new DispositivoSerial(porta);
    try {
      await dispositivo.conectar();
      return dispositivo;
    } catch {
      await esperar(100);                   // porta ocupada ou outro aparelho: tenta a próxima
    }
  }
  return null;
}
