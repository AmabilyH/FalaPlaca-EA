// Exportação para o cartão MicroSD do DFPlayer: /01/001.wav ... /01/010.wav + falaplaca.json.

import { criarZip } from './zip.js';
import { BLOCOS, corDoBotao, formaDoBotao, nomeArquivo } from './layout.js';

export const podeGravarDireto = () => 'showDirectoryPicker' in window;

export function arquivosDoCartao(placa, audios) {
  return placa.botoes.map((botao) => {
    const blob = botao.audio ? audios.get(botao.numero) : null;
    return { botao, blob, caminho: blob ? `01/${nomeArquivo(botao.numero)}` : null };
  });
}

function manifesto(placa) {
  return JSON.stringify({
    app: 'FalaPlaca',
    versao: placa.versao,
    geradoEm: new Date().toISOString(),
    volume: placa.volume,
    botoes: placa.botoes.map((b) => ({
      numero: b.numero,
      assento: b.assento,
      bloco: BLOCOS[b.bloco].nome,
      cor: corDoBotao(b).nome,
      forma: formaDoBotao(b).nome,
      texto: b.texto,
      icone: b.icone,
      arquivo: b.audio ? `01/${nomeArquivo(b.numero)}` : null,
    })),
  }, null, 2);
}

const LEIA_ME = `FalaPlaca - conteúdo do cartão MicroSD

1. Copie a pasta "01" e o arquivo "falaplaca.json" para a RAIZ do cartão (FAT32).
2. Cada arquivo da pasta 01 corresponde a um botão: 001.wav = botão 1, 002.wav = botão 2...
3. Apague da pasta 01 versões antigas com o mesmo número (ex.: 001.mp3), se houver.
4. Coloque o cartão no DFPlayer e ligue a FalaPlaca.
`;

export async function gravarNoCartao(placa, audios, aoProgresso) {
  const escolhida = await window.showDirectoryPicker({ id: 'falaplaca-cartao', mode: 'readwrite' });
  // Alguns navegadores não deixam escolher a raiz de uma unidade: aceita escolher a própria pasta 01.
  const pasta = escolhida.name === '01'
    ? escolhida
    : await escolhida.getDirectoryHandle('01', { create: true });

  const lista = arquivosDoCartao(placa, audios);
  const novos = new Set(lista.filter((a) => a.caminho).map((a) => a.caminho.slice(3)));
  const numeros = new Set(placa.botoes.map((b) => nomeArquivo(b.numero).slice(0, 3)));

  // O DFPlayer escolhe o arquivo pelo número; versões antigas (ex.: 001.mp3) gerariam ambiguidade.
  for await (const [nome, item] of pasta.entries()) {
    if (item.kind === 'file' && numeros.has(nome.slice(0, 3)) && !novos.has(nome)) {
      await pasta.removeEntry(nome);
    }
  }

  for (const [i, arquivo] of lista.entries()) {
    if (arquivo.blob) {
      const destino = await pasta.getFileHandle(arquivo.caminho.slice(3), { create: true });
      const escrita = await destino.createWritable();
      await escrita.write(arquivo.blob);
      await escrita.close();
    }
    aoProgresso?.(arquivo.botao.numero, (i + 1) / lista.length);
  }

  const raiz = pasta === escolhida ? pasta : escolhida;
  const json = await raiz.getFileHandle('falaplaca.json', { create: true });
  const escrita = await json.createWritable();
  await escrita.write(manifesto(placa));
  await escrita.close();

  return escolhida.name;
}

export async function baixarZip(placa, audios) {
  const codificador = new TextEncoder();
  const arquivos = [];
  for (const arquivo of arquivosDoCartao(placa, audios)) {
    if (arquivo.blob) {
      arquivos.push({ nome: arquivo.caminho, dados: new Uint8Array(await arquivo.blob.arrayBuffer()) });
    }
  }
  arquivos.push({ nome: 'falaplaca.json', dados: codificador.encode(manifesto(placa)) });
  arquivos.push({ nome: 'LEIA-ME.txt', dados: codificador.encode(LEIA_ME) });

  const url = URL.createObjectURL(criarZip(arquivos));
  const link = Object.assign(document.createElement('a'), { href: url, download: 'falaplaca-cartao-sd.zip' });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
