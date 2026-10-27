// Gerador de ZIP sem compressão (método "store"), suficiente para WAV e sem dependências.

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    data: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// arquivos: [{ nome: '01/001.wav', dados: Uint8Array }]
export function criarZip(arquivos) {
  const codificador = new TextEncoder();
  const { hora, data } = dataDos(new Date());
  const locais = [];
  const centrais = [];
  let deslocamento = 0;
  let tamanhoCentral = 0;

  for (const arquivo of arquivos) {
    const nome = codificador.encode(arquivo.nome);
    const tamanho = arquivo.dados.length;
    const crc = crc32(arquivo.dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);   // nomes em UTF-8
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, tamanho, true);
    local.setUint32(22, tamanho, true);
    local.setUint16(26, nome.length, true);
    locais.push(local, nome, arquivo.dados);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, data, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, tamanho, true);
    central.setUint32(24, tamanho, true);
    central.setUint16(28, nome.length, true);
    central.setUint32(42, deslocamento, true);
    centrais.push(central, nome);

    deslocamento += 30 + nome.length + tamanho;
    tamanhoCentral += 46 + nome.length;
  }

  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, deslocamento, true);

  return new Blob([...locais, ...centrais, fim], { type: 'application/zip' });
}
