// Um único "Procurar FalaPlaca" para todas as formas de ligar a placa.
// 1. Placas já autorizadas reconectam sozinhas, sem janela de escolha.
// 2. Na primeira vez, cada toque abre a janela de uma forma de conexão, na ordem abaixo:
//    o navegador mostra Bluetooth BLE e porta serial (HC-05, cabo USB) em janelas separadas.

import { bluetoothExiste, conectarBluetooth, reconectarBluetooth } from './bluetooth.js';
import { serialExiste, conectarSerial, reconectarSerial } from './serial.js';

const FORMAS = [
  { id: 'bluetooth', existe: bluetoothExiste, conectar: conectarBluetooth },
  { id: 'serial', existe: serialExiste, conectar: conectarSerial },
];

export const formasDisponiveis = () => FORMAS.filter((f) => f.existe()).map((f) => f.id);

export async function reconectarConhecida() {
  return (await reconectarSerial().catch(() => null))
    ?? (await reconectarBluetooth().catch(() => null));
}

// tentativa: quantas buscas a pessoa já cancelou; alterna entre as formas disponíveis.
export function procurarFalaPlaca(tentativa = 0) {
  const formas = FORMAS.filter((f) => f.existe());
  if (!formas.length) {
    throw new Error('Este navegador não consegue se conectar à placa. Use o Chrome ou o Edge no computador ou no Android.');
  }
  return formas[tentativa % formas.length].conectar();
}
