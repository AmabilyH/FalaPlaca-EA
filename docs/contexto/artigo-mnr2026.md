# Dados técnicos do artigo MNR 2026

Resumo técnico do artigo *"FalaPlaca – Prancheta de Comunicação Aumentativa com Síntese de Voz para Estudantes Não-Verbais em Escolas Públicas"* (categoria Artigo Médio, Técnico e Superior). Este documento registra o que o artigo **propõe ou projeta**; o comportamento implementado está nos sketches em `firmware/arduino/` e as divergências entre os dois estão em [README.md](README.md#divergências-entre-o-artigo-e-o-firmware).

## Equipe

| Pessoa | Papel | Instituição |
| :-- | :-- | :-- |
| Alice Alves Pimentel | Estudante desenvolvedora | IFPE – Palmares |
| Amabily Heloisa da Silva | Estudante desenvolvedora | IFPE – Palmares |
| Hélio Fernando Bentzen Pessoa Filho | Professor orientador | IFPE – Palmares |
| Valentina Nascimento e Melo de Oliveira | Professora orientadora | IFPE – Ipojuca |

Construção prevista no laboratório IFMaker, em 7 a 12 dias, organizada em três frentes paralelas: eletrônica, programação e estrutura física.

## Problema e proposta

- Público-alvo: estudantes não-verbais (TEA, paralisia cerebral, afasia) em salas de AEE de escolas públicas.
- Lacuna: dispositivos comerciais de CAA (ex.: Tobii Eye Tracker) passam de R$ 15.000; soluções digitais exigem tablet/smartphone e conectividade.
- Proposta: prancheta física de CAA com botões táteis que reproduzem frases pré-gravadas.
- Requisitos que diferenciam o projeto:
  - operação 100% offline, sem tela e sem internet;
  - baixo custo;
  - personalização pelo professor **sem reprogramar** o Arduino (troca dos MP3 no cartão);
  - robustez física para uso intensivo;
  - confirmação visual por LED.

## Arquitetura de hardware

| Componente | Especificação no artigo |
| :-- | :-- |
| Microcontrolador | Arduino UNO |
| Entrada | 12 botões físicos de 25 mm, grade 3×4 |
| Áudio | Módulo DFPlayer Mini lendo MP3 de cartão MicroSD 2 GB |
| Saída sonora | Alto-falante 0,5 W embutido |
| Feedback visual | 1 LED indicador, aceso por 2 s após cada acionamento |
| Alimentação | Bateria 9 V ou fonte USB |
| Estrutura | MDF 3 mm cortado a laser, com recortes circulares para os botões |

## Lógica de firmware proposta

- Linguagem: C++ no Arduino IDE.
- Mapeamento direto botão → arquivo de áudio (botão 1 → `001.mp3`, …, botão 12 → `012.mp3`).
- A cada acionamento: reproduzir a frase e acender o LED por 2 s.
- Nenhuma lógica de seleção, menu ou tela — trocar frases significa apenas substituir arquivos no cartão.

## Vocabulário (12 mensagens, 4 blocos × 3)

Esta é a lista original do artigo. O projeto passou a usar **10 botões**, sem "Terminei a atividade." e "Foi um prazer."; a numeração vigente está em [README.md](README.md#vocabulário-de-12-para-10-botões).

| Botão / faixa | Bloco | Frase |
| :-: | :-- | :-- |
| 1 | Saúde | "Estou com dor." |
| 2 | Saúde | "Preciso ir ao banheiro." |
| 3 | Saúde | "Preciso de água." |
| 4 | Emoções | "Estou feliz." |
| 5 | Emoções | "Estou triste." |
| 6 | Emoções | "Estou com medo." |
| 7 | Escola | "Preciso de ajuda." |
| 8 | Escola | "Não entendi." |
| 9 | Escola | "Terminei a atividade." |
| 10 | Social | "Olá." |
| 11 | Social | "Foi um prazer." |
| 12 | Social | "Obrigado(a)." |

As frases são gravadas pela professora de AEE, que participa do processo como responsável pela adaptação pedagógica.

## Custo dos componentes

| Componente | Qtd. | Unitário (R$) | Total (R$) |
| :-- | :-: | --: | --: |
| Arduino UNO | 1 | 31,25 | 31,25 |
| Botões físicos 25 mm | 12 | 2,99 | 35,88 |
| Módulo DFPlayer Mini | 1 | 11,90 | 11,90 |
| Cartão MicroSD 2 GB | 1 | 19,58 | 19,58 |
| Alto-falante 0,5 W | 1 | 10,00 | 10,00 |
| LED indicador | 1 | 0,25 | 0,25 |
| Bateria 9 V | 1 | 8,45 | 8,45 |
| MDF 3 mm (corte a laser) | 1 | 35,00 | 35,00 |
| **Total** | | | **152,31** |

O artigo informa total de R$ 152,06 (diferença de R$ 0,25, o valor do LED) e limite orçamentário de R$ 160. A tabela não inclui fios, resistores, placa de montagem nem o corte a laser como serviço.

## Plano de validação

- Fase atual (técnica): pesquisadores acionam repetidamente cada uma das 12 mensagens em sala de AEE simulada, com o protótipo sobre mesa escolar e computador com Arduino IDE para monitoramento.
- Métricas por acionamento:
  1. **Tempo de resposta** – do pressionamento do botão ao início do áudio;
  2. **Acerto/erro** – o áudio corresponde à mensagem esperada.
- Dados organizados em planilha por bloco temático; calcula-se tempo médio e percentual de acerto.
- Critério da hipótese: acerto mínimo de 90%.
- Fase futura: validação com 1 estudante não-verbal e, depois, amostra de mais de 10 estudantes.

### Números projetados (não medidos)

O artigo declara que a integração física ainda não foi finalizada; os valores abaixo vêm de simulação/estimativa e precisam ser substituídos por medições reais.

| Bloco | Tempo médio projetado (s) | Desvio padrão estimado (s) |
| :-- | :-: | :-: |
| Saúde | 1,6 | 0,4 |
| Emoções | 1,9 | 0,7 |
| Escola | 1,8 | 0,6 |
| Social | 1,7 | 0,5 |
| **Total** | **1,8** | **0,6** |

Também citados: mediana de 1,5 s e eficiência projetada de 97,5%.

## Pontos de atenção apontados pelo artigo

- Gravar os 12 MP3 manualmente pode ser difícil para professores sem experiência com edição de áudio.
- O bloco "Emoções" pode exigir mais tempo de reconhecimento pelo estudante.

## Evoluções previstas

- Construção física e validação empírica em escola.
- Bateria recarregável Li-Po no lugar da 9 V.
- Expansão da grade para 16 botões.
- Interface gráfica para facilitar a inserção de áudios (candidata à camada `software/`).
- Pictogramas impressos em 3D colorido.
