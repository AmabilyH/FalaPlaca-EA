// Persistência local (IndexedDB): configuração da placa e áudios de cada botão.

const BANCO = 'falaplaca';
const VERSAO = 1;
let conexao;

function abrir() {
  conexao ??= new Promise((resolver, rejeitar) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('config');
      req.result.createObjectStore('audios');
    };
    req.onsuccess = () => resolver(req.result);
    req.onerror = () => rejeitar(req.error);
  });
  return conexao;
}

async function operar(loja, modo, acao) {
  const db = await abrir();
  return new Promise((resolver, rejeitar) => {
    const tx = db.transaction(loja, modo);
    const req = acao(tx.objectStore(loja));
    tx.oncomplete = () => resolver(req?.result);
    tx.onerror = () => rejeitar(tx.error);
  });
}

export const carregarPlaca = () => operar('config', 'readonly', (s) => s.get('placa'));
export const salvarPlaca = (placa) => operar('config', 'readwrite', (s) => s.put(placa, 'placa'));
export const carregarAudio = (numero) => operar('audios', 'readonly', (s) => s.get(numero));
export const salvarAudio = (numero, blob) => operar('audios', 'readwrite', (s) => s.put(blob, numero));
export const removerAudio = (numero) => operar('audios', 'readwrite', (s) => s.delete(numero));
