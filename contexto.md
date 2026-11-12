# Contexto técnico do Note To Note

## 1. Finalidade e fontes de referência

Este documento orienta manutenção e desenvolvimento com ChatGPT, Codex, Claude,
Gemini e outras ferramentas de IA, sem depender do histórico de conversas.
Leia-o antes de alterações significativas e consulte o [README](README.md) para
instalação e orientações ao usuário. Informações técnicas abaixo foram conferidas
no README, no bootstrap, no manifesto e nos seis anexos da release estável.

Referência de código desta revisão: **Note to Note v1.3.0 — Padronização Visual**.
O `manifest.json` versionado na raiz identifica os seis módulos oficiais em `src/`,
seus destinos, versões, bytes e SHA-256. O instalador continua consumindo uma cópia
desse manifesto anexada à release do GitHub, sem ler o checkout. A promoção da
padronização visual foi aprovada pelo mantenedor; não há novo ciclo de redesign.

A base publicada anterior foi conferida por `releases/latest`: v1.2.1, publicada
em 29/10/2026 UTC, Central 1.8/Roleta 1.1. Seu manifesto permanece como referência
histórica em `docs/references/manifest-v1.2.1.json`. Consulte a API antes de afirmar
qual é a última release remota. Versão geral, versão individual e chave de estado
persistido são conceitos diferentes. Consulte [CHANGELOG.md](docs/CHANGELOG.md).

## 2. Visão geral e ambiente de execução

Note To Note é um ecossistema musical dentro de um cofre do **Obsidian**. Organiza
notas de álbuns, avaliações, descobertas, sorteios, histórico de audições e
relatórios. Não é um aplicativo independente nem um plugin monolítico.

Os seis módulos são notas Markdown com blocos `dataviewjs`: o Dataview executa
JavaScript que lê o cofre e monta interfaces no DOM. O código utiliza objetos
como `dv`, `dv.app`, `app`, APIs do Vault, comandos de plugins e APIs do ambiente
Obsidian. Abrir os arquivos em um visualizador Markdown comum ou executar o
conteúdo diretamente em Node.js não reproduz o ambiente funcional.

Obsidian e Dataview com consultas JavaScript habilitadas são requisitos de
execução. Last.fm, Spotify API, MediaDB, Deezer, Meta Bind e CataloguedAt têm
papéis distintos; não devem ser classificados coletivamente como obrigatórios
para todas as funções. O projeto atende Desktop e Mobile, sujeito às versões
dos plugins, às permissões e às APIs disponíveis em cada dispositivo.

## 3. Estrutura do repositório e distribuição

```text
note-to-note/
├── README.md, contexto.md
├── Instalador.md, manifest.json
├── src/
│   ├── Central.md, Configuracoes.md, Diario.Musical.md
│   └── Monitor.md, Relatorio.md, Roleta.md
├── betas/                  # seis Betas ativas, snapshots e backups imutáveis
├── tests/                  # lógica, sintaxe e contratos com mocks
├── tools/                  # preparo e validação da distribuição
└── docs/                   # CHANGELOG.md, design system, validação e referências
```

`src/` representa o código-fonte versionado. Sua inclusão não muda a origem dos
downloads: o bootstrap e o gerenciador continuam consumindo **anexos de GitHub
Releases**, sem ler `src/`. Alterar um arquivo nessa pasta não atualiza
automaticamente os cofres dos usuários nem publica uma release.

### Mapeamento do manifesto da v1.3.0

| Arquivo distribuído e versionado em `src/` | Módulo | Versão | Nota instalada, relativa ao cofre |
| --- | --- | --- | --- |
| `Configuracoes.md` | Central de Configurações | 2.6.0 | `Musicas/Sistema/Configurações.md` |
| `Central.md` | Central de Descoberta Musical | 1.9.0 | `Central.md` |
| `Diario.Musical.md` | Diário Musical | 1.4.0 | `Diário Musical.md` |
| `Monitor.md` | Monitor Last.fm → MediaDB | 1.31.0 | `Monitor.md` |
| `Roleta.md` | Roleta Musical | 1.2.0 | `Roleta.md` |
| `Relatorio.md` | Relatório Musical | 3.7.0 | `Relatório.md` |

Preserve os nomes dos anexos, inclusive pontos, ausência de acentos e caixa.
Os nomes das notas instaladas são outro contrato. No manifesto, apenas
`configuracoes` tem `required: true`; isso não significa que os outros módulos
não tenham requisitos próprios quando executados.

## 4. Arquitetura e responsabilidades

### 4.1. Central de Configurações — `src/Configuracoes.md`

É a interface de configuração e manutenção, distinta do bootstrap. Lê e salva
`Musicas/Sistema/Configuracoes.json`, com `schemaVersion`, `paths`, `lastfm`,
`integrations` e `preferences`. Os caminhos padrão são `Musicas`,
`Musicas/Central` e `Musicas/Central/Feedback.md`. Preferências de integração
existem no JSON, mas não se deve presumir que todos os módulos as consultem;
verifique o consumidor específico antes de alterar esse contrato.

Oferece teste Last.fm por `user.getinfo`, configuração e login pelo plugin
`spotify-api`, preparação do MediaDB e de um template de álbum, diagnóstico de
plugins e instalação do CataloguedAt. Ao editar configurações de plugins, há
rotinas de backup de `data.json`; isso é separado dos backups de módulos.
O diagnóstico também verifica Meta Bind. O template e o cadastro manual usam
um controle `INPUT[slider(...):personalRating]`, cuja interface depende dele.

O gerenciador de módulos (`ntnRemote`, `ntnLocal`, `ntnInstall`) consulta a release
estável, valida o manifesto, verifica os arquivos locais e distingue ausentes,
atualizados e versões/conteúdos divergentes conforme hash e registro local.
Atualizações exigem ação e confirmação do usuário. Baixa e valida os módulos
selecionados antes de escrevê-los, cria backups e verifica o hash após gravar.
Uma falha durante a gravação interrompe os módulos seguintes e informa os
concluídos; não documente isso como uma transação com rollback integral.

Há ferramentas de migração de módulos de destinos antigos em `Musicas/Sistema/`
para a raiz do cofre, com reconhecimento do conteúdo, confirmação e verificação
de conflitos. Outras rotinas de manutenção devem ser examinadas individualmente
antes de uso; a existência da interface não autoriza migrações indiscriminadas.

### 4.2. Central de Descoberta — `src/Central.md`

Combina fontes musicais, catálogo, preferências e feedback para recomendar
artistas, álbuns e faixas. O pipeline explícito é: fontes → candidatos →
normalização → exclusões → pontuação → diversidade → Spotify → resultados.
Há descoberta personalizada, busca manual, curtidos e itens conhecidos.

O código usa Last.fm para buscas, similares, tags, álbuns e enriquecimento de
perfil, e `window.spotifysdk`, fornecido pela integração Spotify, para buscas,
resolução de resultados e operações da biblioteca. A chave Last.fm é necessária
para as chamadas `lastfm`; operações Spotify exigem SDK e autenticação. Não
prometa descoberta integral offline ou sem essas integrações. Ler preferências
e coleções locais é uma capacidade diferente de obter novas recomendações.

O catálogo e a biblioteca Spotify são utilizados para excluir itens já possuídos,
com normalização de edições equivalentes em partes do pipeline. Feedback em
Markdown participa das preferências; curtidos são uma coleção própria em JSON.

Desde a 1.8, **Já conheço** registra familiaridade com artistas, álbuns e faixas, pode
ser pesquisado e desfeito e evita novas recomendações correspondentes, incluindo
tratamento de edições equivalentes de álbuns. Não exige catalogação no MediaDB
nem salvamento no Spotify. Não é curtida, feedback negativo ou bloqueio de
artistas semelhantes. `knownItems` pertence ao estado em `localStorage`, separado
da coleção de curtidos e do arquivo de feedback. A release informa expressamente
que não há sincronização automática dessas marcações entre dispositivos.

Na 1.9.0, configuração/resultados são etapas separadas e os modos Familiar,
Equilibrado e Exploratório possuem prioridades distintas. Referências homogêneas
na busca manual retornam o mesmo tipo; mistas admitem complemento. O perfil usa
avaliações regularizadas por artista e sinais por álbum, Curtidos e feedback efetivo.
Tags úteis/Last.fm são aproximações, não descritores de áudio verificados. O histórico
exclui repetições; posse e bloqueios continuam regras independentes do modo.
Feedback repetido não acumula preferências; nota do Diário domina feedback fraco.
Resolução Spotify valida artista/título/edição e rejeita ambiguidades, separando
rejeição normal de falha de API. Pode haver menos de seis resultados com evidência.
DEBUG vem desativado e expõe contadores/proveniência sem credenciais. Estado usa
`central-descoberta-v19-beta3-ui`, lê o legado beta e `central-descoberta-v12` como
fallback, sem apagar a chave antiga. JSON de Curtidos e feedback Markdown não mudam.

### 4.3. Diário Musical — `src/Diario.Musical.md`

Consulta e organiza os álbuns com busca por álbum/artista/ano, ordenação,
estatísticas e filtros, incluindo nota, scrobbles e tempo de catalogação.
Lê o diretório de músicas do JSON compartilhado; sem configuração utilizável,
mantém `Musicas` e registra aviso em caso de erro de leitura.

A seleção inicial usa `dv.pages()`, restringe o caminho ao diretório de músicas,
aceita `type === "musicRelease"` **ou** a tag `mediaDB/music/Album` e exclui
arquivos com `template` no nome. Essa regra não deve ser generalizada como a
regra de catálogo de todos os módulos.

Permite acionar catalogação pelo MediaDB e também criar notas manualmente sem
ele. No cadastro manual, título e artista são obrigatórios no formulário;
ano e imagem são opcionais. Isso não estabelece obrigatoriedade universal de
todos os campos das notas existentes. A criação manual inicializa
`personalRating: 0` e `scrobbles: 1`, mas não grava `cataloguedAt`: espera o
plugin complementar para esse campo. A consulta local e o cadastro manual não
fazem do Last.fm ou Spotify um requisito universal do Diário.

### 4.4. Monitor Musical — `src/Monitor.md`

Consulta audições Last.fm, agrupa sessões, compara com o acervo e mantém uma fila
para acompanhamento e catalogação. A interface da 1.30 conserva o motor e as
chaves de estado anteriores. O filtro de sessões já catalogadas é visual e não
deve ser confundido com processamento da fila. O Monitor declara expressamente
que **não lê nem altera a propriedade `scrobbles` das notas**.

`loadMusicalConfig` valida schema, usuário/chave Last.fm e caminhos; na falha,
limpa as credenciais em memória e registra `monitorConfigError`, sem fallback
com credenciais embutidas. `fetchRecentTracks` depende do Last.fm e usa
`user.getrecenttracks` com paginação. Os padrões são consulta a cada 45 segundos,
janela de 72 horas, 200 itens por página e até 10 páginas. Sessões têm parâmetros
de mínimo de duas faixas e intervalo máximo de 45 minutos. Esses limites
descrevem esta implementação, não cobertura garantida de todo o histórico.

`lastFmRequest` lança erro em HTTP não bem-sucedido ou `data.error` da API; erros
de rede e parse também propagam. O ciclo de consulta captura falhas, registra
`lastApiStatus: "ERRO"` e a mensagem, salva o estado e redesenha a interface.
Uma resposta válida sem faixas e uma consulta que falhou têm significados
distintos. Não diagnostique falha como ausência legítima de audições.

Para catalogar, procura um comando Music Release do MediaDB, abre o modal e
tenta preencher a busca. Se não encontrar o comando, modal ou campo, informa a
limitação e, quando possível, oferece o texto via clipboard. O usuário confirma
a catalogação no MediaDB; não é criação silenciosa de toda a fila. Spotify não
é a fonte da coleta de audições deste módulo.

### 4.5. Roleta Musical — `src/Roleta.md`

Sorteia álbuns com filtros combináveis e modos **Aleatório** e **Surpresa**.
Cruza o catálogo local com a biblioteca Spotify conforme o modo de catálogo;
fora do modo catalogado, o código exige carregar a biblioteca Spotify.
Last.fm é usado para tags de gêneros e fallback de duração; não classifique
essa dependência como necessária para qualquer sorteio local sem esses recursos.
Filtros incluem metadados como notas, gêneros, tempo de catalogação e duração;
confira `applyFilters` para a combinação exata de cada tarefa.

A 1.1 adiciona animação de prévias, desaceleração, revelação e efeitos sonoros.
O vencedor é escolhido antes de `animateDraw`; a sequência de capas é visual.
Pular a animação não deve alterar o resultado. O código também considera
movimento reduzido e quantidade de candidatos. O modo Surpresa usa ponderação
moderada por raridade de artista/gênero sem excluir candidatos nessa etapa;
gênero desconhecido não deve ser transformado em gênero raro. Preserve seleção,
filtros e estados de erro ao alterar apresentação.

Na 1.2.0, a Roleta separa configuração/resultado, mantém histórico consultável
apenas na sessão e oferece ajustes para o próximo sorteio concluído. Mais parecido,
Outro gênero, Outra sonoridade e Mudar ambos usam relações de tags com dimensões
separadas e ponderação probabilística; nenhum ajuste é ignorado por exploração
aleatória. Evidências parciais/desconhecidas recebem prioridade menor, mas continuam
elegíveis. Diagnóstico usa categorias de afinidade, sem alegar medição objetiva de
áudio. IDs/edições equivalentes ajudam a evitar repetição até esgotar os elegíveis.
Reiniciar sessão não altera o catálogo ou preferências persistidas. Filtros, Surpresa,
áudio, animação, pular, caches e a chave `roleta-albuns-v03` permanecem compatíveis.

### 4.6. Relatório Musical — `src/Relatorio.md`

Analisa artistas, álbuns, faixas, sessões, períodos e hábitos. Oferece períodos
predefinidos e personalizados, gráficos e exportações PNG Wrapped e Topster.
Exige JSON compartilhado legível com usuário e chave Last.fm não vazios.
Usa Last.fm para audições e metadados, catálogo local para relacionar o acervo
e Deezer para enriquecimento, incluindo capas. Não depende universalmente do
plugin MediaDB para ler notas já existentes nem de Spotify para coletar o
histórico Last.fm.

A coleta é paginada e tem limite de segurança de 250 páginas; o código prevê
aviso de coleta incompleta. Sessões usam parâmetros de duas faixas e intervalo
máximo de 45 minutos. Em `enrichReleaseMetadata`, a classificação de álbum
completo requer tracklist oficial utilizável: ao buscar metadados, confere
artista/nome e exige ao menos duas faixas sem duplicatas normalizadas.
Conta **faixas distintas reconhecidas em uma única sessão**, cuja cobertura
deve ser **pelo menos 90%** da tracklist. Sem metadados suficientes, não declara
álbum completo. Não substitua essa regra por soma acumulada de scrobbles ou
faixas entre sessões. O enriquecimento examina até 24 lançamentos ordenados por
scrobbles; a ausência dessa classificação não prova que um álbum nunca foi
ouvido integralmente.

Percentuais de gêneros baseados em tags são **estimativas**, não uma distribuição
exata das audições. Exportações usam recursos de imagem do ambiente; Desktop e
Android podem apresentar opções diferentes de download, clipboard ou abertura
em outro app. O README informa que PNGs temporários não são apagados
automaticamente. O código define a pasta de exportação `Exportacoes` e limites
de pixels distintos para dispositivos móveis.

### 4.7. Plugin complementar CataloguedAt

Registra `cataloguedAt` na criação de novas notas Markdown na pasta monitorada.
É um plugin separado das seis notas, identificado como
`catalogued-at-system-date`. O manifesto de distribuição dos módulos não contém
um sétimo componente CataloguedAt.

`Configuracoes.md` inclui os arquivos do instalador desse plugin codificados
em base64 (`cataloguedFiles`), com manifesto do plugin 3.1.0. Esse conteúdo
**já faz parte dos bytes oficiais da Central** e permanece intacto. Não foi
extraído nem adicionado um plugin independente a `src/`. Para alterar sua lógica
ou afirmar detalhes sobre suporte a pastas configuráveis, examine separadamente
o payload efetivamente instalado e suas configurações; não deduza que mudar
`paths.musicRoot` atualiza automaticamente o plugin.

## 5. Dados, persistência e privacidade

### Notas de álbuns

O cofre é o armazenamento principal do catálogo. As notas podem conter `type`,
`title`, `artists`, `year`, `image`, `personalRating`, `scrobbles` e
`cataloguedAt`, além de metadados trazidos pelo MediaDB. Campos ausentes são
tratados de forma diferente por cada consumidor. No Diário, `cataloguedAt`
espera `DD-MM-YYYY` e valida a data; notas sem data válida ficam fora do filtro
temporal. A Roleta também reconhece variantes de nomes de campos. Consulte as
funções de leitura antes de migrar propriedades ou impor um schema universal.

O significado de `scrobbles` no frontmatter não equivale automaticamente ao
histórico remoto Last.fm. O Monitor não o mantém atualizado. Uma rotina de
relatório que conta audições e um filtro do Diário que lê a propriedade local
podem usar fontes diferentes.

### Arquivos e estado local confirmados

| Local/chave padrão | Responsabilidade e cuidado |
| --- | --- |
| `Musicas/Sistema/Configuracoes.json` | Configuração compartilhada, caminhos, usuário e API Key Last.fm; não distribuir preenchido. |
| `Musicas/Sistema/NoteToNote-Instalacao.json` | Registro local com versão, hash, release e caminho de módulos; não é o manifesto remoto. |
| `Musicas/Sistema/NoteToNote-Curtidos.json` | Coleção de curtidos da Descoberta; formato atual tem `version: 2`, `items` e `albums` para compatibilidade. |
| `Musicas/Central/Feedback.md` | Eventos de feedback usados pela Descoberta; caminho configurável. |
| `Musicas/Sistema/Template Album Musical.md` | Template preparado pela Central para o fluxo de catalogação. |
| `Musicas/Sistema/Backups/Note to Note/` | Backups das notas de módulos antes de substituição. |
| `<configDir>/plugins/<id>/data.json` e backups | Dados dos plugins, incluindo configuração e tokens Spotify; `configDir` costuma ser `.obsidian`. |
| `localStorage["central-descoberta-v12"]` | Preferências de interface, recomendações/históricos limitados e `knownItems`; não confundir com curtidos em JSON. |
| `localStorage["central-scrobble-monitor-v126-stable"]` | Fila, sessões processadas/ignoradas, preferências e diagnósticos do Monitor. |
| `localStorage["roleta-albuns-v03"]` | Escolhas da Roleta; há caches separados de duração, vínculos e gêneros. |
| Chaves `relatorio-musical-v30:*` e caches do Relatório | Período, aba, datas, opções Topster e caches de artistas, gêneros, capas, tracklists e histórico. |

Chaves antigas são mantidas deliberadamente para preservar estado; não as
renomeie só para acompanhar a versão exibida. Dados em `localStorage` não são
arquivos Markdown do Vault: sincronizar o cofre não comprova sincronização
dessas chaves. Caches em memória também existem e não são persistência durável.

Estrutura básica de um cofre, com os destinos oficiais atuais:

```text
SeuCofre/
├── Musicas/
│   ├── [notas de álbuns].md
│   ├── Central/Feedback.md
│   └── Sistema/
│       ├── Configurações.md
│       ├── Configuracoes.json
│       ├── NoteToNote-Instalacao.json
│       ├── NoteToNote-Curtidos.json
│       ├── Template Album Musical.md
│       └── Backups/Note to Note/
├── Central.md
├── Diário Musical.md
├── Monitor.md
├── Relatório.md
├── Roleta.md
└── Exportacoes/             # quando utilizada pela exportação
```

Os caminhos de dados podem ser configuráveis, mas os destinos oficiais dos seis
módulos são explicitamente validados pelo gerenciador. Não suponha que todos
os caminhos mudem ao editar a pasta de músicas.

Nunca publique configurações preenchidas, chaves Last.fm, Client Secret/tokens
Spotify, dados pessoais de plugins, backups privados, notas de álbuns pessoais,
feedback, curtidos, filas, histórico ou exportações pessoais. Esses dados de
usuário não pertencem à distribuição do código. Exemplos devem usar apenas
valores fictícios e não conter credenciais reais.

## 6. Instalação, atualização e publicação

### Bootstrap e integridade

1. O usuário habilita DataviewJS e abre `Instalador.md` como nota no Obsidian.
2. O bootstrap consulta a última release estável pela API GitHub.
3. Obtém `manifest.json`, valida projeto/schema/versão e seleciona o componente
   `configuracoes`, conferindo origem, destino, tamanho e formato do hash.
4. Ao instalar, reconsulta release/manifesto e detecta mudanças relevantes.
5. Baixa a Central e compara tamanho e SHA-256 dos bytes com o manifesto;
   valida UTF-8 e o início de nota DataviewJS.
6. Solicita confirmação para instalar/substituir. Se o destino existir, cria
   backup e verifica sua leitura antes da substituição.
7. Grava `Musicas/Sistema/Configurações.md`; o usuário abre essa Central para
   instalar os outros cinco módulos e configurar integrações.

O bootstrap não instala todos os módulos, não é a Central e não passa a usar
`src/`. Sua versão interna atual é 1.0.2. Hash e tamanho detectam divergência em
relação ao manifesto obtido; não devem ser descritos como assinatura digital
independente ou garantia de autenticidade além da origem consultada.

### Gerenciamento posterior

A Central valida os seis IDs, os nomes dos anexos e os destinos permitidos.
O registro local ajuda a reconhecer o conteúdo instalado, sem substituir o hash
do arquivo real. Downloads passam por tamanho/SHA-256; backups de módulos são
copiados em binário e têm hashes comparados. Configurações pessoais e notas de
álbuns não são substituídas pelo gerenciador de módulos. Isso não elimina a
necessidade de backup independente antes de atualização ou migração.

### Procedimento de distribuição conhecido

O README determina publicar **os seis Markdown e `manifest.json` como anexos
individuais**, com nomes exatos e tamanho/SHA-256 calculados dos bytes finais.
ZIP é opcional e não os substitui. Mudanças de quebras de linha alteram hashes.

O preparo é reproduzível com `node tools/release.cjs --output <diretório>`.
Valida nomes/destinos no contrato histórico, versões e bytes finais, copiando apenas
os seis oficiais, manifesto e changelog. `tools/release-source.cjs` registra a
transformação de apresentação/versionamento das betas aprovadas. Os testes rodam
com `node --test tests/*.test.cjs`, sem dependências novas. Testes com mocks não
validam Obsidian real. Publicar continua sendo operação explícita autorizada,
após PR/merge; não existe atualização automática do cofre a partir do Git.

## 7. Estado estável, limites e validação desta organização

Os hashes abaixo registram a origem histórica da v1.2.1, não os assets atuais.
A referência atual é o manifesto da raiz, para v1.3.0.
O changelog destaca Já conheço na Descoberta 1.8 e a experiência animada da
Roleta 1.1; os demais módulos mantêm versões anteriores. Comentários históricos
dentro do código podem mencionar versões mais antigas; não os use isoladamente
como versão do anexo. Betas externas ou planejadas não integram esta referência
e não devem substituir o código estável sem aprovação.

Limites confirmados incluem estado local sem sincronização automática de
conhecidos, dependência de metadados para álbum completo, limites de paginação,
estimativas por tags e diferenças de exportação entre plataformas. Chamadas
externas podem falhar. Por exemplo, embora o wrapper Last.fm da Descoberta
lance erros HTTP/API, alguns consumidores capturam falhas e retornam listas
vazias. Investigue o caminho da chamada antes de concluir que não há resultados;
este documento não afirma que toda falha de toda integração é exibida na UI.

Na inclusão inicial em `src/`, cada anexo foi baixado da release, validado contra
`sizeBytes` e `sha256` do manifesto e comparado byte a byte com a cópia. Os
valores de referência são:

| Anexo | Bytes | SHA-256 |
| --- | ---: | --- |
| `Central.md` | 97258 | `89f4acba84b863832568d68fd6524bb9fe9a6a5267312706c802fa558c0f2f9a` |
| `Configuracoes.md` | 62949 | `3647f0a8d23824d9092011b357b4e48ac0c7aa4a72750d754782f84a4b2c52f6` |
| `Diario.Musical.md` | 42660 | `905f5daa72f67f854a5c6ade6ee9817c9822f935d52ea8a955a6d57c73817e4a` |
| `Monitor.md` | 58491 | `d1e58edc211421a73085a05ca9056ec07c5f34ff53f50e3e81cc14374aab41e0` |
| `Relatorio.md` | 112621 | `d45719f1a609c6836cbd3f5cea545d2533f9d63c66c49b1a976c346bcacad476` |
| `Roleta.md` | 108774 | `df8c6ae99cd6f02133ac573867fec40946fc0fdb14112bdb8b17e852646ccdc3` |

Esses hashes registram a origem desta cópia; após futuras alterações autorizadas
de código, a divergência pode ser esperada e deve ser explicada. Preserve a
release como referência de distribuição estável. A verificação de integridade
não demonstra execução funcional no Obsidian. Esta organização não incluiu
teste funcional em Desktop/Mobile nem autenticação nas APIs musicais.

## 8. Regras de desenvolvimento

1. Preserve todas as funcionalidades existentes que estejam funcionando.
2. Não modifique módulos ou algoritmos fora do escopo solicitado.
3. Não adicione dependências sem justificar sua necessidade.
4. Identifique a causa do problema antes de propor correções.
5. Diferencie fatos observados de hipóteses.
6. Não trate erros de API, limites de requisição, falhas de autenticação ou
   problemas de rede como ausência legítima de resultados.
7. Não crie uma nova Beta apenas com base em hipóteses.
8. Proponha a menor alteração possível.
9. Execute testes automatizados quando viável, incluindo casos de erro.
10. Compare o comportamento novo com o original para detectar regressões.
11. Não apresente testes simulados como validação em ambiente real.
12. Informe claramente o que não pôde ser testado.
13. Não substitua versões estáveis por experimentais sem aprovação.
14. Mantenha compatibilidade com Desktop e Mobile quando aplicável.
15. Não exponha tokens, chaves de API ou dados pessoais.
16. Para alterações de código, apresente diagnóstico, mudanças realizadas,
    testes e limitações.
17. Não faça merge nem publique releases sem autorização explícita.

## 9. Orientações para futuras IAs

Leia `contexto.md` antes de alterações significativas e consulte `README.md`
quando necessário. Examine apenas os arquivos relevantes à tarefa e siga as
chamadas envolvidas para verificar contratos, persistência e efeitos colaterais.
Trate o código versionado como fonte de implementação e a release selecionada
como referência estável de distribuição; documente divergências futuras.

Não dependa de informações não verificadas de conversas anteriores. Quando um
erro não puder ser reproduzido ou diagnosticado, solicite evidências adicionais
como passos, versão, plataforma, mensagem e logs sem credenciais. Separe
hipóteses de conclusões confirmadas e não transforme planos em funcionalidades
implementadas.

Evite reescrever módulos inteiros quando uma correção localizada for suficiente.
Antes de alterar dados, examine os leitores e escritores, as chaves antigas e
as rotinas de migração. Em mudanças visuais, preserve a seleção de candidatos,
os filtros, os efeitos de persistência e o tratamento de erros.

Para alterações de organização como esta, tamanho, SHA-256, comparação binária
e inspeção do diff comprovam o escopo sem exigir Obsidian. Para mudanças
funcionais, estabeleça cenários representativos e de erro, compare com a base e
teste no Obsidian Desktop/Mobile quando necessário. Mocks ou análise estática
devem ser identificados como tais, e limitações de validação sempre declaradas.

## 10. Visual, organização e versionamento atuais

A padronização aprovada foi incorporada aos seis oficiais. Tokens, hierarquia,
componentes, foco, responsividade e particularidades estão em `docs/design-system.md`.
Cada módulo contém seu CSS isolado, sem dependência global. A Central/Roleta mantêm
etapas; Diário é catálogo, Monitor é diagnóstico, Relatório é análise e Configurações
é administração. Cálculos, dados e integrações dos quatro últimos não mudaram.
O prefixo técnico `ntn-visual-beta` e IDs de CSS herdados permanecem intencionalmente
mesmo no oficial para não alterar o visual aprovado; não são rótulos exibidos.

As seis betas ativas em `betas/` mantêm os nomes canônicos acrescidos de `-Beta.md`.
Snapshots/versões antigas ficam em `betas/central-musical` e `betas/roleta-musical`.
Backups `pre-padronizacao` preservam os módulos da v1.2.1 publicada; backups
`pre-release-v1.3.0` preservam os oficiais locais anteriores a esta promoção visual.
Todos têm índices de integridade. Não editar snapshots antigos. Branches de trabalho
são temporárias; não existe branch dev permanente. Uma tag geral `vMAJOR.MINOR.PATCH`
identifica a release; versões dos módulos são independentes no manifesto/changelog.

A evolução visual significativa justifica incrementos MINOR compatíveis. Estado,
cache e formatos não mudam só para acompanhar versão. A aprovação visual do
mantenedor não transforma testes automatizados em testes de execução no Obsidian.
Não foram usados cofres/credenciais musicais pessoais na preparação desta release.
