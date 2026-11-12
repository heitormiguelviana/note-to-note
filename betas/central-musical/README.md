> Os snapshots abaixo são históricos da estabilização. O ativo agora é a beta visual
> canônica da raiz; veja `docs/promocao-e-padronizacao.md` a partir da raiz.

# Versões Beta da Central Musical

`../../Central-Beta.md` é o arquivo de trabalho. Os arquivos deste diretório
são snapshots imutáveis, sem vínculo com os anexos oficiais de releases ou `src/`.
A política de snapshots numerados foi solicitada depois da etapa de beta contínua.

- **Beta 1:** cópia byte a byte da implementação recebida no início desta tarefa,
  inclusive seu cabeçalho original “Central Musical — Beta”. Não editar seu cabeçalho.
- **Beta 2:** cópia byte a byte do arquivo principal após as correções e validação.
- `snapshots.json`: hashes SHA-256 dos snapshots; não regenerar hashes de versões antigas.
- `CHANGELOG.md`: diagnóstico, mudanças, testes e limites de cada versão.

Para a próxima iteração:

1. Conferir o Git e verificar os hashes existentes antes de alterar o principal.
2. Trabalhar apenas em `Central-Musical-Beta.md`, mantendo os snapshots anteriores.
3. Atualizar o cabeçalho do principal para o próximo número, implementar e testar.
4. Copiar os bytes finais para `Central-Musical-Beta-N.md` usando criação exclusiva
   (falhar se o destino já existir), após executar a suíte e revisar o escopo.
5. Registrar o novo hash no JSON, sem modificar entradas anteriores, e documentar
   a versão no changelog. Conferir identidade entre principal e snapshot novo.
6. Executar novamente os testes de integridade. Commits e publicação exigem autorização.

Não instalar duas notas da Central simultaneamente no mesmo cofre de teste. Para
comparar versões, usar cópias isoladas do cofre ou substituir apenas a nota de teste.
As versões compartilham a mesma chave de estado e os formatos de feedback/curtidos.
Nenhuma migração é necessária nesta etapa; o estado local não sincroniza entre aparelhos.

Validação sem rede ou credenciais, a partir da raiz:

```sh
node tests/central-beta.test.cjs
node tests/central-beta2.test.cjs
node --test tests/central-beta.test.cjs tests/central-beta2.test.cjs tests/central-snapshots.test.cjs
node tests/central-beta-comparison.cjs
```

O último comando compara Beta 1 e arquivo de desenvolvimento com fixtures idênticas
e PRNG fixo. As fixtures são simulações, não cópias das respostas reais das buscas
relatadas. Tempos medidos são locais; não representam latência das APIs.

Para reproduzir as falhas de regressão na versão anterior (falhas esperadas):

```sh
CENTRAL_TEST_FILE=betas/central-musical/Central-Musical-Beta-1.md node tests/central-beta2.test.cjs
```

DEBUG continua desativado (`CFG.debug: false`). Para investigar uma busca, ativá-lo
no arquivo de trabalho, executá-la e consultar `window.noteToNoteCentralDebug` no
console do Obsidian. Desativar novamente antes de gerar um snapshot. O diagnóstico
manual mostra fonte, referência, tag da consulta, pontuação original/final, componentes,
inclusão ou descarte por evidência insuficiente. A seleção registra descontos de
diversidade e o tempo de metadados e resolução Spotify. Não inclui tokens/headers/respostas.

## Versão ativa: Beta 3

`Central-Musical-Beta-3.md` é o snapshot de estabilização atual. Betas 1 e 2 continuam
imutáveis. Para executar também os testes novos, acrescente
`tests/central-beta3.test.cjs` ao comando `node --test` acima. O teste de integridade
compara o principal com o último snapshot registrado. Os detalhes de compatibilidade
V1.8, limites de consultas e checklist constam na entrada Beta 3 do changelog.
