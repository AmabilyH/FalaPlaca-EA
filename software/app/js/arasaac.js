// Pictogramas ARASAAC (https://arasaac.org): acervo de símbolos de referência em CAA.
// Licença CC BY-NC-SA 4.0: uso educacional gratuito, com crédito obrigatório (ver CREDITO_ARASAAC).
// A busca precisa de internet; cada pictograma escolhido é baixado uma vez e guardado no aparelho.

const API = 'https://api.arasaac.org/v1/pictograms';
const IMAGENS = 'https://static.arasaac.org/pictograms';

export const CREDITO_ARASAAC =
  'Pictogramas: Sergio Palao, propriedade do Governo de Aragão (Espanha), distribuídos pela ARASAAC (arasaac.org) sob licença CC BY-NC-SA.';

export const urlPictograma = (id, tamanho = 300) => `${IMAGENS}/${id}/${id}_${tamanho}.png`;

// Palavras sem significado próprio para a busca ("Preciso de água" -> "água").
const VAZIAS = new Set(['eu', 'estou', 'esta', 'está', 'com', 'de', 'do', 'da', 'ao', 'a', 'o', 'os', 'as',
  'um', 'uma', 'preciso', 'quero', 'ir', 'para', 'pra', 'me', 'meu', 'minha', 'e', 'é', 'no', 'na']);

// Termos a tentar, em ordem: só as palavras importantes ("água"), a frase inteira
// e cada palavra importante sozinha, da última para a primeira.
export function termosDaFrase(frase) {
  const limpa = frase.toLowerCase().replace(/[.!?,;:()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!limpa) return [];
  const palavras = limpa.split(' ').filter((p) => !VAZIAS.has(p) && p.length > 1);
  return [...new Set([palavras.join(' '), limpa, ...palavras.reverse()].filter(Boolean))];
}

async function buscarTermo(termo) {
  // Português do Brasil primeiro; o acervo em português de Portugal complementa.
  for (const idioma of ['br', 'pt']) {
    const resposta = await fetch(`${API}/${idioma}/search/${encodeURIComponent(termo)}`);
    if (resposta.ok) {
      const lista = await resposta.json();
      if (lista.length) return lista;
    } else if (resposta.status !== 404) {
      throw new Error(`A ARASAAC respondeu com erro (${resposta.status}).`);
    }
  }
  return [];
}

// Devolve até `limite` pictogramas: [{ id, nome }], e o termo que encontrou resultados.
export async function buscarPictogramas(termos, limite = 24) {
  if (!navigator.onLine) throw new Error('Sem internet: a busca de pictogramas precisa de conexão.');
  for (const termo of [].concat(termos)) {
    const lista = await buscarTermo(termo);
    if (lista.length) {
      return {
        termo,
        resultados: lista.slice(0, limite).map((p) => ({
          id: p._id,
          nome: p.keywords?.[0]?.keyword ?? termo,
        })),
      };
    }
  }
  return { termo: [].concat(termos)[0] ?? '', resultados: [] };
}

export async function baixarPictograma(id) {
  const resposta = await fetch(urlPictograma(id));
  if (!resposta.ok) throw new Error('Não foi possível baixar o pictograma.');
  return resposta.blob();
}
