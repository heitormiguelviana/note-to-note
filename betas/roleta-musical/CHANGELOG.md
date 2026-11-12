# Roleta Musical V1.2

## Beta 4 — estabilização — 12/11/2026

### Correções

- Removido o ramo de 15% que ignorava ajustes explícitos. O próximo sorteio continua
  probabilístico, mas sempre ponderado pelo ajuste ativo. Sem ajuste, Aleatório e
  Surpresa usam a lógica V1.1 preservada.
- Gênero/estilo usa tags não classificadas como descritores; atmosfera usa descritores
  explícitos (por exemplo, calm, energetic, dark). Metal não implica automaticamente
  energia, pop não implica alegria, e jazz não implica calma. Estilos compostos não
  são removidos do gênero por conter uma palavra descritiva. Taxonomia propositalmente
  pequena: tags não mapeadas não são transformadas em características de áudio.
- Outro gênero consulta a dimensão gênero; Outra sonoridade consulta descritores;
  Mais parecido combina ambas quando disponíveis; Mudar ambos pondera ambas.
  Evidência em apenas uma dimensão é parcial, e não diferença na dimensão ausente.
- Metadados suficientes têm o peso normal; parciais recebem fator 0,25; desconhecidos
  peso baixo 0,05. Todos permanecem elegíveis. Isso favorece evidência sem excluir
  bibliotecas com cobertura pobre. Se não houver informação utilizável, os pesos
  desconhecidos iguais produzem fallback variado. Valores são heurísticos iniciais.
- Diagnóstico substitui percentuais por afinidade alta/moderada/baixa ou informações
  insuficientes. Indica cobertura parcial e tags compartilhadas. Um aviso discreto
  no resultado informa ajuste aproximado quando faltam metadados. Sem análise de áudio.
- Histórico prefere IDs disponíveis e compara também artista principal/título com
  normalização de edição existente. IDs iguais com nomes diferentes e edições de
  títulos equivalentes não repetem antes de esgotar os elegíveis. Histórico permanece
  em memória e continua coerente com os filtros: só os candidatos filtrados entram
  no sorteio; quando todos já passaram, permite novo ciclo.
- Resultado limita a largura a 1100px, preservando CSS de capas e regras mobile.
- Restaurado o botão de pular animação durante o giro: a beta recebida o ocultava,
  diferentemente da V1.1. Pular não altera o vencedor pré-selecionado.

### Compatibilidade e validação

Sete testes automatizados aprovados: sintaxe completa, quatro ajustes, distinção de
metadados, fallback, sorteio livre/Surpresa, histórico por ID/edição, filtros combinados
no acervo local, preferências V1.1, contratos oficiais e falhas de Spotify/Last.fm.
A contagem representa testes agrupados com múltiplas asserções.

Comparação textual confirma funções idênticas à V1.1 para loadState/saveState,
applyFilters/currentPool, filtros de gênero/duração/nota/data/scrobbles, carga Spotify,
carga de gêneros, animação e Surpresa. A chave `roleta-albuns-v03`, caches e formatos
não mudaram. Os controles fixos de áudio/animação já normalizados pela V1.1 continuam
iguais. Offline catalogado depende apenas do acervo, exceto recursos remotos opcionais.
Não houve escrita em notas ou estado real. A Central e arquivos oficiais mantêm hashes.

Ajuste é capturado no início e consumido somente depois de animação e resultado
concluídos com o painel conectado. Sem candidatos, erro ou painel desconectado não o
consomem. Esse fluxo foi inspecionado e verificado estaticamente. Reset e consulta de
histórico preservam a lógica da Beta 3; nenhum histórico persistente foi introduzido.
A consulta de metadados adaptativos mantém o orçamento anterior (até 45 candidatos
mais referência), concorrência/cache e tolerância a falhas.

### Checklist de promoção no Obsidian

1. Abrir V1.1 e Beta 4 sequencialmente em cofre de teste, com as mesmas preferências;
   conferir acervo/Spotify, filtros, links e abertura de notas.
2. Sortear em Aleatório e Surpresa, offline catalogado e modos Não catalogado/Qualquer.
3. Testar cada ajuste, cancelar ajuste, mudar filtros e concluir o giro: confirmar uso
   único. Sem candidatos ou com falha, verificar que ajuste continua pendente.
4. Testar tags ausentes/Last.fm indisponível e falha de Spotify: preservar mensagem
   de falha e fallback local quando aplicável, sem apagar preferências.
5. Conferir ausência de repetição até esgotamento, edições, Rever e Reiniciar sessão.
6. Testar janela larga/estreita e Mobile: capas, botões, rolagem, feedback, animação,
   movimento reduzido, pular giro e áudio. A inspeção CSS não comprova renderização real.

### Veredito e limites

**Apta tecnicamente para promoção à V1.2, após o smoke test acima e aprovação do
mantenedor.** Não foram identificados bloqueadores reais nos testes e na inspeção;
nenhuma promoção foi executada. Ainda falta validação de DOM, áudio, SDK e navegação
em Obsidian real Desktop/Mobile. Os testes não comprovam qualidade musical subjetiva.

Limitações não bloqueadoras: tags ruidosas e de artista como aproximação, cobertura
parcial do Last.fm, taxonomia pequena, identificação por texto quando faltam IDs e
limites do cache. Sem evidência de corrupção/perda de dados. Refinamentos de taxonomia
e otimizações adicionais são opcionais; não motivam automaticamente outra Beta.

## Beta 3 preservada

Snapshot integral da Beta 3.1 recebida. Mantém interface em duas etapas, histórico,
controle de sessão, feedback temporário e diagnósticos originais. Não foi editado.
