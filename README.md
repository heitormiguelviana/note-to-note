# 🎵 Note to Note

**Um ecossistema de organização, descoberta e acompanhamento musical dentro do Obsidian.**

O Note to Note reúne notas interativas em **DataviewJS** e um plugin complementar para transformar um cofre do [Obsidian](https://obsidian.md/) em um espaço para catalogar álbuns, descobrir músicas, acompanhar audições e visualizar estatísticas pessoais.

O projeto utiliza integrações com **Last.fm**, **Spotify**, **MediaDB** e, no relatório, **Deezer**. Os dados de cada usuário ficam no próprio cofre; o código distribuído não precisa conter credenciais pessoais.

> **Status:** módulos principais funcionais. O **Note to Note Manager** (instalador e atualizador pelo GitHub) está planejado e **ainda não está disponível**.

## ✨ Funcionalidades

| Módulo | Versão dos arquivos atuais | O que faz |
| --- | --- | --- |
| **Central de Configurações** | V2.2 | Configura Last.fm, integrações, diretórios e auxilia na instalação do plugin CataloguedAt. |
| **Diário Note to Note** | V1.1 | Organiza álbuns catalogados, permite busca, filtros, estatísticas e registros manuais ou via MediaDB. |
| **Central de Descoberta** | V1.3 | Recomenda álbuns a partir de fontes musicais e considera o catálogo existente e a biblioteca Spotify para evitar repetições. |
| **Roleta Note to Note** | V0.43 | Sorteia álbuns com filtros de catálogo, notas, tempo de catalogação, gêneros e scrobbles. |
| **Monitor Last.fm → MediaDB** | V1.28 | Analisa sessões de audição do Last.fm e oferece uma fila para acompanhamento e catalogação de álbuns. |
| **Relatório Note to Note** | V3.4 | Exibe estatísticas de audição por período, artistas, faixas e álbuns, com visualizações e exportações PNG, incluindo Wrapped e Topster. |
| **CataloguedAt** | V3.1.0 | Plugin que preenche automaticamente a data `cataloguedAt` quando uma nova nota Markdown é criada diretamente na pasta `Musicas/`. |

## 🧩 Requisitos

- [Obsidian](https://obsidian.md/), no computador ou celular, com **plugins da comunidade** habilitados.
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview), com execução de consultas JavaScript habilitada, para as notas interativas.
- Uma conta no [Last.fm](https://www.last.fm/) e uma **API Key** para os recursos que consultam audições.
- Integração com Spotify por meio do plugin **Spotify API**, para os recursos dependentes da biblioteca e dos dados do Spotify.
- **MediaDB**, para o fluxo de catalogação integrado (o Diário também oferece cadastro manual).
- Conexão à internet para consultas a serviços externos.

Algumas funcionalidades podem operar parcialmente sem determinadas integrações; outras exigem que elas estejam configuradas.

## 🚀 Instalação manual (atual)

1. Instale e ative os plugins da comunidade necessários, especialmente **Dataview**.
2. Ative a opção de execução de JavaScript nas configurações do Dataview.
3. Crie uma pasta `Musicas/` no seu cofre.
4. Copie o conteúdo de **Configurações.md** para uma nota do Obsidian e abra-a em modo de leitura para executar o bloco DataviewJS.
5. Na Central de Configurações, informe seu usuário e sua API Key do Last.fm, configure o Spotify API quando necessário e salve as configurações.
6. Crie notas separadas para **Diário Note to Note**, **Central**, **Roleta**, **Monitor** e **Relatório**, copiando o conteúdo dos respectivos arquivos `.md`.
7. Para instalar o **CataloguedAt**, utilize a opção disponível no configurador ou instale manualmente o `main.js` e o `manifest.json` na pasta de plugin correspondente do Obsidian.

> Os arquivos usam `Musicas/` como caminho padrão. Se você alterar os diretórios no configurador, confira se os módulos e o plugin atendem à estrutura escolhida. O CataloguedAt V3.1.0 observa especificamente notas criadas diretamente em `Musicas/`.

### Estrutura ilustrativa

```text
SeuCofre/
├── Musicas/
│   ├── Sistema/
│   │   └── Configuracoes.json    # criado localmente pelo configurador
│   ├── Central/
│   └── [notas dos álbuns].md
├── Configurações.md
├── Diário Note to Note.md
├── Central.md
├── Roleta.md
├── Monitor.md
└── Relatório.md
```

A localização das notas de interface acima é apenas um exemplo; a pasta de catálogo é configurável em parte do sistema.

## 🔐 Privacidade e segurança

O Note to Note foi estruturado para **ler as credenciais de um arquivo de configuração local**, em vez de exigir que cada usuário edite as chaves dentro dos módulos.

O configurador cria o arquivo:

```text
Musicas/Sistema/Configuracoes.json
```

**Não publique esse arquivo preenchido.** Ele pode conter seu nome de usuário e sua API Key do Last.fm. Também não publique configurações do plugin Spotify API, tokens de acesso, backups, histórico pessoal ou notas privadas do cofre.

Para evitar inclusão acidental de arquivos pessoais, distribua somente os códigos e arquivos necessários à instalação. O Note to Note executa JavaScript no Obsidian e alguns componentes podem criar ou modificar notas; revise o código antes de instalar versões de terceiros e mantenha backups do seu cofre.

## 🗂️ Campos usados nas notas

O sistema trabalha com notas de álbuns, geralmente do tipo `musicRelease`, e pode utilizar propriedades como:

```yaml
---
type: musicRelease
title: "Nome do álbum"
year: 2026
artists:
  - "Nome do artista"
image: ""
personalRating: 0
scrobbles: 1
cataloguedAt: "13-10-2026"
---
```

Esse bloco é **apenas um exemplo ilustrativo** de metadados; o template e os campos efetivos podem variar conforme o MediaDB e o fluxo de catalogação.

## 🔄 Atualizações

O projeto prevê um **Note to Note Manager**, responsável por instalar e atualizar componentes a partir de versões publicadas no GitHub, preservando configurações e dados pessoais. Essa funcionalidade **ainda está em desenvolvimento**.

Até sua disponibilização, as atualizações dos módulos devem ser feitas manualmente e com backup das notas existentes.

## 📱 Compatibilidade

Os módulos são construídos para o Obsidian com DataviewJS. O plugin **CataloguedAt V3.1.0** possui tratamento específico para celular e computador. A disponibilidade de recursos individuais depende das versões do Obsidian e dos plugins instalados.

## ⚠️ Observações

- Este é um projeto independente, sem afiliação oficial com Obsidian, Last.fm, Spotify, Deezer ou MediaDB.
- Serviços e APIs externas podem alterar suas condições de acesso e funcionamento.
- Antes de migrar um cofre existente, faça uma cópia de segurança.

## 👤 Autoria

**Heitor**
