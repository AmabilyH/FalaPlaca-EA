# FalaPlaca

Prancheta física de Comunicação Aumentativa e Alternativa (CAA) com síntese de voz para estudantes não-verbais em escolas públicas. São 10 botões táteis, cada um reproduzindo uma frase pré-gravada a partir de um cartão MicroSD. O dispositivo funciona totalmente offline e sem tela. A professora configura frases, pictogramas e vozes num app web/celular, sem reprogramar a placa.

Projeto desenvolvido no IFPE (campi Palmares e Ipojuca) e apresentado no artigo MNR 2026.

## Hardware

- Arduino UNO (ou Mega)
- Módulo DFPlayer Mini + cartão MicroSD
- 10 botões de 25 mm na grade 3×4 (posições 3B e 4B vazias)
- Alto-falante 0,5 W e LED indicador
- Bateria 9 V ou USB
- Estrutura em MDF 3 mm cortado a laser

Custo estimado: cerca de R$ 146 (limite de R$ 160). Ligações e pinos em [docs/contexto](docs/contexto/README.md#ligações-sketch-principal).

## Estrutura

```text
docs/
  contexto/
    README.md               Requisitos, pinos, estado atual e pontos a confirmar
    artigo-mnr2026.md       Dados técnicos do artigo
firmware/
  arduino/
    FalaPlaca/
      FalaPlaca.ino         Sketch principal (10 botões, LED, UNO ou Mega)
    examples/
      PrimeiroTesteFuncional/   Protótipo com 2 botões
      SegundoTesteCompleto/     Protótipo com 12 botões (Mega, pinos 22–33)
software/
  app/                      App PWA para configurar a placa (navegador e celular)
  servidor.mjs              Servidor local do app
```

## Firmware Arduino

1. Abra `firmware/arduino/FalaPlaca/FalaPlaca.ino` no Arduino IDE.
2. Instale a biblioteca `DFRobotDFPlayerMini`.
3. Selecione Arduino UNO ou Mega e grave.

Os exemplos em `firmware/arduino/examples/` são sketches independentes, com outras configurações de pinos.

Grave os áudios no cartão MicroSD (FAT32) como `/01/001.wav` a `/01/010.wav` (MP3 também funciona); o botão *n* toca o arquivo *n*. O app gera essa estrutura automaticamente.

## App de configuração

```bash
cd software
npm start
```

Abra `http://localhost:5173`. Detalhes de uso no celular, Bluetooth e protocolo em [software/README.md](software/README.md).

Consulte [o contexto do projeto](docs/contexto/README.md) para requisitos, decisões e pontos de hardware a confirmar.
