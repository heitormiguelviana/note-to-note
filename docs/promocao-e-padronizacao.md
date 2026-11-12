> Registro histórico da etapa visual anterior. A promoção final está em docs/CHANGELOG.md
> e manifest.json da raiz, release v1.3.0; o relato abaixo foi preservado como auditoria.

# Promoção local e padronização visual

## Distribuição e nomes

Não existe manifesto de distribuição no checkout original (busca incluindo subpastas
e arquivos ocultos, exceto `.git`). O manifesto real consumido por Instalador.md e
Configuracoes.md é o asset da release: [manifest.json v1.2.1](https://github.com/heitormiguelviana/note-to-note/releases/download/v1.2.1/manifest.json).
Foi lido e preservado em `docs/references/manifest-v1.2.1.json` como referência histórica,
não como nova entrada do instalador. Não confundir o manifest do plugin CataloguedAt
embutido no Configurador com esse manifesto de distribuição.

| ID | Asset / fonte local | Destino no cofre | Versão publicada consultada | Oficial local após promoção | Beta visual ativa |
|---|---|---|---|---|---|
| central | src/Central.md | Central.md | 1.8 | 1.9 | betas/Central-Beta.md |
| roleta | src/Roleta.md | Roleta.md | 1.1 | 1.2 | betas/Roleta-Beta.md |
| configuracoes | src/Configuracoes.md | Musicas/Sistema/Configurações.md | 2.5.0 | 2.5.0 | betas/Configuracoes-Beta.md |
| diario | src/Diario.Musical.md | Diário Musical.md | 1.3.1 | 1.3.1 | betas/Diario.Musical-Beta.md |
| monitor | src/Monitor.md | Monitor.md | 1.30 | 1.30 | betas/Monitor-Beta.md |
| relatorio | src/Relatorio.md | Relatório.md | 3.6.1 | 3.6.1 | betas/Relatorio-Beta.md |

O gerenciador valida exatamente esses seis nomes/destinos; o bootstrap instala apenas
Configurações. Nenhuma inconsistência de nomes foi encontrada. A diferença entre código
promovido e release remota é intencional: modificar `src/` não instala/pública módulos.
Para futura release será necessário escolher sua versão, gerar manifesto com os hashes
e tamanhos dos assets finais e publicar sob aprovação. Nenhum asset remoto foi alterado.

## Preservação e promoção

`betas/backups/pre-padronizacao/oficiais/` contém os seis arquivos oficiais anteriores,
com nomes originais. `betas-originais/` contém Central-Musical-Beta.md e
Roleta-Musical-Beta.md originais. `index.json` identifica versão, origem e SHA-256 de
cada cópia. São oito backups exatos; históricos existentes não foram sobrescritos.

Central 1.9 e Roleta 1.2 foram geradas das betas estabilizadas antes de aplicar qualquer
CSS novo. Só cabeçalho, identificação da interface e rótulos de estágio mudaram;
identificadores técnicos, estado beta herdado, caches e referências históricas foram
mantidos. “Experimental” como classificação musical continua válido; o rótulo de
ajuste experimental da interface da Roleta foi retirado. Persistência e algoritmos
não mudaram. Os outros quatro oficiais são idênticos aos backups.

Os antigos ativos de desenvolvimento deram lugar aos seis nomes canônicos acima. Testes foram
atualizados para os novos caminhos; testes de snapshots continuam verificando os
bytes históricos nos backups, sem esperar que um design novo seja idêntico à beta
algorítmica antiga. Nenhum novo sistema paralelo de snapshots foi criado.

## Resultado visual por módulo

| Módulo | Mudança aplicada | Preservado |
|---|---|---|
| Central | Tokens, foco, botões, tipografia, cards e gaps de galeria/navegação | Configuração/resultados, busca, gosto, Curtidos, conhecidos e feedback |
| Roleta | Componentes irmãos da Central, sessão/histórico harmonizados, contraste e largura | Álbum destacado, telas, giro, som, filtros e ajustes |
| Configurações | Cards/inputs/nav administrativos consistentes, alvos táteis e foco | Instalação, atualizações, integrações, backups e migrações |
| Diário | Ritmo das listas, cards/controles e hierarquia do catálogo | Busca, filtros, ordenação, métricas e cadastro |
| Monitor | Status e diagnóstico mais consistentes, seções e metadados legíveis | Fila, processamento, integrações e diagnósticos |
| Relatório | Largura, tokens e componentes de dados alinhados; camada CSS delimitada | Gráficos, rankings, análises, tracklists e exportações |

Design system e auditoria: [design-system.md](design-system.md).

## Verificações

`node --test tests/*.test.cjs`: regressões da Central/Roleta, snapshots e oito novos
casos visuais/estruturais. Também `node tests/visual-system.test.cjs` fornece contagem
detalhada. Novos testes compilam os 12 blocos (oficiais e betas), comprovam ausência
de alterações de JavaScript funcional nas seis betas, validam backups/nomes canônicos
e limitam as diferenças da promoção às substituições autorizadas.

A comparação byte a byte preserva componentes e handlers completos, incluindo exportações
/instalação; não é simulação de cliques no DOM. Não havia navegador, dependências de
teste de DOM ou Obsidian no checkout. Não se instalaram dependências obrigatórias novas.
As regras CSS foram inspecionadas para escopo, foco, movimento reduzido e breakpoints.
Não houve uso de cofre pessoal ou credenciais musicais. A única consulta externa foi
à release pública para identificar e baixar o manifesto.

Sem bloqueadores funcionais detectados por essas verificações. Validação visual real,
SDKs e temas/plugins do Obsidian continuam pendentes, conforme checklist do design
system. Os novos designs permanecem betas. Nenhuma release, push, PR ou commit foi feito.
