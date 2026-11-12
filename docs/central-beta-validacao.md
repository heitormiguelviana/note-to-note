> Esta documentação descreve a etapa anterior (agora Beta 1). O diagnóstico e os
> procedimentos atuais da Beta 2 estão em [CHANGELOG](../betas/central-musical/CHANGELOG.md)
> e [versões Beta](../betas/central-musical/README.md); a política numerada substitui
> a ausência anterior de snapshots.

# Central Musical — Beta contínua

Arquivo de desenvolvimento: `Central-Musical-Beta.md`. A antiga Beta 3 já continha
feedback efetivo por item, média regularizada por artista, validação estrita Spotify,
exclusões e avisos agregados. Esta etapa continua essa implementação. A chave
`central-descoberta-v19-beta3-ui` permanece intencionalmente para ler o estado existente.
Não há mudança nos arquivos de curtidos ou feedback. A renomeação física foi feita
sem sobrescrever outro arquivo. O arquivo anterior era não rastreado pelo Git;
o histórico passará a existir quando o mantenedor autorizar seu versionamento.

## Bugs confirmados

- `resolveSpotifyAlbum()` registrava rejeições de candidatos em `apiIssues`.
  `reportApiIssues()` as apresentava como indisponibilidade mesmo com seis resultados.
  Rejeições agora incrementam apenas contadores. Falhas reais continuam notificadas;
  a mensagem informa quantas recomendações novas foram entregues.
- A exigência de um único ID rejeitava entradas regionais com metadados coincidentes.
  IDs diferentes são aceitos apenas quando título, todos os artistas identificados,
  data de lançamento e quantidade de faixas coincidem. Escolha por ID ordenado torna
  o resultado independente da ordem da API. Isso prova equivalência dos metadados
  disponíveis, não identidade de áudio. Datas/faixas ausentes ou divergentes,
  artistas homônimos com IDs distintos e edições divergentes continuam rejeitados.
- O ranking de artista escolhia a obra antes de avaliar suas tags. A resolução agora
  retém até três obras por artista em um orçamento de até 36 candidatos; a seleção
  final usa as evidências por álbum. Isso pode aumentar chamadas e latência.
- Conexões por várias sementes eram somadas e recebiam outro multiplicador. Agora
  usa-se a melhor conexão mais 25% da média de até duas conexões independentes.

## Interpretação do perfil e pesos iniciais

Notas por artista continuam com duas observações neutras de regularização (5,5).
Curtida de artista pesa mais que de obra. Feedback positivo que já produziu uma
semente não recebe novamente o bônus anteriormente aplicado no fim da geração de
sementes; feedback negativo e bloqueios permanecem ativos.

O perfil por álbum preserva notas positivas e negativas, centradas em 5,5 e escaladas
por 4,5. Feedback efetivo da obra substitui sua evidência nesse perfil de tags;
curtida é usada só quando não há avaliação nem feedback da mesma obra. Não se somam
três sinais sobre a mesma obra. Faixas não são convertidas em avaliações de álbuns.

Até 30 obras são escolhidas em rodadas, no máximo três por artista. Tags locais de
`genre`/`genres` são utilizadas; na ausência, consulta-se `album.getInfo`. Nome e artista
da resposta precisam corresponder à obra pedida. Tags sociais genéricas são filtradas.
Tags são evidência aproximada; não inventamos descritores acústicos, fases ou gêneros.
Para cada tag, primeiro calcula-se a média das obras de cada artista, depois a média
entre artistas, com duas observações neutras. Assim uma discografia extensa não soma
peso proporcional ao número de álbuns.

Pontuação final: afinidade de artistas limitada a 10, mais ajuste de tags entre -4 e 4.
O ranking Last.fm contribui no máximo 0,15 como desempate, contra até 6,75 anteriormente.
Conexões entre obras explicam o ajuste de tags e não são somadas outra vez. O motivo
exibe tags realmente usadas e até duas obras com sobreposição positiva; sem tags,
a pontuação por artista é mantida. Esses pesos são hipóteses iniciais conservadoras,
não parâmetros otimizados com avaliações humanas.

A diversidade tem teto por artista, desconto de até 20% por tags compartilhadas e
até 10% por sementes compartilhadas. Ausência de metadados não produz bônus nem
desconto. Familiar permite dois álbuns por artista e favorece artistas catalogados;
Equilibrado limita a um e favorece artistas novos. Exploratório usa evidência positiva
de tags, relações `tag.getSimilar` e uma família distante ocasional, sem exigir que
as tags do usuário pertençam às famílias predefinidas. O preenchimento não amplia
resultados distantes além de um. Se faltam tags úteis, solicita dados para ancorar
a exploração. Os três modos continuam distintos.

## Testes reproduzíveis

Sem dependências adicionais:

```sh
node tests/central-beta.test.cjs
node --test tests/central-beta.test.cjs
```

`central-harness.cjs` executa as funções reais extraídas do Markdown sem executar a
interface; `central-scenarios.cjs` contém mocks Last.fm/Spotify e PRNG com semente 731.
Nenhum teste requer rede, credenciais reais ou escrita no cofre.
`fixtures/recommendation-reference.json` registra os resultados da versão recebida,
antes da evolução algorítmica, usando as mesmas fixtures. Os testes imprimem a
comparação de contagem, artistas, tags e tempo local. O JSON é referência congelada
de resultados de teste, não uma segunda cópia de desenvolvimento da Central.

Foram aprovados 20 testes: regressões anteriores, avisos indevidos, falhas reais,
equivalência regional, ambiguidades, fases de um artista, evidência redundante,
metadados incompatíveis, pipeline dos três modos, histórico, bloqueios, Já conheço,
compilação DataviewJS, prioridades diferentes entre Familiar/Equilibrado e seleção
de uma obra compatível acima do primeiro resultado de popularidade.
Na fixture integrada, antes/depois mantêm seis resultados e seis artistas por modo.
O modo Exploratório passou a registrar explicitamente distâncias próximas,
adjacentes e uma distante. Os outros modos preservaram três tags distintas nessa
fixture. Isso não demonstra aumento geral de diversidade ou relevância subjetiva.
Os testes verificam zero duplicatas e estabilidade sob a mesma semente; não fazem
benchmark de rede. Tempos locais variam e não são limites de desempenho.

## DEBUG

Defina `debug: true` em CFG e gere uma seleção. Consulte
`window.noteToNoteCentralDebug` no console do Obsidian Desktop. O último diagnóstico
contém contadores de origens, descartes, posse, conhecidos, bloqueios, repetição,
resolução/cache Spotify, falhas de API, pontuações por componente, diversidade,
quantidade entregue e duração. A amostra de pontuações é limitada a 60 candidatos.
São dados em memória; não são escritos no vault. DEBUG vem desligado. Não inclui
URLs de requisição, respostas completas, headers, tokens ou credenciais. Os nomes
musicais só aparecem no diagnóstico optativo. Contadores descrevem etapas, não
necessariamente itens únicos, pois um candidato pode atravessar mais de uma etapa.

## Checklist Obsidian e avaliação humana

Use um cofre de teste e mantenha a Central estável disponível. Copie a beta como nota
DataviewJS; configure as integrações no próprio cofre de teste. Não execute em dados
pessoais sem backup. Requer autorização do responsável para utilizar credenciais reais.

- Abrir em Desktop e Mobile, alternar as quatro seções e voltar aos resultados.
- Conferir que Curtidos, feedback e Já conheço anteriores continuam disponíveis.
- Gerar seis recomendações com candidatos Spotify incompatíveis no pool: não deve
  aparecer aviso de indisponibilidade por causa desses descartes.
- Simular/desconectar APIs: confirmar avisos reais e preservação dos resultados
  anteriores. Se houver entrega parcial nova, conferir a quantidade na mensagem.
- Comparar homônimos, edição original, deluxe/remaster e duplicatas regionais.
- Conferir exclusões de posse Obsidian/Spotify, conhecidos, bloqueios e histórico.
- Repetir/trocar feedback, curtir/descurtir e desfazer Já conheço; reabrir a nota.
- Buscar manualmente por artista, álbum, faixa e tag; testar os filtros e Refazer.
- Abrir/salvar no Spotify e verificar links, capas e biblioteca salva.
- Comparar os três modos com as mesmas referências. Com tags ausentes, verificar
  mensagens honestas e ausência de descritores musicais inventados.
- Medir latência e chamadas em cache frio/quente em catálogo pequeno e grande.

Para avaliar gosto real, registrar 3 rodadas por modo, sem alterar o perfil durante
cada rodada. Ouvir amostras dos álbuns em ordem embaralhada, sem mostrar a origem.
Avaliar separadamente afinidade (1–5), novidade, variedade percebida e desejo de ouvir
inteiro; registrar também erros de identidade, itens conhecidos e explicações falsas.
Comparar medianas e exemplos de rejeição com o comportamento anterior. Só ajustar
pesos após examinar perfis diferentes; métricas de software não comprovam gosto.

## Limites e continuidade

Ainda falta execução real em Obsidian Desktop/Mobile e APIs autenticadas. A extração
de funções testa lógica, não DOM nem comportamento do SDK instalado. A equivalência
regional usa apenas metadados resumidos. Tags podem ser imprecisas e não equivalem a
features acústicas. O orçamento de obras pode deixar de fora fases menos representadas.
O histórico mantém os limites e a política anterior, sem sincronização entre aparelhos.

Próximos passos: avaliar relevância humana, medir custo de rede, expandir fixtures de
metadados e calibrar pesos com esses resultados. A Central continua beta; nenhuma
release, commit, push ou alteração da Roleta/estáveis integra esta etapa.
