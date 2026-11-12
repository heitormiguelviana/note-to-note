> Os snapshots abaixo são históricos da estabilização. O ativo agora é a beta visual
> canônica da raiz; veja `docs/promocao-e-padronizacao.md` a partir da raiz.

# Roleta Musical V1.2 — Betas

Arquivo ativo: `../../Roleta-Beta.md` (Beta 4).

- `Roleta-Musical-V1.2-Beta3.md`: snapshot exato do arquivo recebido como
  `Roleta-Musical-V1.2-Beta3.1.md`. O cabeçalho 3.1 foi preservado nos bytes históricos.
- `Roleta-Musical-V1.2-Beta4.md`: snapshot idêntico ao ativo após estabilização.
- `snapshots.json`: hashes SHA-256 para verificar a preservação.

Não havia outras Betas da Roleta neste checkout; nenhuma foi reconstruída.
Editar somente o arquivo ativo. Não corrigir snapshots antigos nem sobrescrever um
snapshot existente. Qualquer próxima versão requer solicitação do mantenedor;
esta etapa não inicia Beta 5. A oficial `../../src/Roleta.md` permanece V1.1.

Testes sem rede, cofre ou credenciais pessoais:

```sh
node tests/roleta-beta.test.cjs
node --test tests/roleta-beta.test.cjs
```

Os testes extraem funções reais do DataviewJS, com estado e metadados em memória,
PRNG controlado e falhas simuladas de transporte. Não substituem execução no Obsidian.
O changelog documenta a comparação de contratos com V1.1 e o checklist de promoção.
