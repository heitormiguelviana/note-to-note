# 🎵 Note to Note

**Um ecossistema de organização, descoberta e acompanhamento musical dentro do Obsidian.**

O Note to Note reúne notas interativas em **DataviewJS** e um plugin complementar para transformar um cofre do [Obsidian](https://obsidian.md/) em um espaço para catalogar álbuns, descobrir músicas, acompanhar audições e visualizar estatísticas pessoais.

O projeto utiliza integrações com **Last.fm**, **Spotify**, **MediaDB** e, no relatório, **Deezer**. As configurações pessoais ficam no próprio cofre e não devem ser incluídas nos arquivos distribuídos.

**[Instalador inicial](Instalador.md) · [Última release estável](https://github.com/heitormiguelviana/note-to-note/releases/latest) · [Histórico de versões](https://github.com/heitormiguelviana/note-to-note/releases)**

> **Estado do projeto:** módulos principais funcionais, com instalação inicial pelo bootstrap e gerenciamento de módulos e atualizações pela Central de Configurações. O funcionamento depende da configuração do Obsidian, dos plugins e dos serviços externos utilizados.

## ✨ Funcionalidades

| Módulo | O que faz |
| --- | --- |
| **Central de Configurações** | Gerencia módulos, atualizações, integrações, diretórios, backups, diagnósticos e ferramentas de migração de dados. |
| **Diário Musical** | Organiza os álbuns catalogados, com busca, ordenação, filtros, estatísticas e cadastro manual ou pelo MediaDB. |
| **Central de Descoberta** | Recomenda artistas, álbuns e faixas a partir de referências e preferências musicais; permite pesquisar e gerenciar curtidos. |
| **Roleta Musical** | Sorteia álbuns do acervo com modos de sorteio e filtros combináveis. |
| **Monitor Musical** | Analisa audições do Last.fm e auxilia no acompanhamento da catalogação de álbuns. |
| **Relatório Musical** | Analisa artistas, faixas, álbuns, sessões, períodos e padrões de escuta; oferece visualizações e exportações PNG, incluindo Wrapped e Topster. |
| **CataloguedAt** | Plugin complementar que registra a data `cataloguedAt` na criação de novas notas Markdown na pasta configurada. |

### Versões atuais

Para evitar informações desatualizadas, as versões dos módulos **não são duplicadas neste README**. Consulte a **[última release estável](https://github.com/heitormiguelviana/note-to-note/releases/latest)** para ver o changelog e os arquivos distribuídos. O `manifest.json` anexado à release contém as versões de cada módulo, seus caminhos de instalação e os dados de integridade.

## 🧩 Requisitos

- [Obsidian](https://obsidian.md/), no computador ou celular, com **plugins da comunidade** habilitados.
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview), com execução de consultas JavaScript habilitada.
- Uma conta no [Last.fm](https://www.last.fm/) e uma **API Key** para recursos que consultam audições.
- Plugin **Spotify API** e integração configurada para recursos que dependem do Spotify.
- **MediaDB** para catalogação integrada; o Diário também oferece cadastro manual.
- Conexão à internet para consultas a serviços externos e atualizações.

Algumas funcionalidades operam parcialmente sem determinadas integrações; outras exigem configuração prévia.

## 🚀 Instalação pelo bootstrap (recomendada)

O **[Instalador.md](Instalador.md)** é o ponto de entrada para novas instalações. Ele consulta a última release estável no GitHub e instala a **Central de Configurações**, que gerencia os demais módulos.

1. Instale e ative o **Dataview** no Obsidian e habilite as consultas JavaScript nas configurações do plugin.
2. Abra o **[Instalador.md](Instalador.md)**, copie seu conteúdo integral para uma nota no cofre e abra-a no modo de leitura.
3. Clique em **Verificar release** e depois em **Instalar Central de Configurações**.
4. Abra a nota instalada em `Musicas/Sistema/Configurações.md`.
5. Na seção de gerenciamento do Note to Note, instale os módulos desejados individualmente ou em conjunto.
6. Configure Last.fm, Spotify API e MediaDB conforme os recursos que pretende utilizar; instale o **CataloguedAt** pela Central, se necessário.

**[Abrir instalador →](Instalador.md) · [Ver última release →](https://github.com/heitormiguelviana/note-to-note/releases/latest)**

> O bootstrap instala apenas a Central de Configurações. Os outros módulos são instalados por ela. Antes de instalar ou atualizar, mantenha um backup do cofre e revise o código que será executado.

### Estrutura de instalação

```text
SeuCofre/
├── Musicas/
│   ├── Sistema/
│   │   ├── Configurações.md
│   │   ├── Configuracoes.json           # configurações locais; não distribuir
│   │   ├── NoteToNote-Instalacao.json   # registro local de instalação
│   │   └── Backups/
│   │       └── Note to Note/
│   └── [notas dos álbuns].md
├── Central.md
├── Diário Musical.md
├── Monitor.md
├── Relatório.md
└── Roleta.md
```

Os cinco módulos musicais são instalados na raiz do cofre; a Central de Configurações fica em `Musicas/Sistema/`. O nome do arquivo **anexado à release** pode ser diferente do nome da nota **instalada no Obsidian**: essa correspondência é definida no `manifest.json`.

## 🔄 Atualizações e integridade

A Central de Configurações consulta a **[última release estável](https://github.com/heitormiguelviana/note-to-note/releases/latest)**, identifica módulos instalados, ausentes ou modificados e permite instalar ou atualizar módulos individualmente ou em conjunto.

O processo usa o `manifest.json` da release para identificar os arquivos e verificar **tamanho e SHA-256**, registra as versões instaladas e cria **backups antes de substituir arquivos existentes**. O arquivo local `Musicas/Sistema/Configuracoes.json` e as notas pessoais de álbuns não fazem parte dos módulos distribuídos.

**Para quem publica uma release:** os anexos Markdown devem ter exatamente os nomes declarados no `manifest.json`. O tamanho em bytes e o SHA-256 de cada anexo precisam corresponder aos valores do manifest. Até mesmo uma mudança de quebra de linha altera o hash. Publique os seis módulos e o `manifest.json` como anexos individuais; um ZIP adicional é opcional e não os substitui.

Para usuários, basta atualizar pela Central de Configurações. Para desenvolvedores e mantenedores, a [página de releases](https://github.com/heitormiguelviana/note-to-note/releases) registra o histórico das mudanças.

## 📊 Relatório e exportação de imagens

O Relatório Musical oferece análise de períodos predefinidos e personalizados, sessões de audição, estatísticas de álbuns e indicadores de hábitos musicais. A identificação de **álbum completo** exige metadados de faixas suficientes e a audição de pelo menos **90% das faixas em uma única sessão**. Percentuais de gêneros são estimativas calculadas a partir de tags e não representam necessariamente uma divisão exata dos scrobbles.

As imagens de **Wrapped** e **Topster** podem ser exportadas em PNG. No computador, há download convencional; no Android, conforme o ambiente, estão disponíveis opções como copiar a imagem ou abri-la em outro aplicativo. Arquivos PNG temporários criados pelo relatório podem ser removidos manualmente; não há exclusão automática.

## 🔐 Privacidade e segurança

As credenciais e preferências locais são mantidas no arquivo:

```text
Musicas/Sistema/Configuracoes.json
```

**Não publique esse arquivo preenchido.** Ele pode conter nome de usuário e API Key do Last.fm. Também não publique tokens do Spotify, backups, histórico pessoal ou notas privadas do cofre.

O Note to Note executa JavaScript no Obsidian, faz requisições a serviços externos e pode criar ou modificar arquivos do cofre. Revise códigos de terceiros e mantenha backups independentes antes de operações de instalação, atualização ou migração.

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

Esse bloco é **apenas um exemplo ilustrativo**. O template e os campos efetivos podem variar conforme o MediaDB e o fluxo de catalogação.

## 📱 Compatibilidade

O projeto foi desenvolvido para **Obsidian Desktop e Mobile** com DataviewJS. A disponibilidade de funções específicas depende da versão do Obsidian, dos plugins instalados, das permissões do dispositivo e das APIs externas.

## ⚠️ Observações

- Projeto independente, sem afiliação oficial com Obsidian, Last.fm, Spotify, Deezer ou MediaDB.
- APIs e serviços externos podem mudar suas condições de acesso e funcionamento.
- Antes de migrar um cofre existente, faça uma cópia de segurança.

## 👤 Autoria

**Heitor**
