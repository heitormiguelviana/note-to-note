# Note to Note — sistema visual 1

Os seis módulos oficiais e suas betas são autossuficientes: cada nota contém os mesmos tokens e as regras
comuns, além de ajustes próprios. Não há CSS externo obrigatório nem novo instalador.
O visual aprovado foi promovido para os seis oficiais na v1.3.0. Instalações remotas
continuam consumindo os assets da release publicada. As betas-fonte foram preservadas.

## Auditoria das interfaces usadas como base

| Módulo | Pontos fortes verificados no código | Diferenças encontradas | Decisão |
|---|---|---|---|
| Central 1.9 | Configuração/resultados separados, galeria/foco, ações por descoberta | Conteúdo 990px, vários tamanhos de botão e rótulos | Manter navegação; controles, foco, galeria e tipografia comuns |
| Roleta 1.2 | Álbum destacado, configuração/resultado, histórico e ajuste temporário | Resultado 1100px e controles de sessão próprios | Manter destaque/capa/animação; compartilhar componentes e espaçamento |
| Configurações 2.5.0 | Cards administrativos, grupos de navegação, notas de operação e ações | 940px, botões de 31–35px e shell próprio | Preservar shell e hierarquia administrativa; aumentar alvos e uniformizar cards |
| Diário 1.3.1 | Lista compacta com capas, busca, ordenação, formulário e métricas | 990px, controles e espaçamentos heterogêneos | Preservar catálogo em lista; ritmo vertical e controles comuns |
| Monitor 1.30 | Status textual/ponto, diagnóstico recolhível, fila com contexto técnico | Cards compactos e métricas com tipografia própria | Preservar densidade; padronizar status, seções, cards e legibilidade |
| Relatório 3.6.1 | Rankings, barras, grid, detalhes, períodos e exportações | CSS em camadas 3.5/3.6, max-width 800px !important, dependência de cores do tema | Uniformizar tokens/controles no fim da cascata; preservar gráficos, tabelas e exportações |

A auditoria é de código, não de screenshots no Obsidian. Os módulos já possuíam a
família escura #191d23/#22272e e azul acinzentado, mas com variantes de borda,
muted, raios, larguras, pesos e alturas. A padronização aproveita essa base existente.
Não se presumiu superioridade universal da Central/Roleta. Gráficos do Relatório,
listas do Diário, status do Monitor e painéis das Configurações foram mantidos como
padrões próprios de cada finalidade; não foram transformados em navegação por etapas.

## Tokens

Prefixo exclusivo `--ntn-ui-`, definido na raiz visual de cada módulo:

| Papel | Valor |
|---|---|
| bg / surface / raised | #191d23 / #22272e / #292f38 |
| border | #3b4652 |
| text / muted | #e9edf0 / #a6b2bf |
| accent / selected | #9bb6ce / #2c3b4a |
| success / warning / error | #8fc5ad / #d9bb82 / #e3a0a0 |
| disabled | opacidade 0,5 e cursor normal |
| space-1 … space-5 | 4 / 8 / 12 / 16 / 24px |
| radius / control | 8 / 38px |

As variáveis legadas `--nt-*`, `--ntn-*` e `--nr-*` recebem aliases locais para os
novos tokens. Cores semânticas inline e cores categóricas de gráficos/exportações
foram preservadas, evitando mudança de significado e de PNGs. Tokens são vocabulário
compartilhado, sem migração dos dados nem obrigação de reescrever cada estilo antigo.

## Hierarquia e componentes

- Fonte de interface do Obsidian com fallback system-ui; base 14px/1,55.
- Título principal fluido 25–34px, peso 750, entrelinha 1,18; seções 16–17px.
- Controles 12px, peso 600, entrelinha 1,35, padding 8×12px, raio 6px.
- Superfícies/card usam raio 8px e borda comum. Estados selecionados combinam fundo,
  borda e texto; botões primários usam o mesmo azul contido da seleção.
- Foco visível de 2px, offset 3px em controles, links e summaries. Hover só complementa
  a indicação; nenhum recurso exige hover para funcionar.
- Campos de texto/select usam fundo principal, texto claro e borda uniforme. Checkbox,
  radio e range conservam a geometria nativa e recebem accent-color.
- Badges, chips, tabs e indicadores preservam a estrutura original; aliases e botões
  comuns harmonizam cores e raios. Monitor conserva status textual além do ponto.
- Métricas usam algarismos tabulares. Grids e rankings continuam com a densidade
  funcional própria do Relatório; não há redimensionamento de canvas por JavaScript.

## Dimensões e responsividade

Largura máxima 1100px, width 100%, min-width 0. Mobile em 650px usa padding
16×12×24px, botões de pelo menos 44px e campos de 42px. Grids administrativos e
métricas técnicas passam para duas colunas/uma coluna em 650/420px. Regras originais
de capas, grades e tabelas continuam presentes; o alvo tátil maior não remove ações.
Botões quebram texto, têm largura máxima e nunca dependem apenas de hover.

Movimento reduzido limita animações/transições CSS no escopo visual. A Roleta mantém
sua própria verificação JavaScript de reduced-motion e o botão de pular. Áudio e
sequência do sorteio não mudaram.

## Isolamento e manutenção

Regras novas exigem a raiz original **e** `.ntn-visual-beta`, sem seletores de body,
html ou controles globais. Isso impede a aplicação do novo visual à nota oficial.
IDs de stylesheet da Roleta/Configurações são distintos dos oficiais. Classes de
componentes e eventos existentes não mudam. O modal de exportação do Relatório já
possui namespace próprio; não foi redesenhado nem teve seus eventos alterados.

O bloco `NTN VISUAL — START/END` (nas betas, `NTN VISUAL BETA — START/END`) contém a camada visual incremental. Evitou-se
remover CSS legado do Relatório: há regras de exportação e mobile intercaladas; a
limpeza seria mais arriscada do que uma camada final delimitada. Testes asseguram
que, retirando esse bloco e os marcadores visuais permitidos, cada beta corresponde
byte a byte à sua base em `src/`. Mudanças futuras devem respeitar essa fronteira.

## Validação manual necessária

Sem Obsidian/browser disponível nesta sessão, não houve validação visual executada.
Testar as seis notas separadamente e com oficiais abertos, em 320/390/650/1100/1440px
e em painel estreito de janela larga. Conferir foco pelo teclado, zoom 200%, rótulos
longos, todos os controles, estados de loading/erro/vazio e movimento reduzido.

Conferir também: galeria/foco e feedback da Central; sessão/histórico e giro da Roleta;
busca/formulário/ordenação do Diário; status/fila/diagnóstico do Monitor; navegação,
backups e gerenciador das Configurações (somente cofre de teste); períodos, gráficos,
detalhes e exportações do Relatório. Ajustes estéticos residuais podem ser avaliados
posteriormente; recursos invisíveis, perda de dados ou navegação quebrada bloqueiam
promoção dos designs.
