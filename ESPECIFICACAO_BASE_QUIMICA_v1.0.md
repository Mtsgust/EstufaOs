# Especificação Técnica — Base Química v1.0

**Projeto:** EstufaOS · **Módulo:** Base Química (camada de conhecimento químico)
**Versão do documento:** 1.0 · **Data:** 2026-11-14 · **Status:** **P1–P6 todas resolvidas** — especificação fechada, pronta para implementação da Fase 1
**Próxima ação do OpenCode:** implementar a Fase 1 conforme §17, com testes (§14) antes de qualquer publicação.

---

## 1. Objetivo e escopo

Construir uma base de conhecimento químico **normalizada, rastreável e auditável** que passe a responder, para cada informação técnica, três perguntas: **o que se sabe, de onde veio, e até onde se pode confiar**. A Base Química é uma **camada de leitura** para os módulos existentes (Bulário, Estoque, InsumosInfo, Montador de Caldas) — não substitui nenhum deles.

### 1.1 Entra na v1.0

| # | Entrega |
|---|---------|
| 1 | 13 planilhas `Q_*` com IDs estáveis (§6) |
| 2 | API de leitura e gravação em `Code.gs` (§9) |
| 3 | Cadastro de **evidências** e **documentos** com procedência obrigatória (§7) |
| 4 | **Camada interna de serviços** no backend — sem interface visível (§12) |
| 5 | Integração de **leitura** com Bulário/Estoque/InsumosInfo via vínculos (§11) |
| 6 | Rotina de importação **AGROFIT** com fila e modo simulação (§10) |
| 7 | Testes automatizados + proteção dos dados existentes (§13, §14) |
| 8 | Lote piloto de 20–30 produtos reais (§16) |

### 1.2 NÃO entra na v1.0 (explícito)

- Nenhuma alteração no **algoritmo de compatibilidade** do Montador de Caldas (`analisarPar`/`analisarCalda` em `bulario.html`) — a base fornece conhecimento primeiro; o motor só passa a consultá-la numa fase posterior.
- Nenhuma gravação em estoque, doses, cadastros originais ou biblioteca de caldas.
- Nenhuma importação em massa das autorizações AGROFIT (279 mil linhas — fora de escala do Sheets; ver §10.4).
- Nenhuma regra automatizada tipo "cobre não mistura com fosfato" (§8.4).
- **Nenhuma interface nova** (decisão P4, §19): sem `basequimica.html`, sem item no `sidebar.js`, sem seção/página visível — infraestrutura interna (§12). As interfaces existentes permanecem intactas.
- Nenhum endpoint administrativo (importação, fila, validação) é referenciado pelo frontend público na v1 (§12).

---

## 2. Princípios inegociáveis

1. **Procedência obrigatória:** nenhum dado técnico relevante entra sem evidência (§8). Valores nulos são intencionais — **o sistema nunca inventa valores para preencher lacunas**.
2. **IA pesquisa, extrai e organiza — mas não transforma inferência em fato.** Nível de automação máximo da v1 é D (§8.3); decisões críticas são E (humano).
3. **Documentos originais permanecem acessíveis** (`url`/`arquivoDriveId` em `Q_Documentos`) — na v1 via planilha/campo; sem tela própria (§12).
4. **Atualização não apaga histórico:** toda mudança gera linha em `Q_Historico` (append-only); nova versão de bula é nova linha em `Q_Documentos` com campo `substitui` apontando a anterior.
5. **A Base Química não altera estoque, doses nem cadastros originais** sem ação explícita do usuário — e na v1.0 **não altera nunca** (guarda de código, §9.2).
6. **Indicação de última atualização** de cada informação obrigatória nos dados (`atualizadoEm`, `dataColeta`, `conferidoEm`) — exibição em tela só quando existir (§12).
7. **Divergência é registrada, não resolvida por conveniência** — duas fontes discordantes geram duas evidências e o status `divergente` (§8.3).
8. **IDs estáveis, sem dependência de posição de linha** — pré-requisito para migração futura do Sheets para PostgreSQL (§18).

---

## 3. Arquitetura e infraestrutura

Mantém-se o pilar atual: **Google Sheets (armazenamento) + Apps Script (API) + site estático (GitHub) + GitHub (código, docs, testes)**.

```
FONTES EXTERNAS                     MOTOR (Code.gs + frontend)
MAPA/AGROFIT · Embrapa ·            busca · leitura de PDF (manual,
Fabricantes · FAO/WHO · CIPAC ·     fase 2) · normalização ·
Literatura científica               deduplicação · fila (Q_Pesquisas)
        │                                      │
        └──────────────► BASE QUÍMICA ◄────────┘
                        13 planilhas Q_* (Sheets)
                        IDs estáveis · evidências · auditoria
                              │            │
              leitura (v1) ───┘            └─── leitura (futura, fase 6)
                              ▼
              Bulário · Estoque · InsumosInfo · Montador de Caldas · Biblioteca
```

### 3.1 Decisões de infraestrutura

| Tema | Decisão |
|---|---|
| Armazenamento | Google Sheets, uma planilha por tabela `Q_*` em **pasta privada e independente** no Drive (decisão P5): **não** misturar com as planilhas operacionais; sem compartilhamento público; sem expor estrutura/links do Drive na interface (site vê **só a API**); acesso exclusivamente pelo Apps Script (pasta em Script Properties `BQ_FOLDER_ID`; se vazia, cria na 1ª execução) |
| API | `Code.gs` atual — apenas **adição** de tipos `bq*` (nenhuma alteração dos tipos existentes) |
| Cache | estender o padrão `cacheLer_`/`cacheSalvar_`/`cacheLimpar_` (Code.gs L226–238) aos tipos `bq*` |
| Frontend | **nenhuma página nova** (decisão P4): sem `basequimica.html`, `sidebar.js` intocado; a base serve dados pelo backend existente quando o motor passar a consultá-la (fase 6) — **nenhuma página consome tipos `bq*` na v1** (§12) |
| Service worker | **nenhuma alteração** em `sw.js` — não há página nova; HTML e API já são *network-first* (L44, L32) |
| Busca em lote | usar o endpoint existente `?tipos=a,b,c` (`doGet` L256, `config.js` `buscarLote`) para carregar as 13 tabelas de uma vez |
| Texto vs número | colunas de valor **texto** recebem `setNumberFormat('@')` na criação da planilha (§5.3) |
| Migração futura | todo acesso passa pelo repositório `bqRepo_` (§10.4) — único ponto a trocar por PostgreSQL |

### 3.2 Limites conhecidos do Google Sheets (com os quais o projeto convive)

- **Coerção numérica:** `setValue('1,410')` volta como `1.41` (já observado em `insumosInfo.densidade`). Mitigação: formato texto nas colunas de valor (§5.3).
- **Célula ≤ 50.000 caracteres:** `trechoOriginal` truncado a **5.000** caracteres com marcação `…[truncado]`.
- **Execução do Apps Script ≤ ~6 min:** importação processa **lote por execução** (§10.3).
- **Cotas de `UrlFetchApp`:** importação com controle de orçamento diário (§10.3).
- **Escala:** Sheets é banco inicial, não relacional de grande escala — §19.

---

## 4. Fontes externas (levantamento validado)

### 4.1 MAPA / AGROFIT — fonte oficial prioritária (identidade e registro)

**a) API AgroAPI Embrapa (recomendada para a v1)**

- Base: `https://api.cnptia.embrapa.br/agrofit/v1`
- Documentação: `https://www.portal.agroapi.cnptia.embrapa.br/api-docs/agrofit/v1`
- Endpoints usados na v1:
  - `GET /produtos-formulados` — busca (`q`, `numero_registro`, `marca_comercial`, `praga_nome_cientifico`, `praga_nome_comum`, `page`);
  - `GET /produtos-formulados/{numero_registro}` — detalhe: `marca_comercial[]`, `titular_registro`, `classe_categoria_agronomica[]`, `formulacao`, `ingrediente_ativo[]` (texto), `ingrediente_ativo_detalhado[]` (`ingrediente_ativo`, `grupo_quimico`, `concentracao`, `unidade_medida`, `percentual`), `produto_biologico`, `url_agrofit`, `documentos[]` (`descricao`, `tipo_documento`, `data_inclusao`, `url`, `origem`);
  - `GET /produtos-tecnicos` e `GET /produtos-tecnicos/{numero_registro}` (mesmo formato).
- **Autenticação (testada em 2026-11-14):** header `Authorization: Bearer <token>` — token P1 obtido e validado (`/versao` → 200; sem token → 401; `/produtos-formulados?q=…` → 200 com dados). Armazenar em **Script Properties** (`AGROAPI_TOKEN`), **nunca** no repositório (cópia local fora do git). Se a resposta virar 401, o token expirou (padrão WSO2: 60 min, ou indeterminado se gerado com validity -1) — renovar no portal AgroAPI (APPLICATIONS → Show Keys) ou migrar para OAuth 2.0 `client_credentials` com Consumer Key + Consumer Secret.
- **Plano gratuito: 100 mil requisições/mês.** Acesso pela plataforma AgroAPI (cadastro) — **P1 resolvida**.
- Vantagem: JSON direto, consulta dirigida, traz links de bula/rótulo.

**b) Dados abertos CKAN (fonte complementar / auditoria)**

- Conjunto: `https://dados.agricultura.gov.br/dataset/sistema-de-agrotoxicos-fitossanitarios-agrofit`
- CSVs: `agrofitprodutosformulados.csv`, `agrofitprodutostecnicos.csv` (download direto no conjunto; UTF-8; licença CC-BY; atualização **diária** declarada).
- Metadados programáticos: `https://dados.agricultura.gov.br/api/3/action/package_show?id=sistema-de-agrotoxicos-fitossanitarios-agrofit` (`metadata_modified`, `resources[].last_modified`) — usar para checar data da última exportação antes de auditar.
- **O CSV de formulados tem centenas de MB** — **não** será baixado pelo Apps Script; serve para conferência externa/offline e para o módulo de auditoria futura.

**c) AGROFIT consulta pública:** `https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons` (verificação humana pontual; não é API).

> **Distinção obrigatória:** AGROFIT é referência de **identidade e registro** (produto, ingrediente, concentração, formulação, titular, culturas autorizadas, documentos). **Não é base de compatibilidade de misturas.** Nunca citar AGROFIT como evidência de interação — regra registrada nos dados (`fonteTipo=registro_mapa` só em blocos de identidade).

### 4.2 Outras fontes (seeds de `Q_Documentos`, §6.7)

| Fonte | Uso | Observação |
|---|---|---|
| Embrapa (Infoteca-e) — *Tecnologia de aplicação de defensivos agrícolas* (2006) | calda, formulações, pulverização, tecnologia de aplicação | https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/426350 |
| Embrapa (Infoteca-e) — *Uma nova proposta para a tecnologia de aplicação de defensivos agrícolas* | tecnologia de aplicação | https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/967185 |
| Embrapa — *Manual técnico para subsidiar a mistura em tanque de agrotóxicos e afins* (2021) | física/química da calda, teste da jarra, armazenamento | **única referência ainda sem link** (a confirmar) |
| FAO/WHO — Manual de especificações de pesticidas, 3ª ed. (2025) | identidade/teor, propriedades físico-químicas, estabilidade | https://extranet.who.int/prequal/vector-control-products/manuals-development-and-use-faowho-specifications-pesticides · https://www.who.int/publications/b/81994 · https://extranet.who.int/prequal/vector-control-products/who-specifications-pesticides |
| CIPAC — site oficial + instruções para elaboração de métodos | qualidade de formulação — **não é tabela de compatibilidade** | https://www.cipac.org/ · https://www.cipac.org/images/pdf/methods1.pdf |
| MAPA — fertilizantes: legislação, manual de métodos oficiais, métodos da Rede LFDA | garantias nutricionais, classificação, métodos analíticos | https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/fertilizantes/legislacoes · https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/fertilizantes/legislacao/manual-de-metodos_2017_isbn-978-85-7991-109-5.pdf · https://www.gov.br/agricultura/pt-br/assuntos/lfda/legislacao-metodos-da-rede-lfda/fertilizantes-corretivos-substratos-e-inoculantes |
| Fabricantes (bula/ficha/rótulo) | doses, restrições, cuidados de mistura, propriedades | sempre com `documentoId` |
| Literatura revisada por pares | interações específicas | **estudo que testou a combinação exata pesa mais** que publicação genérica (§8.4) |

---

## 5. Modelo de dados

### 5.1 IDs e convenções

- **Formato:** `<PREFIXO>_<uuid>` — ex.: `QPROD_3f2a…`, `QEVID_9c1b…`. Autoexplicativo, sem colisão, estável sob export/import (diferente de `000001` sequencial, que quebra com exclusão/ordenação).
- Geração: `Utilities.getUuid()` (mesmo padrão do `doPost` atual, L402).
- IDs **nunca são reutilizados**; exclusão é *soft delete* (§10.3).
- Nomes normalizados usam a mesma regra do sistema: `chave_()`/`norm_()` (Code.gs L145, L190) — `Q_Produtos.nomeNormalizado` e `Q_Ingredientes.nomeNormalizado` seguem essa normalização para deduplicação.
- Datas: gravadas como `Date` do Sheets (padrão atual); `dataColeta`/`atualizadoEm` sempre preenchidos (princípio 6 do §2 — valem para a exibição futura, §12).
- Colunas de controle presentes em **todas** as tabelas `Q_*`: `id`, `dataCriacao`, `excluido` (`true`/`''`), `obs`.

### 5.2 Tipos de dados

| Tipo | Regra |
|---|---|
| `texto` | string livre; colunas `valor*` em formato `@` (§5.3) |
| `numero` | number do Sheets (aceitar coerção; exibir com vírgula decimal) |
| `id` | `PREFIXO_uuid` (§5.1) |
| `data` | Date do Sheets |
| `enum` | conjunto fechado — violação rejeitada pela API (§9.2) |
| `bool` | `true` / `''` |

### 5.3 Regra anti-coerção (crítica)

Na **criação** de cada planilha `Q_*`, aplicar `getRange(1,1,maxRows,maxCols).setNumberFormat('@')` nas colunas `texto` (em especial `valor`, `valorMin`, `valorMax`, `condicao`, `consulta`, `trechoOriginal`) **antes** da primeira gravação — e reforçar no `getSheet_` de criação. Sem isso, `'1,410'` vira `1.41` e `'100'` vira `100` (comportamento já observado em `insumosInfo`).

---

## 6. Estrutura exata das planilhas `Q_*`

> Todas têm as colunas de controle de §5.1. Abaixo só as colunas próprias. Ordem = ordem das colunas na planilha.

### 6.1 `Q_Produtos` (prefixo `QPROD_`) — identidade comercial

| Coluna | Tipo | Obrig. | Observações / enum |
|---|---|---|---|
| id | id | ✓ | `QPROD_…` |
| dataCriacao | data | ✓ | |
| nomeComercial | texto | ✓ | ex.: "Score" |
| nomeNormalizado | texto | ✓ | `chave_(nomeComercial)` — deduplicação |
| fabricante | texto | | titular/comercial (ex.: "Syngenta") |
| titularRegistro | texto | | nome legal no MAPA (AGROFIT `titular_registro`) |
| categoria | enum | | `Fungicida` `Inseticida` `Acaricida` `Herbicida` `Fertilizante` `Bioestimulante` `Adjuvante` `Condicionador` `Biológico` `Outros` |
| classeAgronomica | texto | | AGROFIT `classe_categoria_agronomica` (ex.: "Fungicida") |
| formula | texto | | código da formulação (SC, WG…) — FK lógico p/ `Q_Formulacoes.codigo` |
| registroMAPA | texto | | número de registro AGROFIT (manter como **texto**, com zeros) |
| produtoBiologico | bool | | AGROFIT `produto_biologico` |
| classeToxicologica | texto | | ex.: "III - Pouco perigoso" |
| classeAmbiental | texto | | ex.: "II - Produto Muito Perigoso…" |
| origemEstoqueId | id | | **vínculo** com linha de `estoque` (§12) — vazio se não houver |
| origemInfoId | id | | **vínculo** com linha de `insumosInfo` (§12) |
| statusValidacao | enum | ✓ | `pendente` `em_revisao` `validado` `divergente` `rejeitado` (padrão `pendente`) |
| ultimaRevisao | data | | data da última aprovação humana |
| dataColetaMAPA | data | | quando o registro veio do AGROFIT |
| excluido | bool | | soft delete |
| obs | texto | | |

### 6.2 `Q_Ingredientes` (prefixo `QING_`) — substâncias

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QING_…` |
| dataCriacao | data | ✓ | |
| nome | texto | ✓ | ex.: "flutriafol", "Pentóxido de fósforo (P2O5)"? — **não**: ver §6.2.1 |
| nomeNormalizado | texto | ✓ | `chave_(nome)` |
| tipo | enum | ✓ | `ativo` `nutriente` `adjuvante` `microorganismo` `outro` |
| grupoQuimico | texto | | ex.: "triazol" (AGROFIT `grupo_quimico`) |
| cas | texto | | número CAS quando conhecido — identidade forte p/ deduplicação |
| unidadePadrao | texto | | unidade típica de concentração (g/L, %…) |
| statusValidacao | enum | ✓ | igual §6.1 |
| ultimaRevisao | data | | |
| excluido | bool | ✓ | |
| obs | texto | | |

#### 6.2.1 Regra de identidade de ingrediente
Um ingrediente é a **substância** ("mancozeb", "abamectina", "ácido acético"), não a mistura comercial nem a garantia ("P2O5 30%"). `Q_Produto_Ingredientes` liga substância a produto com concentração. Nomes de garantias nutricionais pertencem a `Q_Produtos.garantias`-equivalente via `Q_Propriedades`/`Q_Produtos` — não criam ingrediente falso.

### 6.3 `Q_Produto_Ingredientes` (prefixo `QPI_`) — relação N:N

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QPI_…` |
| dataCriacao | data | ✓ | |
| produtoId | id | ✓ | → `Q_Produtos.id` |
| ingredienteId | id | ✓ | → `Q_Ingredientes.id` |
| concentracao | numero | | ex.: 125 |
| unidade | texto | | "g/L", "%", "g/kg", "UFC/g"… (texto p/ aceitar "1,5") |
| percentual | numero | | % no produto, quando informado |
| ordem | numero | | posição na lista do rótulo/AGROFIT |
| evidenciaId | id | ✓ | → `Q_Evidencias.id` (§8.1) |
| statusValidacao | enum | ✓ | |
| excluido | bool | ✓ | |
| obs | texto | | |

**Restrição única:** `(produtoId, ingredienteId)` sem duplicata — verificada em teste (§14.1) e na API (§9.2).

### 6.4 `Q_Formulacoes` (prefixo `QFORM_`) — dicionário (seed na criação)

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QFORM_…` |
| dataCriacao | data | ✓ | |
| codigo | texto | ✓ | `SC` `WG` `WP` `EC` `SL` `OD` `SE` `FS` `GR` `SG` `ME` `AS` `LS` `SL` `EW` `SC`… — único |
| nome | texto | ✓ | "Suspensão concentrada"… |
| ordemMistura | numero | | peso heurístico para recomendação de ordem — **v1: preenchido, motor atual não lê** (§1.2) |
| caracteristicas | texto | | descrição neutra (ex.: "partículas sólidas finas em suspensão") |
| cuidadoGeral | texto | | texto factual de literatura técnica, sempre com evidência se crítico |
| fonteInfo | texto | | ex.: "Manual Embrapa mistura em tanque (2021)" |
| conferidoEm | data | | |
| excluido | bool | ✓ | |
| obs | texto | | |

> **V1 não escreve regra de compatibilidade aqui.** `ordemMistura` existe apenas como dado; o motor do montador continua inalterado (§1.2).

### 6.5 `Q_Propriedades` (prefixo `QPROP_`) — dado físico-químico atual

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QPROP_…` |
| dataCriacao | data | ✓ | |
| entidadeTipo | enum | ✓ | `produto` `ingrediente` |
| entidadeId | id | ✓ | → `Q_Produtos.id` ou `Q_Ingredientes.id` |
| campo | enum | ✓ | `ph` `densidade` `solubilidade` `naturezaFisica` `estabilidade` `miscibilidade` `durezaAgua` `ce` `pontoDeCongelamento` `viscosidade` `outro` |
| valor | texto | | **formato `@`**; null = desconhecido (nunca inventar) |
| valorMin | texto | | intervalo (ex.: "150") — `@` |
| valorMax | texto | | intervalo (ex.: "300") — `@` |
| unidade | texto | | "g/mL", "mS/cm", "uT"… |
| condicao | texto | | ex.: "20 °C, água deionizada" — `@` |
| status | enum | ✓ | `pendente` `aprovado` `divergente` `rejeitado` |
| evidenciaId | id | ✓ | evidência **principal** (§8.1) |
| dataColeta | data | ✓ | |
| atualizadoEm | data | ✓ | última alteração (princípio 6 do §2) |
| excluido | bool | ✓ | |
| obs | texto | | |

**Chave lógica:** `(entidadeTipo, entidadeId, campo, condicao)` — uma propriedade por condição; discordância entre fontes vira `status=divergente` (§8.3), **não** uma terceira linha silenciosa.

### 6.6 `Q_Evidencias` (prefixo `QEVID_`) — procedência (coração da rastreabilidade)

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QEVID_…` |
| dataCriacao | data | ✓ | |
| entidadeTipo | enum | ✓ | `produto` `ingrediente` `produto_ingrediente` `propriedade` `restricao` `cultura` `interacao` `formulacao` |
| entidadeId | id | ✓ | id da entidade suportada |
| campo | texto | ✓ | qual dado sustenta (ex.: `dose`, `ph`, `identidade`) |
| valor | texto | | valor atestado por esta fonte (`@`) |
| unidade | texto | | |
| fonteTipo | enum | ✓ | `registro_mapa` `bula` `rotulo` `ficha_tecnica` `documento_do_fabricante` `manual_tecnico` `estudo_cientifico` `especificacao_oficial` `usuario` `importacao` |
| fonteNome | texto | | ex.: "AGROFIT/MAPA", "Biolchim PHOSFIK PK PDF" |
| documentoId | id | | → `Q_Documentos.id` (preferível quando existe) |
| documentoUrl | texto | | URL direta quando não há linha em `Q_Documentos` |
| pagina | texto | | "p. 3", "aba Composição" |
| trechoOriginal | texto | | citação literal ≤ 5.000 chars (`…[truncado]`) — `@` |
| dataDocumento | data | | data do documento |
| dataColeta | data | ✓ | quando coletamos |
| confiabilidade | enum | ✓ | `alta` `media` `baixa` `pendente` (§8.4) |
| status | enum | ✓ | `pendente` `aprovado` `rejeitado` `divergente` |
| revisadoPor | texto | | `usuario` / `ia:import_agrofit` / vazio = não revisado |
| revisadoEm | data | | |
| excluido | bool | ✓ | |
| obs | texto | | |

### 6.7 `Q_Documentos` (prefixo `QDOC_`) — bulas, fichas, estudos

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QDOC_…` |
| dataCriacao | data | ✓ | |
| tipo | enum | ✓ | `bula` `rotulo` `ficha_tecnica` `estudo` `manual` `registro` `especificacao` |
| titulo | texto | ✓ | |
| autorFabricante | texto | | |
| url | texto | | link original — **sempre preservado** |
| arquivoDriveId | texto | | cópia no Drive quando baixado (fase 2) |
| dataDocumento | data | | |
| versao | texto | | ex.: "28.06.2023" (vem do AGROFIT) |
| fonte | enum | ✓ | `agrofit` `fabricante` `embrapa` `faowho` `cipac` `mapa` `outro` |
| dataColeta | data | ✓ | |
| substitui | id | | id do documento anterior (cadeia de versões — nunca sobrescrever) |
| status | enum | ✓ | `identificado` `baixado` `validado` `obsoleto` |
| excluido | bool | ✓ | |
| obs | texto | | |

### 6.8 `Q_Restricoes` (prefixo `QREST_`) — limitações de bula/fabricante

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QREST_…` |
| dataCriacao | data | ✓ | |
| produtoId | id | ✓ | → `Q_Produtos.id` |
| tipo | enum | ✓ | `carencia` `restricao_cultura` `restricao_alvo` `incompatibilidade_bula` `mistura_restrita` `observacao` |
| texto | texto | ✓ | citação do texto da bula (`@`) |
| documentoId | id | | → `Q_Documentos.id` |
| evidenciaId | id | ✓ | |
| status | enum | ✓ | `pendente` `aprovado` `divergente` `rejeitado` |
| excluido | bool | ✓ | |
| obs | texto | | |

### 6.9 `Q_Culturas` (prefixo `QCULT_`) — autorizações/condições por cultura

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QCULT_…` |
| dataCriacao | data | ✓ | |
| produtoId | id | ✓ | → `Q_Produtos.id` |
| cultura | texto | ✓ | ex.: "Tomate" |
| estadio | texto | | ex.: "enflorescimento" |
| doseReferencia | texto | | texto da bula/AGROFIT (`@`) |
| condicao | texto | | condições de uso (`@`) |
| documentoId | id | | |
| evidenciaId | id | ✓ | |
| status | enum | ✓ | `pendente` `aprovado` `divergente` `rejeitado` |
| excluido | bool | ✓ | |
| obs | texto | | |

**Chave lógica:** `(produtoId, cultura, estadio)`.

### 6.10 `Q_Interacoes` (prefixo `QINT_`) — o coração da análise futura

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QINT_…` |
| dataCriacao | data | ✓ | |
| tipo | enum | ✓ | `incompatibilidade_fisica` `incompatibilidade_quimica` `compatibilidade` `observacao_condicionada` `antagonismo` `sinergismo` `neutro` |
| efeito | texto | ✓ | o que foi observado (`@`) |
| condicoesEnsaio | texto | | água, temperatura, proporção, tempo (`@`) |
| concentracao | texto | | (`@`) |
| proporcao | texto | | ex.: "1:1" (`@`) |
| culturasAvaliadas | texto | | |
| formulacoesEnvolvidas | texto | | ex.: "SC + EC" |
| limitacoesEstudo | texto | | **obrigatório preencher quando conhecido** (`@`) |
| grauConfianca | enum | ✓ | `alto` `medio` `baixo` `teorico` (§8.4) |
| validacao | enum | ✓ | `pendente` `revisado` `validado` `refutado` |
| evidenciaId | id | ✓ | estudo/documento principal |
| fonteTipo | texto | | resumo da origem |
| dataEstudo | data | | |
| excluido | bool | ✓ | |
| obs | texto | | |

**Componentes em tabela separada** — decisão de projeto (13ª planilha; o plano original previa só `Q_Interacoes`, mas exige relações de 3+ componentes, o que em planilha achatada vira JSON não consultável):

### 6.11 `Q_Interacoes_Componentes` (prefixo `QIC_`)

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QIC_…` |
| dataCriacao | data | ✓ | |
| interacaoId | id | ✓ | → `Q_Interacoes.id` |
| ordem | numero | ✓ | 1, 2, 3… (ordem de menção/adição) |
| entidadeTipo | enum | ✓ | `produto` `ingrediente` |
| entidadeId | id | ✓ | |
| papel | enum | ✓ | `ativo` `adjuvante` `nutriente` `outro` |
| excluido | bool | ✓ | |

- Par = 2 linhas; mistura completa = N linhas (N ≥ 2).
- **Nunca deduzir mistura segura a partir de pares OK** — regra mantida no motor atual e documentada aqui para a integração futura (§1.2, §17 fase 6).

### 6.12 `Q_Historico` (prefixo `QHIST_`) — auditoria append-only

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QHIST_…` |
| dataHora | data | ✓ | |
| entidadeTipo | texto | ✓ | tabela/entidade atingida |
| entidadeId | id | ✓ | |
| campo | texto | ✓ | campo alterado |
| valorAnterior | texto | | (`@`) |
| valorNovo | texto | | (`@`) |
| acao | enum | ✓ | `criar` `alterar` `aprovar` `rejeitar` `importar` `excluir` `restaurar` `divergencia` |
| autor | texto | ✓ | `sistema` `ia:<fluxo>` `usuario` |
| origem | enum | ✓ | `api` `import_agrofit` `ui` `pesquisa` |
| motivo | texto | | |
| obs | texto | | |

**Nunca editável nem excluível pela API** (§10.3). Toda `update` em `Q_*` gera automaticamente uma linha por campo alterado.

### 6.13 `Q_Pesquisas` (prefixo `QPESQ_`) — fila do motor de pesquisa

| Coluna | Tipo | Obrig. | Observações |
|---|---|---|---|
| id | id | ✓ | `QPESQ_…` |
| dataAbertura | data | ✓ | |
| entidadeTipo | enum | ✓ | `produto` `ingrediente` `interacao` |
| entidadeId | id | ✓ | |
| prioridade | enum | ✓ | `1` `2` `3` |
| estado | enum | ✓ | §9.2 |
| fonteAlvo | enum | ✓ | `agrofit` `fabricante` `embrapa` `literatura` |
| consulta | texto | | termo montado (`@`) |
| documentoIdentificadoId | id | | preenchido no passo 3 |
| resumoResultado | texto | | (`@`) |
| tentativas | numero | | |
| ultimoErro | texto | | (`@`) |
| dataAtualizacao | data | ✓ | |
| dataConclusao | data | | |
| execucaoPor | texto | | `sistema` / `usuario` |
| excluido | bool | ✓ | |
| obs | texto | | |

---

## 7. Evidência, divergência e validação

### 7.1 Regra de ouro

> `Q_Propriedades`, `Q_Produto_Ingredientes`, `Q_Restricoes`, `Q_Culturas` e campos críticos de `Q_Produtos` (`registroMAPA`, `formula`, `classeAgronomica`) **só aceitam gravação com `evidenciaId` apontando linha existente em `Q_Evidencias`** — a API rejeita sem evidência (§9.2). Exceção: criação da entidade em estado `pendente` (linha entra vazia/pending e é preenchida junto com a evidência).

### 7.2 Ciclo de vida de uma informação

```
coletado ──► Q_Evidencias(status=pendente)
              │  (fonte + documento + trecho + data)
              ▼
        revisão humana (nível E)
        ┌─────┴──────┐
   aprovado        rejeitado
        │             │
        ▼             ▼
  Q_Propriedades   Q_Historico(acao=rejeitar)
  status=aprovado  valor permanece nulo/anterior
```

Importação automática (AGROFIT) pode criar evidências já em `aprovado` para **identidade/registro** (fonte oficial, nível C/D), mas **nunca** para interações.

### 7.3 Divergência (duas fontes discordam)

1. Nova evidência recebe `status=divergente`.
2. A `Q_Propriedades` correspondente muda para `status=divergente` — **o valor atual não é sobrescrito silenciosamente**.
3. `Q_Historico` recebe `acao=divergencia` com os dois valores.
4. Decisão humana grava `aprovar`/`rejeitar` (nível E) — consulta pelas próprias planilhas `Q_*` ou por chamada interna; sem tela na v1 (§12).

### 7.4 Pesos de evidência (`grauConfianca` / `confiabilidade`)

| Situação | Peso |
|---|---|
| Estudo com os **dois produtos comerciais exatos** (mesma formulação, mesma marca) | `alto` |
| Estudo com os **mesmos ingredientes ativos, formulações diferentes** | `medio` — nunca prova compatibilidade de marcas |
| Estudo com **ingredientes isolados** | `baixo` |
| **Conhecimento teórico** sobre possível reação | `teorico` |
| Texto de bula/fabricante sobre cuidado de mistura (não é estudo) | `media`/`alta` para **restrição**; `media` para efeito de eficácia |

Regra de exibição (para qualquer consumidor futuro): a **situação da evidência** sempre ao lado da conclusão (ex.: "compatível — só parcial: estudo com ativos isolados").

---

## 8. Motor de pesquisa automática (`Q_Pesquisas`)

### 8.1 Fluxo (7 passos do plano)

```
1 identificar produto incompleto   → estado=pendente (prioridade 1-3)
2 pesquisar fontes prioritárias    → estado=pesquisando   (AGROFIT > fabricante > científicas)
3 identificar documento correto    → estado=identificando (conferir nome, fabricante,
                                                           registro, apresentação, versão)
4 extrair informações              → estado=extraindo     (PDF/texto/tabelas)
5 validar consistência             → estado=validando     (unidades, concentração,
                                                           identidade, divergências)
6 registrar evidências             → QEVID + QDOC (se aplicável)
7 aprovar ou encaminhar            → estado=concluido | revisao | erro
```

### 8.2 Estados de `Q_Pesquisas.estado`

`pendente` → `pesquisando` → `identificando` → `extraindo` → `validando` → (`concluido` | `revisao`) · `erro` · `cancelado`
Transições ilegais rejeitadas pela API (testadas, §14.1).

### 8.3 Níveis de automação — a v1 chega no D, nunca sozinha no E

| Nível | Função | v1.0 |
|---|---|---|
| A | Pesquisa e identificação automática | ✓ (AGROFIT por registro/nome) |
| B | Extração automática de documentos | parcial (metadados + link do documento; texto de PDF = fase 2) |
| C | Organização e comparação de informações | ✓ (normalização, deduplicação, divergência detectada) |
| D | Avaliação de evidências pelo motor | ✓ (pesos da §7.4, **sem** concluir compatibilidade) |
| E | Revisão humana de dados críticos | **sempre** para interações, mudanças de `statusValidacao` para `validado`, e resolução de divergências |

**Teto automático:** nenhuma rotina da v1 grava `Q_Interacoes` com `validacao=validado` nem altera status de produto para `validado` sem `revisadoPor` humano.

### 8.4 Módulos de conhecimento (fase 5 do cronograma — estrutura já prevista)

`Q_Interacoes.tipo`/`campos` cobrem os módulos do plano: pH e hidrólise · solubilidade · dureza da água · complexação · oxidação-redução · formulações · estabilidade física · nutrição vegetal · fitotoxicidade (tomate/pepino) · eficácia biológica. A v1 **não popula regras** — apenas garante que quando populem, cada uma terá evidência, condições e limitações.

---

## 9. API (`Code.gs`)

### 9.1 Leitura — novos tipos no `doGet`

Adicionar ao objeto `SHEETS` (mesmo padrão dos tipos existentes):

```
bqProdutos, bqIngredientes, bqProdIngredientes, bqFormulacoes, bqPropriedades,
bqEvidencias, bqDocumentos, bqRestricoes, bqCulturas, bqInteracoes,
bqIntComponentes, bqHistorico, bqPesquisas
```

- `?tipo=bqProdutos` → lista (serializer atual `sheetToJSON_`).
- `?tipos=bqProdutos,bqIngredientes,…` → lote em 1 chamada (já suportado, L256).
- `?tipo=bqVisao&id=<QPROD_…>` → **endpoint agregado** (novo, handler especial): produto + ingredientes + propriedades + evidências + restrições + culturas + interações onde participa + documentos. Na v1 é **ferramenta de consulta interna/teste**; consumidores de frontend só a partir da fase 6 (§12).

### 9.2 Gravação — `doPost` com guarda

Mantém o contrato `{tipo, action:'add'|'update'|'delete', id?, data:{}}`. Regras novas **só** para tipos `bq*`:

| Regra | Comportamento |
|---|---|
| Guarda de escopo | handlers `bq*` só abrem planilhas com nome iniciado em `Q_` — função `bqSheet_(nome)` lança erro caso contrário (§14.5) |
| Evidência obrigatória | `add` sem `evidenciaId` válido → `{ok:false, error:'evidencia_obrigatoria'}` (§7.1); em tabelas de evidência obrigatória, `update` de **campo técnico** (qualquer chave fora de `status`/`validacao`/`obs`/`excluido`/carimbos) também exige `evidenciaId` ou `evidencia` inline — `status` muda via `revisar`, `obs` é livre |
| Enum | valor fora do conjunto fechado → `{ok:false, error:'enum_invalido', campo, valor}` |
| Duplicata | `QPI` com `(produtoId, ingredienteId)` repetido → `{ok:false, error:'duplicata'}` |
| Chave lógica de propriedade | `add` em `Q_Propriedades` com `(entidadeTipo, entidadeId, campo, condicao)` já existente **nunca** cria 3ª linha: mesmo valor → `{ok:true, reusado:true}` (evidência nova registrada como suporte); valor diferente → `{ok:true, divergente:true}` com status da linha existente → `divergente` e **valor preservado** (§6.5/§7.3) |
| Histórico | cada `update` grava `Q_Historico` (por campo alterado) automaticamente; `add` grava `acao=criar` |
| Soft delete | `delete` em `Q_*` = `excluido=true` + histórico `acao=excluir`; **nunca** `sheet.deleteRow` |
| Histórico protegido | `tipo='bqHistorico'` com qualquer `action` → `{ok:false, error:'somente_leitura'}` |
| Integridade referencial | `produtoId`/`ingredienteId`/`evidenciaId` inexistentes → erro (nunca linha órfã); `Q_Propriedades.entidadeId` precisa apontar para produto/ingrediente **não excluído** → `{error:'referencia_invalida', campo:'entidadeId'}` (add e update) |
| Enum de transição | `Q_Pesquisas.estado` só aceita transições da §8.2 |
| Cota de escrita | `update` em `Q_Historico` nunca é `force` — não existe `force` na v1 |

### 9.3 Importação (ações especiais, POST)

| Ação | Payload | Efeito |
|---|---|---|
| `bqAgrofitSync` | `{tipo:'bqPesquisas', action:'agrofit', data:{numeroRegistro?, nome?, simular:true?}}` | monta `QPESQ` e, se `simular:false`, executa o lote (§10.3) |
| `bqFilaProcessar` | `{tipo:'bqPesquisas', action:'processar', data:{limite:20}}` | processa até N itens da fila respeitando tempo/cota (§10.3) |
| `bqVincular` | `{tipo:'bqProdutos', action:'vincular', data:{produtoId, origemEstoqueId?, origemInfoId?}}` | cria vínculo com cadastro existente + histórico |
| `bqFichaImport` (Fase 4) | `{tipo:'bqPropriedades', action:'ficha', data:{linhas:[…], simular:true?, limite?}}` | importa produto + documento (dedup por URL) + propriedades físico-químicas (§6.5) a partir das **linhas do cadastro enviadas no payload** — o servidor nunca lê a aba de origem (§14.5); sem fonte utilizável não nasce propriedade (§4.2); re-execução idempotente (§10.3): produto por `origemInfoId`/nome, evidência idêntica pulada |
| `bqRevisar` (Fase 4) | `{tipo:'bqPropriedades', action:'revisar', data:{id, decisao:'aprovar'\|'rejeitar', motivo?, obs?}}` | revisão humana de nível E: status da propriedade **e** da evidência vinculada + carimbos `revisadoPor`(padrão `usuario`)/`revisadoEm` + histórico `aprovar`/`rejeitar` — o **valor nunca é alterado** (§7.4) |

### 9.4 Camada de acesso `bqRepo_`

Toda função nova conversa **só** com `bqRepo_` (`bqRepo_.ler(tipo)`, `bqRepo_.gravar(tipo, linha)`, `bqRepo_.historico(…)`). Nenhum handler `bq*` chama `getSheet_` diretamente. Isso isola a migração futura para PostgreSQL (§19): troca-se `bqRepo_` inteira sem tocar nos handlers.

---

## 10. Importação AGROFIT

### 10.1 Fonte escolhida

**API AgroAPI Embrapa** (JSON dirigido, 100k req/mês) para a v1; CKAN CSV (§4.1b) só para auditoria offline. Motivo do não-uso do CSV no Apps Script: tamanho (centenas de MB) × limite de execução/cota.

**Autenticação:** `Authorization: Bearer <AGROAPI_TOKEN>`, lido de `PropertiesService.getScriptProperties()` — token validado em 2026-11-14, nunca hardcoded nem commitado.

### 10.2 O que a v1 importa (por produto)

| Bloco AGROFIT | Destino | Evidência |
|---|---|---|
| `numero_registro`, `marca_comercial`, `titular_registro`, `classe_categoria_agronomica`, `formulacao`, `produto_biologico`, `classe_toxicologica`, `classe_ambiental` | `Q_Produtos` | 1 `QEVID` bloco `identidade`, `fonteTipo=registro_mapa`, `documentoUrl=url_agrofit` |
| `ingrediente_ativo_detalhado[]` (`ingrediente_ativo`, `grupo_quimico`, `concentracao`, `unidade_medida`, `percentual`) | `Q_Ingredientes` (dedup por `nomeNormalizado`+`grupoQuimico`) + `Q_Produto_Ingredientes` | 1 `QEVID` bloco `composicao` |
| `documentos[]` (bula/rótulo com `url`, `versao`) | `Q_Documentos` (com `substitui` se já existir mesma URL com versão anterior) | o próprio registro |
| indicações de uso por cultura (quando no payload do detalhe) | `Q_Culturas` | 1 `QEVID` bloco `autorizacao` |

**Campos ausentes ficam nulos** — nunca preenchidos por heurística.

### 10.3 Execução (limites respeitados)

- **Fila:** itens em `Q_Pesquisas`; `bqFilaProcessar` com `limite` (default 20) e **orçamento** de `UrlFetchApp` (ex.: ≤ 150 chamadas/execução) — a execução termina deixando o restante `pendente`.
- **Modo simulação:** `simular:true` devolve `{ok:true, plano:[…]}` com o que seria escrito **sem gravar nada** — usado em teste (§14.3) e como conferência prévia por chamada interna (sem UI, §12).
- **Deduplicação:** match por `registroMAPA` primeiro; depois `nomeNormalizado + titularRegistro`; conflito com produto já `validado` → cria evidência `divergente`, **não sobrescreve**.
- **Reprocessamento:** mesma importação de novo atualiza apenas campos com evidência nova mais recente e registra `Q_Historico(acao=importar)` — idempotente.

### 10.4 Fora da v1

- Importação em massa de autorizações (279 mil linhas) — futura, fora do Sheets.
- Extração de texto de PDF de bula (fase 3) — requer pipeline de PDF separado.
- Qualquer uso de AGROFIT como evidência de **compatibilidade** — proibido (§4.1).

---

## 11. Integração com os módulos existentes

### 11.1 O que se preserva intacto

Bulário · Estoque · InsumosInfo · Montador de Caldas · Biblioteca de caldas · motor de análise atual · histórico e testes do copo. **Zero alteração destrutiva** (§14).

### 11.2 Vínculos (leitura)

- `Q_Produtos.origemEstoqueId` / `origemInfoId` apontam para linhas existentes (`estoque.id`, `insumosInfo.id`).
- Ao criar/importar produto, oferecer match automático por `nomeNormalizado` (+ fabricante) — ação `bqVincular` (§9.3), executada por chamada interna; sem sugestão em tela na v1 (§12).
- **O caminho inverso não existe na v1:** nenhum campo de `estoque`/`bulario`/`insumosInfo` passa a ser preenchido pela Base Química.

### 11.3 Consulta pelos módulos (futura, fase 6)

Hoje o Montador lê só os três cadastros. Na fase 6 (após o motor maduro), `analisarPar` poderá consultar `bqInteracoes`/`bqPropriedades` **como mais uma fonte**, mantendo as 4 classes atuais e o teto "SEM INFORMAÇÃO" — mudança de motor só com testes novos de regressão (§14.4).

### 11.4 Sem ponte de interface na v1

Nenhum link, seção ou endereço da Base Química é exposto nas páginas existentes (`bulario.html`, `sidebar.js`, etc.) — decisão P4 (§19). Quando o motor passar a consultar a base (fase 6, §17), os dados chegarão **silenciosamente pelo backend** (`?tipo=bq*`), sem revelar estrutura de planilhas nem pasta do Drive. Nenhum dado é escrito de volta aos cadastros existentes.

---

## 12. Camada interna de serviços (sem interface própria)

**Decisão P4 (§19):** a Base Química é **exclusivamente infraestrutura interna** do EstufaOS.

- **Não existe** `basequimica.html`, item no `sidebar.js`, seção nova ou qualquer página/elemento visível no site.
- As 13 planilhas `Q_*` vivem na pasta privada do Drive (§3.1) e são acessadas **somente pelo Apps Script**.
- A base **serve dados** ao Bulário e ao Montador de Caldas pelo **backend existente** — na v1 nenhum frontend consume tipos `bq*` (o motor só passa a consultá-la na fase 6, §17).
- **Endpoints administrativos não são expostos ao frontend:** nenhuma página referencia `bq*`; importação, fila e validação (§9.3) são executadas por chamadas internas (script/ferramenta/editor do Apps Script), sem UI.
- **Administração na v1:** pelas próprias planilhas `Q_*` (uso pessoal no Drive) e por funções `bq*` chamadas diretamente — sem tela no site.
- **Interfaces existentes preservadas:** nenhum `*.html`, `sidebar.js` ou CSS é alterado na v1.0.

**As 9 seções do plano** (Visão geral · Produtos e ingredientes · Propriedades físico-químicas · Formulações · Interações · Evidências · Documentos · Pesquisas pendentes · Histórico de validação) ficam registradas aqui como **especificação de painel futuro**, fora do escopo v1 — se um dia existir, será superfície administrativa protegida, nunca uma aba pública.

**Nota de segurança herdada:** a API atual (`?tipo=`/POST) não tem autenticação para **nenhum** tipo — comportamento já existente. A v1 mantém o mesmo modelo; o "não expor" da P4 se cumpre por **não haver consumidor** (esta seção). Um segredo específico para tipos `bq*` pode ser avaliado depois sem quebrar o contrato dos tipos antigos.

---

## 13. Proteção dos dados existentes

### 13.1 Garantias

1. **Somente planilhas novas `Q_*`.** Nenhum `SHEETS` existente tem header alterado na v1.0 (diferente da migração de `caldas`, que foi aditiva e consciente — aqui: nada).
2. **Nenhuma função `bq*` escreve em planilha não-`Q_`** — garantido por `bqSheet_()` (§9.2) + teste estático (§14.5).
3. **Superfície da API só cresce:** os tipos/payloads existentes (`bulario`, `estoque`, `insumosInfo`, `caldas`, `testesCopo`, …) continuam idênticos — regressão testada (§14.4).
4. **Sem hard delete** em `Q_*`; histórico nunca é alterado.
5. **Deploy só depois dos testes** — mesmo fluxo atual: `clasp push` + `clasp deploy` + smoke test na API publicada (§14.3).

### 13.2 Rollback

Como a v1 não toca nada existente nem cria páginas, rollback = remover os blocos `bq*` do `Code.gs` (commits separados por entrega facilitam `git revert`). Planilhas `Q_*` podem ficar ou ser descartadas sem efeito colateral.

---

## 14. Testes automatizados

Estrutura proposta no repositório (GitHub = código + docs + testes):

```
/testes
  base_quimica.test.js     — lógica pura (Node, sem rede)
  api_smoke.test.js        — roundtrip na API publicada (rede)
  regressao_existente.js   — garante que tipos antigos não mudaram
```

### 14.1 Lógica pura (`base_quimica.test.js`, Node)

1. Normalização/dedup: `nomeNormalizado` igual para variações de caixa/acentos; CAS previne fusão errada.
2. Parse de `ingrediente_ativo_detalhado` → `QPI` com unidade/percentual; payload incompleto → campos nulos (**nunca** inventa).
3. Guarda de evidência: `add` de `Q_Propriedades` sem `evidenciaId` → rejeita; com evidência inexistente → rejeita.
4. Enums e transições de estado da fila (todas as transições legais/ilegais da §8.2).
5. Soft delete: `delete` marca `excluido`, não remove linha; `bqHistorico` rejeita escrita.
6. Divergência: 2ª evidência com valor diferente → `status=divergente`, valor atual **não** muda.
7. Dedup de importação: reimportar mesmo `registroMAPA` não duplica produto/ingredientes (idempotência).
8. Unicidade `(produtoId, ingredienteId)`.
9. Componentes N-árias: interação com 3 componentes conta 3 `QIC`; par conta 2.

### 14.2 Sintaxe

- `node --check` no script inline do `Code.gs` e do `bulario.html` (harness atual `%TEMP%` **migrado para `/testes`** — hoje os testes vivem só na máquina local; a v1 os versiona).

### 14.3 Smoke da API publicada (após cada deploy)

1. GET dos 13 tipos `bq*` → `ok:true` (planilhas criadas pelo primeiro `getSheet_`).
2. Roundtrip `__teste__`: add → confere colunas → update (gera histórico) → delete soft → confere `excluido`.
3. `bqHistorico` rejeita `add`.
4. `simular:true` do `bqAgrofitSync` não grava nada (contagem antes/depois idêntica).

### 14.4 Regressão dos tipos existentes (bloqueia publicação)

1. GET de **todos** os tipos atuais (`bulario`, `estoque`, `insumosInfo`, `caldas`, `testesCopo`, …) → `ok:true` e mesmo nº de linhas da captura anterior.
2. Header de cada planilha existente **byte a byte** igual ao antes da entrega.
3. Nenhum `POST` novo nos tipos antigos.

### 14.5 Teste estático de escopo

Varredura do `Code.gs`: nenhuma função iniciada com `bq` referencia `getSheet_` fora de `bqSheet_` nem nomes de planilha fora de `Q_*` (grep + asserção).

### 14.6 Critério de execução

`node testes/base_quimica.test.js && node testes/regressao_existente.js` verde → só então `clasp push/deploy` → smoke verde → commit/push. **Testes antes de qualquer publicação.**

---

## 15. Critérios de aceite (os 8 do plano)

| # | Critério | Como se verifica |
|---|---|---|
| 1 | Identidade correta dos produtos | amostra do lote piloto conferida contra AGROFIT/bula (status `validado`) |
| 2 | Ingredientes e concentrações verificáveis | cada `QPI` tem `evidenciaId` → documento com trecho/URL |
| 3 | Propriedades com fonte rastreável | 100% de `Q_Propriedades` com `evidenciaId` (teste automatizado) |
| 4 | Interações sustentadas por evidências | `QINT` sem `evidenciaId` impossível pela API |
| 5 | Separação fatos × hipóteses × desconhecidos | nulos **preservados** como vazios (nunca preenchidos); `grauConfianca`/`status` registrados em cada linha |
| 6 | Ausência de conclusão de compatibilidade sem fundamento | nenhum registro `validado` sem revisão humana (teto do §8.3 + §14.1) |
| 7 | Histórico de atualizações e documentos | `Q_Historico` append-only; `Q_Documentos.substitui` em cadeia |
| 8 | Última atualização registrada | `atualizadoEm`/`dataColeta` preenchidos nos dados (sem UI na v1 — §12; exibição vale para tela futura) |

> Critérios 5 e 8 referem-se a exibição: sem interface na v1, verificam-se **nos dados** e passam a valer visualmente quando/ se existir painel administrativo (§12).

---

## 16. Lote piloto (20–30 produtos)

**Ordem pedida:** ① fungicidas da bateria atual → ② inseticidas de tomate/pepino → ③ fertilizantes foliares/bioestimulantes → ④ cobre → ⑤ adjuvantes/condicionadores.

**Bateria confirmada (P2 ✓):** Elatus, Score, Amistar Top, Cabrio Top, Bravonil 720, Infinito — os 6 fungicidas do lote piloto, definidos pelo usuário em 2026-11-14 (histórico de pulverizações estava vazio).

**Já mapeados nos cadastros existentes (para a fase de vínculos):**

- **Inseticidas/acaricidas (tomate/pepino):** Influx, Verdavis, Trigard, Abamectina, Actara, Ampligo, Oberon, Connect, Lanate, Minecto Pro, Pirate, Diador, Blade, Privilege, Dimexion, Delegate, Abamex maxx, Benevia.
- **Fertilizantes foliares/bioestimulantes (InsumosInfo):** Amino Power, Amino Classic, Nutrilife B+, Soil K, Soil Ca, Nitrato de cálcio, Potent Active, Booster Pro, Plant Reviv, Biovita Life, Fosfito de potássio (PHOSFIK PK).
- **Cobre:** Phosfik Cu4, Glucona de Cobre, Verno (Nordox — presumido óxido de cobre, a conferir no rótulo).
- **Adjuvantes/condicionadores:** Aminon 25, Fluxxor, Cleanup, Green Mix, Thyper S-50, Flex Ox.

> Critério de "pronto" do lote: **não** é ter 30 produtos — é os 8 critérios da §15 passando nesses produtos.

**Resultado do piloto (2026-11-15, decisão do usuário — fase AGROFIT encerrada):**

- **① Fungicidas: CONCLUÍDO** — 6/6 importados, conferidos contra o AGROFIT ao vivo e `validado` (Elatus 2414, Score 2894, Amistar Top 3809, Cabrio Top 1303, Bravonil 720 6300, Infinito 18308).
- **② Inseticidas: CONCLUÍDO** — 18/18 importados, conferidos e `validado` (com overrides por registro: Lanate→Bazuka 216 SL reg 3010; Abamectina→Abamex reg 3801).
- **③–⑤ (fertilizantes, cobre, adjuvantes): SEM COBERTURA AGROFIT — fora do escopo da fonte.** Evidências: (a) spec oficial da API define AGROFIT como "defensivos agrícolas, agrotóxicos, produtos fitossanitários e afins" para controle de pragas; (b) `GET /classes-categorias-agronomicas` retorna **21 classes** (fungicida, inseticida, herbicida, acaricida, nematicida, bactericida, regulador de crescimento, biológicos…) — **nenhuma Fertilizante/Adjuvante/Condicionador**; (c) sondagem `testes/piloto3_fertilizantes.js` (10/11 só falsos positivos) e buscas por marca e titular = 0 para Nutrilife, Biolchim, Yara, Biovita, Potent, Soil, Reviv, Booster, Verno, Nordox, Phosfik, Glucona, Aminon, Fluxxor, Cleanup, Thyper.
- **Total importado na fase AGROFIT: 24 produtos, 24 `validado`, 0 `pendente`.** Os lotes ③–⑤ passam para a **Fase 4** (fontes ficha técnica/fabricante, §4.2/§6.5), com vínculo explícito (§9.3) quando houver cadastro existente.

**Resultado da Fase 4 (2026-11-15, execução real via `testes/fase4_propriedades.js`, deploy @49):**

- **29/29 produtos do cadastro `insumosInfo` vinculados** (`origemInfoId` preenchido, §11.2): os 19 dos lotes ③–⑤ presentes no cadastro + 10 extras (Carbos, Plenan Cab MG, Previne, Top Lime, Fitofos K, Insector K, Soberano, Larvax, Clorashield, Vandal). Verno/Nordox não estão no cadastro (fila `Q_Pesquisas` continua como pendência, §17 Fase 3).
- **21 fontes → 17 `Q_Documentos` criados + 4 URLs compartilhadas reusadas** (dedup por URL, §10.3).
- **36 `Q_Propriedades` criadas** (densidade 11, naturezaFisica 11, solubilidade 10, ph 4) — **100% com `evidenciaId`, 100% `pendente`** (nível E nunca auto-aprova, §7.2; revisão humana pela `action revisar`, §7.4). Valores parseados por campo (ex.: `1,47 g/mL`, intervalo `6,5–7,5`), unidade preservada, nada numérico (anti-coerção §5.3).
- **8 linhas sem fonte utilizável → 0 propriedades** (§4.2 — sem fonte, sem dado; produto mesmo assim vinculado).
- **Categorias só por regra/override da §16** (Green Mix/Cleanup/Fluxxor/Flex Ox→Adjuvante; Potent Active/Plant Reviv→Bioestimulante; sem keyword → vazia — nunca adivinhada).
- **Re-execução idempotente comprovada:** 0 criações, 29 existentes, 36 evidências idênticas puladas (§10.3).
- Gates verdes: `base_quimica.test.js` **259/259**, `api_smoke.test.js` **81/81** (produção), `regressao_existente.js` **27/27**, `bulario_check.js` **36/36**.

**Complemento da Fase 4 (2026-11-15, deploy @50 — busca nas URLs já vinculadas):**

- **Correções de parse:** intervalo com hífen ASCII (`5,0 - 6,0` do FDS) agora vira `valorMin`+`valorMax` (antes só aceitava `–—−`); `obs` da propriedade fica fiel à evidência quando o dado não veio do cadastro (`extraído da fonte da evidência (§4.2)` em vez de `transcrito do cadastro insumosInfo`).
- **Busca nas 17 URLs distintas de `Q_Documentos`** (páginas de produto, PDFs, FDS, fichas) → **+7 `Q_Propriedades`** em 3 produtos existentes, **100% com evidência e `pendente`**: Aminon 25 (naturezaFisica `Fluído / Líquido` — página technes.com.br), Booster Pro (ph `5,0 - 6,0` como intervalo, solubilidade `Totalmente solúvel`, naturezaFisica `Líquido, fluido em solução` — FDS Agrichem Rev02) e Thyper S-50 (densidade `1,196 g/cm³ (20ºC)` com valor/unidade/condição parseados, solubilidade `Completa`, naturezaFisica `Líquido` — ficha no Google Drive). +2 `Q_Documentos` novos (FDS Booster Pro, ficha Thyper).
- **Total da Fase 4: 43 `Q_Propriedades`** (densidade 12, naturezaFisica 14, solubilidade 12, ph 5) — 14/53 produtos com ≥1 propriedade; **todas `pendente` = revisão humana (§7.4), nenhuma auto-aprovada**. Sem dado nas fontes lidas (miscibilidade não aparece em nenhuma das 17): 24 AGROFIT, 8 sem fonte, Nutrisoil/Quimia inacessíveis — aguardam dados do usuário.
- **Vazamento corrigido:** a seção roundtrip do smoke (§14.3(2)) deixava 1 densidade órfã por execução (produto soft-deletado, propriedade ativa) — 8 órfãs removidas em produção e limpeza da propriedade adicionada ao teste.
- Gates verdes: `base_quimica.test.js` **261/261** (parse do hífen ASCII + condição `(20ºC)`), `api_smoke.test.js` **83/83** (produção, com anti-órfãs), `regressao_existente.js` **27/27**, `bulario_check.js` **36/36**.

---

## 17. Cronograma (6 fases do plano)

| Fase | Escopo | Entregas desta spec | Prioridade |
|---|---|---|---|
| **1 — Estrutura** | 13 planilhas, IDs, evidências, API, testes, guarda não-destrutiva | §§5–7, 9, 13, 14 | **Máxima** |
| **2 — AGROFIT** | importação com fila/simulação + lotes piloto ①–② (③–⑤ sem cobertura AGROFIT → Fase 4, §16) | §§10, 16 | **Máxima** |
| **3 — Documentos** | extração de bulas/fichas (pipeline PDF), `Q_Documentos` completo | fase 2 (§1.2) | Alta |
| **4 — Propriedades** | popula `Q_Propriedades` com fontes (ficha, fabricante) | **CONCLUÍDA (2026-11-15)** — `action ficha`/`revisar` (§9.3), 29 vínculos + 43 propriedades com evidência (§16); revisão humana das 43 pendentes é operação contínua | Alta |
| **5 — Interações** | `Q_Interacoes` com evidência humana (nível E) | estrutura pronta (§6.10–6.11) | Alta |
| **6 — Integração** | montador consulta a base (motor muda **só aqui**, com testes novos) | §11.3 (motor inalterado até lá) | Final |

**Ordem de implementação da Fase 1 (primeira entrega ao OpenCode):**
1. `SHEETS` + criação das 13 planilhas com formato texto na pasta privada (§5.3, §3.1) → 2. `bqRepo_` + handlers `doGet`/`doPost` (§9) → 3. seeds (`Q_Formulacoes`) → 4. testes Node (§14.1–14.2) → 5. camada interna sem UI — endpoints `bq*` não referenciados por nenhuma página (§12) → 6. smoke + regressão (§14.3–14.4) → 7. `clasp deploy` → 8. commit/push → 9. relatório de implementações e limitações.

---

## 18. Riscos, limites e migração PostgreSQL

| Risco | Mitigação |
|---|---|
| Cota/limite do Apps Script na importação | fila com orçamento por execução (§10.3); plano gratuito AgroAPI 100k/mês |
| Coerção numérica do Sheets | formato `@` desde a criação (§5.3) + teste |
| Célula > 50k caracteres | truncar `trechoOriginal` em 5k com marcação |
| Cache local do cliente (localStorage) com 13 tipos | manter `buscarLote` (1 chamada); piloto tem poucos dados; monitorar |
| Duplicação de produto entre cadastros e base | vínculo explícito + dedup por `registroMAPA`/`nomeNormalizado` (§10.3) |
| IA "achando" compatibilidade | teto automático do nível D (§8.3) + testes 6/7 do §14.1 |
| Sheets como banco relacional | `bqRepo_` isola acesso; IDs estáveis; sem dependência de índice de linha → troca futura por PostgreSQL mudando só a camada + cópia das 13 tabelas |

---

## 19. Decisões (P1–P6 — todas resolvidas)

| # | Item | Situação |
|---|---|---|
| P1 | Chave/cadastro na **AgroAPI Embrapa** | **RESOLVIDA (2026-11-14):** Access Token obtido e testado (`/versao`, `/produtos-formulados` → 200). Guardar em Script Properties (`AGROAPI_TOKEN`); cópia local `agroapi.local.key` **fora do repositório**; nunca commitar. Em caso de 401 futuro: renovar no portal ou migrar p/ `client_credentials` (§4.1a) |
| P2 | Os **6 fungicidas** do lote piloto | **RESOLVIDA:** Elatus, Score, Amistar Top, Cabrio Top, Bravonil 720, Infinito (§16) |
| P3 | URLs exatas das fontes | **RESOLVIDA:** 11 links confirmados em §4.2/§20 — única exceção: manual de mistura em tanque 2021 segue sem link |
| P4 | Interface da Base Química | **RESOLVIDA:** **interna e invisível** — sem `basequimica.html`, sem item no sidebar, sem seção visível; camada de dados/serviços que alimenta Bulário e Montador pelo backend existente; estrutura/planilhas/endpoints administrativos **não expostos** ao frontend (§12) |
| P5 | Pasta das 13 planilhas `Q_*` | **RESOLVIDA:** pasta **privada e independente** no Drive (§3.1) — não misturar com operacionais, sem exposição no site/sidebar/Drive, acesso só via Apps Script |
| P6 | Aprovar a 13ª tabela `Q_Interacoes_Componentes` (desvio do plano original, justificado em §6.11) | **RESOLVIDA:** tabela separada **aprovada** (§6.11) |

---

## 20. Referências (links verificados em 2026-11-14)

- Conjunto AGROFIT (dados abertos): https://dados.agricultura.gov.br/dataset/sistema-de-agrotoxicos-fitossanitarios-agrofit
- CKAN `package_show`: https://dados.agricultura.gov.br/api/3/action/package_show?id=sistema-de-agrotoxicos-fitossanitarios-agrofit
- API AgroAPI Embrapa (docs): https://www.portal.agroapi.cnptia.embrapa.br/api-docs/agrofit/v1
- AgroAPI portal: https://www.agroapi.cnptia.embrapa.br/ · produto Embrapa: https://www.embrapa.br/web/agricultura-digital/busca-de-solucoes-tecnologicas/-/produto-servico/11779/api-agrofit
- AGROFIT consulta pública: https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons
- Fontes confirmadas (P3) — Embrapa Infoteca-e: https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/426350 · https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/967185
- FAO/WHO: https://extranet.who.int/prequal/vector-control-products/manuals-development-and-use-faowho-specifications-pesticides · https://www.who.int/publications/b/81994 · https://extranet.who.int/prequal/vector-control-products/who-specifications-pesticides
- CIPAC: https://www.cipac.org/ · https://www.cipac.org/images/pdf/methods1.pdf
- MAPA fertilizantes: https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/fertilizantes/legislacoes · https://www.gov.br/agricultura/pt-br/assuntos/insumos-agropecuarios/insumos-agricolas/fertilizantes/legislacao/manual-de-metodos_2017_isbn-978-85-7991-109-5.pdf · https://www.gov.br/agricultura/pt-br/assuntos/lfda/legislacao-metodos-da-rede-lfda/fertilizantes-corretivos-substratos-e-inoculantes
- Pendência restante de link: manual Embrapa de mistura em tanque (2021) — **a confirmar**.
- Autenticação AgroAPI validada em 2026-11-14 (`Authorization: Bearer <token>`; ver §4.1a — credencial fora do repositório).

---

*Fim da especificação v1.0 — P1–P6 resolvidas; especificação fechada. Próxima etapa: implementação incremental da Fase 1 (§17) com testes antes de qualquer publicação.*
