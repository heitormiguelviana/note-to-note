# Histórico da Central Musical Beta

## Beta 2 — 12/11/2026

### Diagnóstico confirmado

O caminho manual era `manualFromReference` → geração por similares/top/tag → soma
de duplicatas → bônus de tipo/referências/perfil → corte do pool → Spotify →
diversidade. O enriquecimento de tags ocorria depois da pontuação, sem comparar as
tags dos candidatos com a referência. `manualTasteScore` podia acrescentar até 42
pontos positivos ao gosto habitual. Uma consulta de tag genérica fornecia sozinha
score 70 menos posição, antes dos bônus. Repetições da mesma evidência ainda somavam
35% a cada ocorrência. Isso permitia relações culturais/genéricas dominarem a busca.

Na fixture Alfredo, `Smile` entra pela consulta simulada `tag.getTopAlbums(soul)`:
na Beta 1 recebe aproximadamente 156,5 pontos com os bônus e ocupa uma vaga. A Beta 2
registra essa origem e rejeita por falta de evidência específica da referência.
**Não é a reconstrução comprovada da execução real do usuário:** sem respostas/cache
originais, não se pode atribuir a causa exata daquele resultado. As demais relações
musicais fornecidas no relato também não viraram regras por nome.

`scoreAlbumTaste` colapsava bases 15/35/65 em 10, confirmado em teste. O perfil por
obra sobrescrevia o sinal de uma nota com o de um feedback, também confirmado.

### Implementação

- A busca manual pontua a referência específica, sem usar notas/curtidas do perfil
  geral para classificar candidatos. Exclusões, feedback negativo e bloqueios seguem
  ativos. A função antiga de pontuação de gosto permanece sem uso neste caminho.
- Cada candidato conserva referência e origem: similares de artista, similares de
  faixa, tag, artista da referência. Duplicatas unem evidências; não somam pontuação.
- Metadados são comparados antes da resolução Spotify: até 80 candidatos únicos
  recebem tags e até 40 são resolvidos. Last.fm/cache existentes são reutilizados.
- Tags genéricas recebem peso 0,1 no cálculo de sobreposição; específicas, 1. Esses
  valores reduzem a influência de etiquetas amplas sem criar um filtro por gênero.
  Sobreposição é Dice ponderado. Uma tag específica compartilhada pode sustentar
  caminhos entre gêneros diferentes. Metadados ausentes não são diferença musical.
- Score manual: similaridade direta de faixa até 65, relação de artistas até 25,
  tags específicas até 60. Busca explícita por tag preserva sua intenção. Esses pesos
  iniciais colocam relação direta entre faixas acima de relação indireta de artistas;
  não são calibração de qualidade humana nem probabilidades de semelhança acústica.
- Só uma tag genérica não basta para busca de álbum/faixa. Uma relação de artista
  forte pode servir de fallback quando faltam metadados (match >= 0,8); é explicada
  como indireta. Artista como referência admite match >= 0,5, pois esse é seu sinal
  direto. `track.getSimilar` exige match >= 0,3 se não houver outra evidência específica.
  Não há preenchimento obrigatório: score abaixo de 12/evidência insuficiente sai.
- O tipo escolhido tem prioridade em até seis vagas, preservando outros tipos como
  complemento com evidência. Normalmente há um álbum por artista; dois são possíveis
  com sobreposição específica >= 0,65, aplicando desconto de 55% à repetição.
- Instrumentais/sufixo “Beats” recebem fator 0,55 se não houver essa característica
  nas referências; edições deluxe/remaster/live recebem 0,9. São heurísticas de título,
  não verificação de áudio. Não são proibições. Obra-base e versão instrumental não
  ocupam duas vagas da mesma rodada. Nomes como “Beats, Rhymes & Life” não ativam a
  heurística de sufixo. A exclusão de posse/edições equivalentes continua ativa.
- A base personalizada conserva o valor original positivo, sem corte redundante em
  10. Seus sinais já são limitados na construção por sementes/conexões. O ajuste de
  tags continua limitado. Com isso, diferenças de score não são apagadas.
- Nota do Diário mantém 80% do sinal combinado da obra; feedback efetivo contribui
  20%. Feedback sem nota tem força 0,6; curtida continua evidência fraca de obras sem
  avaliação/feedback. Repetições de feedback não somam evidência. Bloqueio continua
  exclusão, independentemente da média do perfil.
- Exploratório prioriza a tag ancorada no perfil/relacionada em cada família antes
  de suas subtags. Candidatos distantes precisam de uma ponte de tags específicas
  positiva com o perfil; ausência de ponte descarta, não exige preencher sua cota.
  Próximos e adjacentes continuam distintos. Não são inventados timbre ou produção.
- DEBUG mostra proveniência, componentes, antes/depois, motivos, diversidade e tempos.
  Interface, controles, formatos e chave de armazenamento permanecem compatíveis.

### Validação

- 20 testes anteriores aprovados, incluindo três modos personalizados, API, feedback,
  homônimos/edições, posse, conhecidos, histórico e sintaxe do DataviewJS completo.
- 8 novos testes aprovados: Alfredo, TPAB, música, artista/tag, independência do gosto
  geral, saturação, combinação de nota/feedback e prioridade de alternativas.
- Na Beta 1, 6 dos 8 novos testes falham como esperado; na Beta 2, todos passam.
- Comparação reproduzível: a fixture de álbum passa de seis resultados (quatro
  artistas, incluindo evidências fracas) para três (dois artistas, com evidência).
  Não há aumento demonstrado de diversidade numérica nessa fixture; há redução
  deliberada de preenchimento sem suporte. Não equivale a melhora de gosto real.
- Hashes verificam Beta 1 preservada, Beta 2 idêntica ao principal e demais módulos
  inalterados. Sem execução em Obsidian ou APIs autenticadas nesta tarefa.

### Checklist manual e limites

1. Comparar Beta 1/Beta 2 em cofres de teste equivalentes. Pesquisar Alfredo e TPAB
   com os mesmos filtros; registrar resultado, evidência, diversidade e interesse.
2. Testar música/artista, referências fora do gosto habitual e múltiplas referências.
   Confirmar que favoritas pessoais não substituem a identidade da referência.
3. Observar buscas com poucas tags, sem tags ou sem resultados: aceitar listas menores,
   conferir falhas reais de API e ausência de avisos por descartes Spotify normais.
4. Conferir instrumentais/edições alternativas, ausência de duas versões da mesma obra,
   posse Spotify/Obsidian, Já conheço, bloqueios, feedback alterado e histórico/Refazer.
5. Gerar rodadas Familiar/Equilibrado/Exploratório, especialmente fora do círculo dos
   artistas mais fortes. Registrar justificativas indiretas e pontes exploratórias.
6. Testar Curtidos, salvar/abrir Spotify, persistência e navegação Desktop/Mobile.
   Medir latência/cache frio e quente; as consultas adicionais podem custar tempo.
7. Ouvir amostras sem mostrar justificativas primeiro. Avaliar interesse e afinidade
   separadamente (1–5), depois julgar a honestidade da explicação. Comparar várias
   rodadas, sem assumir que os resultados antigos devam reaparecer.

As APIs utilizadas fornecem relações colaborativas e tags, não análise de áudio.
Tags específicas também podem ser ruidosas/temáticas e não comprovam sonoridade.
O orçamento pode deixar candidatos relevantes fora. Os limiares podem reduzir cobertura
quando os metadados são pobres. São parâmetros iniciais sujeitos à avaliação do usuário.
Ainda faltam testes reais de SDK, DOM, Obsidian Desktop/Mobile, rede e relevância musical.
Nenhuma correção usa exceções por artista/álbum citado. Nenhuma release foi criada.

## Beta 1 — preservada em 12/11/2026

Snapshot integral da beta contínua recebida, sem alterar bytes ou cabeçalho.
Inclui todas as correções anteriores de feedback, Spotify, perfil híbrido, exploração,
notificações, cache e diagnósticos. Permanece referência histórica imutável.

## Beta 3 — estabilização — 12/11/2026

### Correções confirmadas e escopo

- `generateManual` completava listas com outros tipos. Referências homogêneas de
  álbum/faixa/artista agora filtram tipos antes do enriquecimento e não recebem
  complemento de outro tipo. Referências mistas e pesquisa explícita de tag mantêm
  a seleção mista anterior. Evidências, limiares e diversidade da Beta 2 permanecem.
- `parallel` engolia exceções inesperadas. Agora conta erros internos, registra tipo
  de erro e índice no DEBUG (até 20), mantém resultados dos demais trabalhadores e
  avisa se o erro compromete uma lista incompleta. Falhas identificadas pela camada
  de API não são contadas novamente como erros internos. Não registra mensagens
  arbitrárias de exceção, URLs, respostas ou credenciais.
- Não se confirmou descarte indevido no preenchimento Exploratório: candidatos
  distantes elegíveis entram na primeira passagem; permitir outro na segunda violaria
  o limite existente. A regra da Beta 2 foi preservada. Menos de seis é resultado válido.

### Desempenho

Tipos excluídos deixam de receber metadados. A busca só de artista não consulta
álbuns; a busca só de faixa não amplia por álbuns de artistas. O enriquecimento final
redundante do pool manual foi removido; os selecionados continuam enriquecidos pelo
fluxo de apresentação. Cache Last.fm de promessas e cache Spotify permanecem ativos.

O pool recebe metadados em lotes de concorrência existente. Uma parada antecipada só
ocorre quando há seis artistas diferentes já resolvidos em cache Spotify e seus scores
superam o limite superior conservador de todos os restantes (relação máxima + 60 de
tags, ajustados pela utilidade). Isso evita decidir com base apenas em popularidade ou
encerrar antes de saber se as seis correspondências existem. Cache frio pode continuar
percorrendo os 80 candidatos: não se promete redução universal de chamadas.

DEBUG passa a contar `lastfmRequests`, `spotifyRequests`, `lastfmCacheHits`, acertos
Spotify resolvidos/rejeitados, enriquecidos, exclusões e parada antecipada, além das
métricas anteriores de entregues/tempo. Contadores ausentes significam zero. As consultas
contadas são tentativas reais na camada de transporte; invocações atendidas por cache
não são contadas como novas consultas. Os limites de cache/concorrência não mudaram.

### Compatibilidade V1.8 (`src/Central.md`)

Inspeção dos contratos e testes confirmam leitura da chave `central-descoberta-v12`
como fallback, preservando filtros, referências manuais, modo, conhecidos e históricos.
Ao salvar, a beta escreve em `central-descoberta-v19-beta3-ui`, sem alterar a chave
oficial. Uma instalação com estado beta existente mantém prioridade desse estado;
não ocorre mesclagem automática entre versões/dispositivos. Não há migração destrutiva.

Curtidos continuam no JSON compartilhado, com leitura de array/`items`/`albums` e
escrita compatível versão 2. Feedback continua no Markdown configurável, com histórico
intacto e interpretação efetiva da Beta 2. Exclusões de catálogo local, biblioteca
Spotify, edições equivalentes, conhecidos e bloqueios são preservadas pelas funções
existentes e regressões. Configurações, SDK e chamadas Last.fm continuam nos mesmos
contratos. Busca manual e descoberta personalizada usam o fluxo beta; não se alega
que os modos e controles da V1.8 sejam idênticos à interface beta.

Nenhum formato persistido foi alterado. Essa comparação é estática e simulada; não
comprova funcionamento do SDK instalado ou DOM no Obsidian Desktop/Mobile.

### Validação e limites

20 testes gerais + 8 regressões Beta 2 + 7 de estabilização + integridade = 36 testes
internos aprovados. Os novos casos cobrem tipos homogêneos, referências mistas, cache,
erros isolados e importação V1.8 com conhecidos/curtidos/feedback. As regressões gerais
cobrem falhas de API e Exploratório, inclusive rejeição de distantes sem ponte.
Os snapshots 1/2 mantêm hashes; snapshot 3 corresponde ao principal. Todos os arquivos
em `src/` e a Roleta beta mantiveram hashes. Testes usam mocks, sem credenciais reais.

Antes de promover: testar os três tipos manuais, busca mista e tag no Obsidian; conferir
resultados menores, cache frio/quente, falha parcial/autenticação, filtros, persistência,
Curtidos/Conhecidos e três modos personalizados. Em cofre de teste com estado V1.8,
conferir importação e que a nota oficial continua lendo sua chave original. Verificar
latência e funcionamento Desktop/Mobile. Não há benchmark de rede nem comprovação de
qualidade musical. Beta 3 é candidata à validação de release; publicação depende do usuário.
