# 🎵 Note to Note

**Um ecossistema de organização, descoberta e acompanhamento musical dentro do Obsidian.**

O Note to Note reúne notas interativas em **DataviewJS** e um plugin complementar para transformar um cofre do [Obsidian](https://obsidian.md/) em um espaço para catalogar álbuns, descobrir músicas, acompanhar audições e visualizar estatísticas pessoais.

O projeto utiliza integrações com **Last.fm**, **Spotify**, **MediaDB** e, no relatório, **Deezer**. Os dados de cada usuário ficam no próprio cofre; o código distribuído não precisa conter credenciais pessoais.

> **Status:** módulos principais funcionais. Instalação inicial pelo [bootstrap](Instalador.md) e gerenciamento de módulos e atualizações pela **Central de Configurações V2.3.2**, testados no Obsidian Desktop e Mobile.

## ✨ Funcionalidades

| Módulo | Versão dos arquivos atuais | O que faz |
| --- | --- | --- |
| **Central de Configurações** | V2.3.2 | Configura Last.fm, integrações, diretórios e auxilia na instalação do plugin CataloguedAt. |
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

## 🚀 Instalação pelo bootstrap (recomendada)

O **[Instalador.md](Instalador.md)** é o instalador inicial do Note to Note. Ele busca a última release estável no GitHub e instala a **Central de Configurações**; a partir dela, você instala e atualiza os demais módulos.

1. Instale e ative o **Dataview** no Obsidian e habilite a execução de consultas JavaScript nas configurações do plugin.
2. Abra o arquivo **[Instalador.md](Instalador.md)** no GitHub, copie seu conteúdo integral para uma nova nota no seu cofre e abra essa nota no modo de leitura.
3. Clique em **Verificar release** e depois em **Instalar Central de Configurações**.
4. Abra a nota instalada em `Musicas/Sistema/Configurações.md`.
5. Na seção **Note to Note**, instale os módulos desejados individualmente ou todos de uma vez.
6. Configure suas integrações (Last.fm, Spotify API e MediaDB, conforme os recursos que pretende usar) e, se necessário, instale o plugin **CataloguedAt** pela Central.

**[Abrir instalador inicial →](Instalador.md)** · **[Ver última release →](https://github.com/heitormiguelviana/note-to-note/releases/latest)**

> O bootstrap instala apenas a Central de Configurações. Os demais módulos são instalados por ela. Revise o código antes de executá-lo e mantenha um backup do cofre, especialmente se já possui notas ou sistemas instalados.

### Estrutura de instalação

```text
SeuCofre/
├── Musicas/
│   ├── Sistema/
│   │   ├── Configurações.md
│   │   ├── Configuracoes.json           # configurações locais, não distribuídas
│   │   ├── NoteToNote-Instalacao.json   # registro de versões instaladas
│   │   └── Backups/
│   │       └── Note to Note/
│   └── [notas dos álbuns].md
├── Central.md
├── Diário Musical.md
├── Monitor.md
├── Relatório.md
└── Roleta.md
```

Os cinco módulos musicais são instalados na raiz do cofre; apenas a Central de Configurações fica em `Musicas/Sistema/`. A nota temporária do instalador pode ser mantida onde preferir.

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

A **Central de Configurações V2.3.2** possui um gerenciador integrado que consulta a [última release estável](https://github.com/heitormiguelviana/note-to-note/releases/latest), identifica módulos instalados, ausentes ou modificados e permite instalar ou atualizar cada módulo individualmente ou em conjunto.

O processo verifica a integridade dos arquivos por **SHA-256**, registra versões instaladas e cria **backups antes de substituir arquivos existentes**. O arquivo local `Musicas/Sistema/Configuracoes.json` e as notas pessoais de álbuns não fazem parte dos arquivos distribuídos e não devem ser substituídos pelo gerenciador.

O fluxo de atualização entre releases já foi testado, mas recomenda-se manter um backup independente do cofre antes de atualizar. Cada release contém os seis módulos e seu `manifest.json`.

## 📱 Compatibilidade

Os módulos são construídos para o Obsidian com DataviewJS. O plugin **CataloguedAt V3.1.0** possui tratamento específico para celular e computador. A disponibilidade de recursos individuais depende das versões do Obsidian e dos plugins instalados.

## ⚠️ Observações

- Este é um projeto independente, sem afiliação oficial com Obsidian, Last.fm, Spotify, Deezer ou MediaDB.
- Serviços e APIs externas podem alterar suas condições de acesso e funcionamento.
- Antes de migrar um cofre existente, faça uma cópia de segurança.

## 👤 Autoria

**Heitor**
