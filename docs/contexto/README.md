# Contexto do projeto

O FalaPlaca é uma prancheta física de Comunicação Aumentativa e Alternativa (CAA) para estudantes não-verbais em salas de AEE de escolas públicas. Cada botão tátil reproduz uma frase pré-gravada, por meio de um módulo DFPlayer Mini. O dispositivo deve:

- funcionar 100% offline, sem tela;
- ter baixo custo (limite de R$ 160);
- permitir que a professora troque as frases sem reprogramar a placa.

Os dados técnicos completos do artigo submetido à MNR 2026 estão em [artigo-mnr2026.md](artigo-mnr2026.md): equipe, componentes, vocabulário original de 12 frases, custos, plano de testes e evoluções.

## Requisitos do dispositivo

| Item | Requisito |
| :-- | :-- |
| Entrada | 10 botões de 25 mm na grade 3×4 do corte a laser, com as posições 3B e 4B vazias |
| Mapeamento | Botão *n* → arquivo *n* no cartão MicroSD (`/01/00n`) |
| Áudio | DFPlayer Mini + alto-falante 0,5 W |
| Feedback | LED aceso por 2 s após cada acionamento |
| Alimentação | Bateria 9 V ou USB |
| Estrutura | MDF 3 mm cortado a laser |
| Personalização | Trocar frases sem alterar o firmware, pelo app em `software/` |
| Métricas de teste | Tempo de resposta (pressionar → início do áudio) e acerto ≥ 90% |

## Vocabulário: de 12 para 10 botões

Saíram as duas frases menos ligadas a necessidades imediatas:

- **"Foi um prazer."**: fórmula social de despedida, de uso raro na rotina do AEE;
- **"Terminei a atividade."**: pode ser comunicado pela entrega da atividade ou por "Preciso de ajuda.".

As necessidades fisiológicas, as emoções, o pedido de ajuda, a sinalização de não entendimento, a saudação e o agradecimento foram mantidos.

| Botão | Posição | Bloco | Frase | Pino |
| :-: | :-: | :-- | :-- | :-: |
| 1 | 1A | Saúde | "Estou com dor." | D2 |
| 2 | 1B | Saúde | "Preciso ir ao banheiro." | D3 |
| 3 | 1C | Saúde | "Preciso de água." | D4 |
| 4 | 2A | Emoções | "Estou feliz." | D5 |
| 5 | 2B | Emoções | "Estou triste." | D6 |
| 6 | 2C | Emoções | "Estou com medo." | D7 |
| 7 | 3A | Escola | "Preciso de ajuda." | D8 |
| 8 | 3C | Escola | "Não entendi." | D9 |
| 9 | 4A | Social | "Olá." | A0 |
| 10 | 4C | Social | "Obrigado(a)." | A1 |

Manter as posições vazias em 3B e 4B permite aproveitar o arquivo de corte a laser da grade 3×4: basta não cortar esses dois furos. O espaço extra também afasta os botões, o que ajuda estudantes com dificuldade motora.

## Ligações (sketch principal)

| Sinal | Arduino UNO | Arduino Mega |
| :-- | :-- | :-- |
| Botões 1–10 | D2–D9, A0, A1 (entre o pino e o GND, sem resistor: usa `INPUT_PULLUP`) | igual |
| DFPlayer TX → Arduino | D10 (SoftwareSerial) | RX1 (19) |
| Arduino → DFPlayer RX | D11 com resistor de 1 kΩ em série | TX1 (18) com 1 kΩ |
| LED de confirmação | D13 + resistor de 220 Ω (também acende o LED da placa) | igual |

O firmware escolhe a serial na compilação: `Serial1` quando a placa a possui, `SoftwareSerial` caso contrário. O mesmo sketch compila para UNO (5,0 KB de flash) e Mega.

## Estado atual do firmware

- `firmware/arduino/FalaPlaca/FalaPlaca.ino` implementa os 10 botões:
  - pinos guardados em vetor e lidos num laço, com debounce de 50 ms;
  - toca só ao pressionar, não ao soltar;
  - LED de 2 s sem `delay()`;
  - `isACK=false` para módulos DFPlayer clone;
  - LED piscando rápido quando o DFPlayer não inicia.
- `examples/PrimeiroTesteFuncional` e `examples/SegundoTesteCompleto` ficam como registro dos protótipos anteriores: 2 botões, e 12 botões nos pinos 22–33 do Mega.
- **Atenção:** um protótipo montado com o exemplo de 12 botões no Mega (pinos 22–33) precisa ser religado conforme a tabela acima.

## Camada de software

O app em [software/](../../software/README.md) é um PWA que roda no navegador e no celular. Nele, a professora:

- vê a placa como um mapa de assentos;
- define a frase e o pictograma de cada botão;
- grava a voz pelo microfone ou envia um arquivo;
- exporta para o cartão SD (gravação direta ou `.zip`) ou envia por Bluetooth.

O envio por Bluetooth, **sem cartão de memória**, não é possível com Arduino + DFPlayer: o DFPlayer só lê do cartão, e o UNO não tem memória para os áudios. Ele pressupõe uma revisão da placa com ESP32 (BLE + 4 MB de flash + amplificador I2S). O protocolo está definido em `software/README.md`; o firmware ESP32 ainda não existe. Até lá, o app oferece uma placa de demonstração.

## Organização do cartão MicroSD

```text
/01/001.wav   botão 1  – "Estou com dor."
/01/002.wav   botão 2  – "Preciso ir ao banheiro."
...
/01/010.wav   botão 10 – "Obrigado(a)."
/falaplaca.json   frases, pictogramas e posições (referência do app)
```

O cartão deve estar em FAT32. O DFPlayer identifica o arquivo pelo número de três dígitos, então a extensão pode ser `.wav` ou `.mp3`. Não deixe dois arquivos com o mesmo número; o app remove os antigos ao gravar direto no cartão.

## Divergências entre o artigo e o projeto

| Tema | Artigo | Projeto atual | Encaminhamento |
| :-- | :-- | :-- | :-- |
| Número de botões | 12 (o resumo em inglês cita 16) | 10 | Atualizar texto, tabela de vocabulário e custo (2 botões a menos: −R$ 5,98) |
| Placa | Arduino UNO | UNO ou Mega (o sketch principal compila para os dois) | Resolvido no firmware |
| LED de 2 s | Previsto | Implementado | — |
| Arquivos de áudio | `001.mp3` na raiz | `/01/001.wav` (ou `.mp3`) | Ajustar o texto do artigo |
| Personalização | "sem reprogramação", gravação manual dos MP3 | App com gravação, tratamento do áudio e exportação para o cartão | Pode ser citado como evolução da "interface gráfica" prevista |
| Bluetooth | Não citado | App pronto; requer placa com ESP32 | Incluir nas perspectivas futuras, não nos resultados |
| Fabricação | Corte a laser (o resumo em inglês cita também impressão 3D) | — | Alinhar os resumos em português e inglês |
| Custo | Texto cita "< R$ 120", "< R$ 130" e R$ 152,06 | — | A soma da tabela original dá R$ 152,31; com 10 botões, R$ 146,33 |

## Decisões e pontos a confirmar

- Manter firmware e aplicação de software em camadas e diretórios independentes; `software/app/js/layout.js` e `PINOS_BOTOES` do firmware devem mudar juntos.
- Confirmar a reprodução de WAV no módulo DFPlayer usado (alguns clones só aceitam MP3).
- A bateria 9 V tem baixa autonomia para Arduino + DFPlayer; a troca por Li-Po já está prevista.
- Os tempos de resposta e a eficiência citados no artigo (1,8 s; 97,5%) são **projeções**. Devem ser substituídos por medições com o protótipo físico, seguindo o protocolo de [artigo-mnr2026.md](artigo-mnr2026.md#plano-de-validação).

Os sketches existentes são a fonte do comportamento implementado. Este documento registra o contexto conhecido e não substitui a validação do circuito.
