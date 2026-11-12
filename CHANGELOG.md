# Changelog — Note to Note

## v1.3.0 — Padronização Visual

Atualização compatível da v1.2.1: reúne o visual aprovado dos seis módulos e a evolução
funcional da Central Musical e da Roleta desenvolvida antes da padronização.

| Módulo | Versão publicada anterior | Nova versão |
|---|---|---|
| Central de Descoberta Musical | 1.8 | 1.9.0 |
| Roleta Musical | 1.1 | 1.2.0 |
| Central de Configurações | 2.5.0 | 2.6.0 |
| Diário Musical | 1.3.1 | 1.4.0 |
| Monitor Musical | 1.30 | 1.31.0 |
| Relatório Musical | 3.6.1 | 3.7.0 |

A release geral avança MINOR de 1.2.1 para 1.3.0. Cada módulo também avança MINOR,
pois recebe evolução visual significativa compatível; Central e Roleta incluem ainda
novos fluxos e comportamento. Versões de dois componentes das releases antigas (como
1.30) são interpretadas como major.minor.0: 1.31.0 sucede 1.30, sem reduzir versão.
Não há mudança MAJOR nem seis tags globais por módulo.

### Melhorado — identidade visual dos seis módulos

- Paleta escura e discreta, tipografia, botões, campos, cartões, navegação e estados
  visuais compartilham uma linguagem comum, com CSS incluído em cada nota.
- Foco visível, texto de botões com quebra, alvos táteis maiores em telas pequenas e
  suporte CSS a movimento reduzido. Larguras e raios de componentes harmonizados.
- Cada módulo mantém sua finalidade: descoberta, sorteio, catálogo, diagnóstico,
  análise ou administração. Não foram impostas telas de etapas a todos os módulos.

### Central Musical 1.9.0 — desde a 1.8 publicada

**Adicionado/alterado:** navegação entre configuração e resultados; modos Familiar,
Equilibrado e Exploratório com prioridades distintas; referências adicionais opcionais;
galeria de descobertas e foco com ações. A pesquisa manual respeita o tipo de referências
homogêneas; referências mistas continuam permitindo resultados mistos.

**Melhorado:** perfil agrega avaliações por artista com regularização e evidências por
álbum; usa Curtidos e feedback com papéis distintos. Tags úteis e relações Last.fm
influenciam classificação e diversidade. Evidências repetidas não multiplicam scores.
Exploração distante exige uma ponte de tags; a busca pode entregar menos de seis
resultados quando não há evidência suficiente. Justificativas refletem os sinais usados.

**Corrigido:** cliques repetidos de feedback não acumulam preferências independentes;
feedback fraco não substitui a nota do Diário. Correspondências Spotify exigem artista,
título e edição compatíveis; homônimos e ambiguidades são rejeitados. Duplicatas com
metadados regionais equivalentes podem ser resolvidas de forma determinística.
Descartes normais não são mais notificados como indisponibilidade de API. Bases de
pontuação deixam de saturar em 10. Instrumentais/alternativas têm prioridade reduzida
quando não correspondem à referência; obra-base e instrumental não ocupam duas vagas.

**Diagnóstico/desempenho:** DEBUG opcional inclui proveniência, scores, exclusões,
consultas/cache e tempos. Erros isolados preservam resultados parciais. Tipos descartados
não recebem enriquecimento caro; cache evita novas consultas nas fixtures repetidas.
Não se afirma redução universal da latência ou melhora subjetiva comprovada.

**Preservado:** Curtidos, Já conheço, feedback Markdown, catálogo, biblioteca Spotify,
exclusões/bloqueios, filtros manuais e integração com Configurações.

### Roleta Musical 1.2.0 — desde a 1.1 publicada

**Adicionado:** configuração e resultado em etapas, histórico consultável da sessão,
reinício de sessão e ajustes de uso único para o próximo sorteio: Mais parecido,
Outro gênero, Outra sonoridade e Mudar ambos. Diagnósticos explicam referência,
tags e cobertura dos metadados.

**Melhorado/corrigido:** ajuste explícito sempre influencia os pesos; não há ramo de
15% que o ignore. Gênero/estilo e descritores de atmosfera são tratados separadamente.
Evidências suficientes/parciais têm prioridade sobre desconhecidas sem eliminá-las;
metadados ausentes não são prova de diferença. Categorias de afinidade substituem
percentuais de aparência objetiva. IDs e títulos de edições equivalentes reduzem
repetições indevidas; novos ciclos são permitidos após esgotar elegíveis.

**Preservado:** Aleatório/Surpresa sem ajuste, todos os filtros, acervo offline,
Spotify/Last.fm, caches/preferências, abertura de álbum/nota, animação, áudio e pular
animação. Ajuste é consumido apenas após sorteio concluído, sem histórico persistente.

### Configurações 2.6.0

**Melhorado:** cartões administrativos, navegação, campos, botões, foco e alvos táteis
seguem o design system. **Preservado:** instalação/atualização via manifesto de release,
validação de hashes, backups, migrações, integrações e CataloguedAt. Não há novo motor
de instalação nem mudança de destino das notas.

### Diário Musical 1.4.0

**Melhorado:** controles, hierarquia, cartões e ritmo das listas do catálogo.
**Preservado:** consulta do acervo, busca, filtros, ordenação, estatísticas e cadastro
manual/MediaDB. Sem alteração do schema de notas ou cálculos.

### Monitor Musical 1.31.0

**Melhorado:** status, seções, diagnósticos, metadados e cartões mais consistentes.
**Preservado:** motor de sessões/fila, Last.fm, catalogação, filtros e preferências.
Não passa a editar scrobbles das notas.

### Relatório Musical 3.7.0

**Melhorado:** larguras, superfícies, tipografia e controles alinhados ao ecossistema.
**Preservado:** gráficos, rankings, estatísticas, sessões/tracklists, análise de álbum
completo, Deezer e exportações Wrapped/Topster. Sem mudança de cálculo estatístico.

### Compatibilidade, instalação e validação

- Formatos de dados, caminhos do cofre, integrações e caches permanecem compatíveis.
  A Central lê o estado antigo `central-descoberta-v12` como fallback e grava na chave
  de desenvolvimento herdada, sem apagar a antiga. Estados beta já existentes têm
  prioridade. Curtidos/feedback continuam nos mesmos arquivos; conhecidos não são
  sincronizados automaticamente entre dispositivos.
- Roleta mantém `roleta-albuns-v03`; Monitor/Relatório mantêm suas chaves. IDs técnicos
  com nomes históricos foram preservados deliberadamente. Não é necessária migração
  destrutiva nem novo plugin obrigatório de CSS.
- Novas instalações: use `Instalador.md`. Existentes: abra Configurações, verifique
  atualizações e selecione módulos; mantenha backup independente do cofre.
- Distribuição: seis Markdown canônicos, `manifest.json` e este changelog como anexos
  individuais. O manifesto contém tamanho/SHA-256 dos bytes finais; não inclui betas.
- Testes automatizados de lógica com mocks, sintaxe, contratos de instalação,
  persistência, equivalência de promoção e integridade foram executados. Não equivalem
  a execução de Obsidian/SDKs reais. A padronização foi aprovada pelo mantenedor.
- Similaridade por tags é heurística, não análise objetiva de áudio. Cobertura Last.fm,
  afinidade subjetiva, latência real e peculiaridades de temas/plugins são limitações
  não bloqueadoras conhecidas.

## Histórico anterior

- [v1.2.1](https://github.com/heitormiguelviana/note-to-note/releases/tag/v1.2.1):
  Central 1.8 com Já conheço e Roleta 1.1 com animação/áudio; demais versões na tabela.
- [Releases anteriores](https://github.com/heitormiguelviana/note-to-note/releases):
  preservadas sem alteração de tags ou assets.
