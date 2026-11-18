// Persistência local (IndexedDB): configuração da placa, áudios de cada botão,
// pictogramas ARASAAC baixados (para uso offline) e sessões do modo de teste.

const BANCO = 'falaplaca';
const VERSAO = 2;
const LOJAS = ['config', 'audios', 'pictogramas', 'testes'];
let conexao;

function abrir() {
  conexao ??= new Promise((resolver, rejeitar) => {
    const req = indexedDB.open(BANCO, VERSAO);
    req.onupgradeneeded = () => {
      for (const loja of LOJAS) {
        if (!req.result.objectStoreNames.contains(loja)) req.result.createObjectStore(loja);
      }
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
export const carregarPictograma = (id) => operar('pictogramas', 'readonly', (s) => s.get(id));
export const salvarPictograma = (id, blob) => operar('pictogramas', 'readwrite', (s) => s.put(blob, id));
export const salvarTeste = (sessao) => operar('testes', 'readwrite', (s) => s.put(sessao, sessao.id));
export const listarTestes = () => operar('testes', 'readonly', (s) => s.getAll());
export const removerTeste = (id) => operar('testes', 'readwrite', (s) => s.delete(id));
