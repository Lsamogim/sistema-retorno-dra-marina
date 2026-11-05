# Redesign do frontend — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a interface atual por um fluxo por etapas (Chamar · Aguardando resposta · Agendados · Concluídos) em que nenhuma ação remove um paciente da vista sem mostrar o destino e oferecer desfazer, com a identidade visual Quantus, funcionando em celular, iPad e computador.

**Architecture:** O servidor passa a calcular a etapa de cada item (função pura `computeStage`) e oferece ações nomeadas com desfazer exato (`before` + `/restore`). O frontend é reescrito em React com componentes de UI próprios (CSS Modules + tokens), roteador mínimo sobre a History API e um hook `useToday` que aplica ações de forma otimista, mantém o cartão em estado "Movido para…" e desfaz.

**Tech Stack:** Node ≥ 22.13 + Express 5 + `node:sqlite` (servidor, testes com `node --test`); React 19 + Vite 6 + CSS Modules (cliente, testes com Vitest + Testing Library + jsdom); `@fontsource/plus-jakarta-sans`.

**Spec:** `docs/superpowers/specs/2026-11-05-redesign-frontend-design.md`

## Global Constraints

- Etapas e nomes exatos: `chamar` "Chamar" · `aguardando` "Aguardando resposta" (celular: "Aguardando") · `agendado` "Agendados" · `concluido` "Concluídos"; fora do fluxo: `ainda_nao` "Ainda não é hora" · `fora` "Fora da lista".
- Prazos: entra em Chamar com `daysUntilDue <= 5`; Aguardando expira em **3 dias** após `contacted_at`; Concluídos visível por **7 dias** após `done_at`.
- Estado "Movido para…" no cartão por **4000 ms**; toast com "Ver" e "Desfazer" por **8000 ms**.
- Vocabulário: "Retoque (15 dias)", "Nova aplicação (6 meses)", "Sessão a cada N dias", "Não vai voltar", "Atrasado N dia(s)", "Vence em N dia(s)", "Vence hoje". Nunca "Nd".
- Cores, tipografia, espaços, raios, sombras: exatamente as tabelas da spec, seção 4 (tokens em `src/styles/tokens.css`).
- Alvos de toque ≥ 44 px; campos com `font-size: 16px` abaixo de 768 px; nenhuma rolagem horizontal de página em 375 px.
- Breakpoints: celular < 768 px (barra inferior, etapas 2×2); ≥ 768 px barra superior; ficha como painel lateral ≥ 1024 px, tela cheia abaixo.
- Turbo `#F0E100` nunca como cor de texto. Branco sobre violeta só em botões semibold ≥ 13 px.
- Nenhum `style={{}}` inline nos componentes de tela; fontes servidas localmente (remover Google Fonts do `index.html` e da CSP).
- O formato atual do `PATCH /api/patients/:id/categories/:cat` continua aceito.
- Textos de interface em pt-BR, frases curtas, verbo primeiro, sem "por favor"/"com sucesso".

## Review Focus

1. **Paciente sem telefone na etapa Chamar** — o botão principal deve ser "Adicionar telefone" (abre o campo de telefone na ficha), nunca um WhatsApp quebrado. Teste na Task 9.
2. **Falha de rede durante uma ação** — o cartão volta ao estado e à etapa anteriores e aparece a mensagem de erro; nada fica "Movido para" falsamente. Teste na Task 8.
3. **Desfazer "Não volta mais em nenhum procedimento"** — cada categoria volta ao estado que tinha antes (uma que já estava arquivada continua arquivada). Teste na Task 3.
4. **Agendamento manual seguido de importação da planilha** — quando a planilha traz atendimento na data agendada ou depois, `scheduled_for` é ignorado e o paciente não aparece como "Faltou". Teste na Task 1.
5. **Pausa vencida** (`archived_until` no passado) — o paciente volta sozinho ao fluxo pela regra de prazo. Teste na Task 1.

---

### Task 1: Etapas no servidor (`computeStage`) e migração das colunas

**Files:**
- Create: `server/stages.js`
- Create: `server/test/stages.test.js`
- Modify: `server/db.js` (migração `user_version` 2: novas colunas)
- Modify: `package.json` (script `"test:server": "node --test server/test/"`)

**Interfaces:**
- Produces: `computeStage(item, state, now) -> { stage, reason, attempt }`
  - `item`: objeto do motor com `status`, `daysUntilDue`, `lastDate` (ISO), `nextScheduled` (ou `null`).
  - `state`: linha de `patient_category_states` (ou `{}`), com `archived`, `archived_until`, `contacted_at`, `contact_attempts`, `scheduled_for`, `done_at`, `no_show_at`.
  - `now`: `Date`; `today` derivado com `getLocalTodayIso(now)`.
  - `stage ∈ 'chamar'|'aguardando'|'agendado'|'concluido'|'ainda_nao'|'fora'`; `reason ∈ 'atrasado'|'vencendo'|'segunda_tentativa'|'faltou'|'planilha'|'manual'|null`; `attempt` = `(contact_attempts||0)+1` quando `stage==='chamar'`, senão `null`.
- Produces (db): colunas `scheduled_for TEXT`, `done_at TEXT`, `contact_attempts INTEGER NOT NULL DEFAULT 0`, `archived_until TEXT`, `no_show_at TEXT`.

Ordem de decisão (algoritmo que os testes fixam):
```
1. state.archived && !(state.archived_until && state.archived_until <= today) → fora
2. item.status === 'agendado' (agendamento real da planilha) → agendado/planilha
3. item.status === 'em_dia' && done_at && now - done_at <= 7 dias → concluido
4. scheduled_for && !(item.lastDate >= scheduled_for):
     scheduled_for >= today → agendado/manual ; senão → chamar/faltou
5. no_show_at && (!contacted_at || no_show_at > contacted_at) → chamar/faltou
6. item.status === 'aguardando': now - contacted_at <= 3 dias → aguardando ; senão → chamar/segunda_tentativa
7. item.status === 'atrasado' → chamar/atrasado ; 'vencendo' → chamar/vencendo
8. senão → ainda_nao
Pausa vencida (archived com archived_until <= today): ignorar o arquivamento e decidir por daysUntilDue (<0 atrasado, <=5 vencendo, senão ainda_nao).
```

- [ ] **Step 1: Escrever os testes** em `server/test/stages.test.js` (`node:test` + `assert/strict`), com `now = new Date('2026-11-05T15:00:00Z')`:
  - `arquivado sem pausa → fora`
  - `pausa vencida com atraso → chamar/atrasado` (`archived:1, archived_until:'2026-11-01'`, item `status:'arquivado', daysUntilDue:-3`)
  - `pausa futura → fora` (`archived_until:'2026-12-01'`)
  - `agendamento da planilha → agendado/planilha`
  - `feito há 2 dias → concluido`; `feito há 8 dias → ainda_nao` (`status:'em_dia'`)
  - `agendou para amanhã → agendado/manual` (`scheduled_for:'2026-11-06'`)
  - `agendou para ontem sem atendimento → chamar/faltou` (`scheduled_for:'2026-11-04'`, `lastDate:'2026-10-20'`)
  - `agendou para ontem e a planilha trouxe atendimento → ignora scheduled_for` (`lastDate:'2026-11-04'`, `status:'em_dia'`, `daysUntilDue:20` → `ainda_nao`)
  - `faltou registrado → chamar/faltou` (`no_show_at:'2026-11-05T10:00:00Z'`, `status:'atrasado'`)
  - `contato há 1 dia → aguardando`; `contato há 4 dias → chamar/segunda_tentativa, attempt 2` (`contact_attempts:1`)
  - `atrasado → chamar/atrasado, attempt 1`; `vencendo → chamar/vencendo`; `em dia sem marcações → ainda_nao`

- [ ] **Step 2: Rodar e ver falhar** — `node --test server/test/` → FAIL (`Cannot find module '../stages.js'`).

- [ ] **Step 3: Implementar `computeStage`** em `server/stages.js` seguindo o algoritmo acima; constantes exportadas `CALL_WINDOW_DAYS = 5`, `AWAITING_DAYS = 3`, `DONE_VISIBLE_DAYS = 7`.

- [ ] **Step 4: Migração** em `server/db.js`: bloco `if (schemaVersion < 2)` adicionando as 5 colunas (checar `PRAGMA table_info` antes de cada `ALTER`) e `PRAGMA user_version = 2`. Teste em `server/test/stages.test.js`: abrir `DatabaseSync(':memory:')` não serve (db.js usa DATA_DIR) — em vez disso, teste `migração cria colunas` que define `process.env.DATA_DIR` para uma pasta temporária (`fs.mkdtempSync`), `APP_PASSWORD='senha-teste-1234'`, importa `db.js`, chama `initDatabase()` e confere as 5 colunas e `user_version === 2`.

- [ ] **Step 5: Rodar** — `npm run test:server` → todos PASS.

- [ ] **Step 6: Commit** — `git add server/stages.js server/test package.json server/db.js && git commit -m "Etapas do fluxo calculadas no servidor (computeStage) e novas colunas"`

---

### Task 2: Itens com etapa e endpoint `GET /api/today`

**Files:**
- Modify: `server/returnEngine.js` (após montar `itemsByCategory`, anexar etapa; incluir campos de estado no item)
- Modify: `server/index.js` (rota `GET /api/today`)
- Test: `server/test/today.test.js`

**Interfaces:**
- Consumes: `computeStage` (Task 1).
- Produces: cada item do dashboard ganha `stage`, `stageReason`, `attempt`, `scheduledFor`, `doneAt`, `contactAttempts`, `archivedUntil`, `noShowAt`, `categoryName`.
- Produces: `GET /api/today` → `{ referenceDate, counts: {chamar, aguardando, agendado, concluido}, categories: [{id, name, shortName}], items: Item[] }` com só itens das 4 etapas, ordenados: `chamar` por `daysUntilDue` crescente; `aguardando` por `contacted_at` mais antigo; `agendado` por data agendada; `concluido` por `done_at` mais recente.
- Produces: `buildTodayData(dashboard) -> TodayData` exportada de `server/returnEngine.js` (pura, para teste).

- [ ] **Step 1: Teste** `server/test/today.test.js`: monta um dashboard falso com 6 itens (um por etapa) e verifica `buildTodayData`: `counts` = `{chamar:1, aguardando:1, agendado:1, concluido:1}`, `items.length === 4`, nenhum `ainda_nao`/`fora`, ordem de `chamar` por `daysUntilDue`.
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** o anexo da etapa em `computeDashboardData` (um laço sobre `itemsByCategory` usando `stateMap.get(\`${patientId}:${categoryId}\`)`, mesma chave já usada na linha ~185) e `buildTodayData`; rota `app.get('/api/today', ...)` registra `audit(req, 'patients_list_viewed')` pela mesma regra de 30 min da `/api/dashboard` (reaproveitar `auditDashboardView`).
- [ ] **Step 4: Rodar** `npm run test:server` → PASS.
- [ ] **Step 5: Commit** — `"Etapa em cada item e endpoint /api/today"`

---

### Task 3: Ações nomeadas com desfazer exato

**Files:**
- Create: `server/stateActions.js`
- Modify: `server/index.js` (o `PATCH /api/patients/:id/categories/:categoryId` delega; nova rota `POST .../restore`)
- Test: `server/test/stateActions.test.js`

**Interfaces:**
- Produces: `applyAction(patientId, categoryId, body, nowIso) -> { before: StateRow[] }` — `StateRow` = linha completa de `patient_category_states` (ou `{patient_id, category_id, missing: true}` se não existia). `body.action`:
  - `'contacted'`: `contacted_at=now`, `contacted_for_cycle_date=body.cycleKey`, `contact_attempts+=1`, limpa `no_show_at`.
  - `'scheduled'`: `scheduled_for=body.date` (ISO `YYYY-MM-DD` válido, senão erro 400).
  - `'done'`: `body.milestone ∈ 'review'|'renewal'` e `body.anchorDate`; reaproveita a lógica atual de `reviewDone`/`renewalDone` e grava `done_at=now`; limpa `scheduled_for`, `contacted_at`, `contact_attempts=0`, `no_show_at`.
  - `'no_show'`: limpa `scheduled_for`, `no_show_at=now`.
  - `'archive'`: `archived=1`, `archived_reason=body.reason`, `archived_at=now`, `archived_until=body.until||null`; `body.allCategories` aplica a todas as categorias do paciente e devolve um `before` por categoria.
  - `'unarchive'`: `archived=0`, limpa `archived_until`.
  - Sem `action`: segue o comportamento atual (compatibilidade).
- Produces: `restoreStates(patientId, before: StateRow[])` — para cada linha: se `missing`, apaga a linha; senão grava exatamente os valores (lista branca de colunas). Rejeita (400) linhas de outro `patient_id`.
- Produces (HTTP): `PATCH` responde `{ ok: true, before, items }` onde `items` são os itens recalculados do paciente (todas as categorias) via `computeDashboardData` filtrado; `POST /api/patients/:id/categories/:categoryId/restore` com `{ before }` responde `{ ok: true, items }`. Auditoria: ações `contacted|scheduled|done|no_show|archive|unarchive|restore` com `targetId` = paciente e `details: {category, action}`.

- [ ] **Step 1: Testes** (`DATA_DIR` temporário, `initDatabase()`, paciente e categoria inseridos no teste):
  - `contacted incrementa tentativas e grava contacted_at`
  - `scheduled com data inválida lança erro com status 400`
  - `done grava done_at e limpa agendamento e contato`
  - `restore devolve exatamente o estado anterior` (aplica `scheduled` e depois `restore(before)`, compara a linha inteira)
  - `restore de linha inexistente apaga a linha criada`
  - `archive em todos os procedimentos + restore mantém arquivada a categoria que já estava arquivada` (Review Focus 3)
  - `restore rejeita linhas de outro paciente`
- [ ] **Step 2: Rodar** → FAIL.
- [ ] **Step 3: Implementar** `server/stateActions.js` (transação `BEGIN/COMMIT/ROLLBACK` em `archive` com `allCategories` e em `restoreStates`) e ligar as rotas.
- [ ] **Step 4: Rodar** `npm run test:server` → PASS; rodar a bateria antiga de regressão (`node <scratchpad>/verify2.mjs`) se disponível, senão `node --check server/*.js`.
- [ ] **Step 5: Commit** — `"Ações nomeadas com desfazer exato no servidor"`

---

### Task 4: Base do novo frontend (tokens, fontes, testes de UI)

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`
- Create: `vitest.config.js`, `src/test/setup.js`
- Modify: `package.json` (deps `@fontsource/plus-jakarta-sans`; dev `vitest`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`; scripts `"test:ui": "vitest run"`, `"test": "npm run test:server && npm run test:ui"`)
- Modify: `index.html` (remover links do Google Fonts; `<meta name="theme-color" content="#18102B">`)
- Modify: `server/index.js` (CSP sem `fonts.googleapis.com`/`fonts.gstatic.com`)
- Modify: `src/main.jsx` (importar fontes 400/500/600/700, `tokens.css`, `base.css`)

**Interfaces:**
- Produces: variáveis CSS da spec 4.1–4.3 com estes nomes: `--color-ink`, `--color-ink-2`, `--color-ink-3`, `--color-brand`, `--color-brand-strong`, `--color-brand-soft`, `--color-highlight`, `--color-canvas`, `--color-surface`, `--color-border`, `--color-border-control`, `--status-{late|soon|waiting|done|out}-{fg|bg}`, `--space-1..7` (4,8,12,16,24,32,48), `--radius-{xs:6|sm:10|md:14|lg:20|full}`, `--shadow-{sm|md|overlay}`, `--font-sans`, `--text-{caption|meta|body|body-lg|section|title|display}` (tamanhos da spec 4.2), `--control-h-sm: 36px`, `--control-h: 44px`, `--dur-fast: 150ms`, `--dur-base: 250ms`.
- `base.css`: reset, `body` com `--color-canvas`/`--color-ink`, foco visível (`outline: 2px solid var(--color-brand-strong); outline-offset: 2px`), `@media (prefers-reduced-motion: reduce)` zerando animações, inputs 16 px abaixo de 768 px.

- [ ] **Step 1:** Instalar dependências e criar `vitest.config.js` (`environment: 'jsdom'`, `setupFiles: ['src/test/setup.js']`, `css: { modules: { localsConvention: 'camelCase' } }`).
- [ ] **Step 2:** Teste de fumaça `src/test/smoke.test.jsx`: renderiza `<button>ok</button>` e encontra por `getByRole('button', {name: 'ok'})`. `npm run test:ui` → PASS.
- [ ] **Step 3:** Criar `tokens.css` e `base.css`; ajustar `index.html`, CSP e `main.jsx`. `npm run build` → sucesso.
- [ ] **Step 4: Commit** — `"Base do novo frontend: tokens Quantus, fontes locais e Vitest"`

---

### Task 5: Kit de componentes (`src/ui/`)

**Files:** Create em `src/ui/`, cada um com `.module.css`: `Button.jsx`, `IconButton.jsx`, `Badge.jsx`, `StageTabs.jsx`, `Select.jsx`, `TextField.jsx` (inclui `multiline`), `Card.jsx`, `Sheet.jsx`, `Dialog.jsx`, `Toast.jsx` (+ `ToastProvider`, `useToast`), `Avatar.jsx`, `EmptyState.jsx`, `Menu.jsx`, `index.js`. Test: `src/ui/ui.test.jsx`.

**Interfaces (props exatas):**
- `Button({variant='secondary'|'primary'|'ghost'|'danger', size='md'|'sm', icon, loading, fullWidth, ...buttonProps})` — `md` = 44 px, `sm` = 36 px; `loading` desabilita e mostra "…".
- `IconButton({label, icon, ...})` — `aria-label={label}`, 44×44.
- `Badge({tone='late'|'soon'|'waiting'|'done'|'out'|'neutral', children})`.
- `StageTabs({stages: [{id, label, shortLabel, count}], value, onChange, pulseId})` — `pulseId` anima o contador daquela etapa por 600 ms (sem animação com `prefers-reduced-motion`); `role="tablist"`, cada `role="tab"` com `aria-selected`; contador da ativa com fundo `--color-highlight`; < 768 px grade 2×2 usando `shortLabel`.
- `Select({label, value, options:[{value,label}], onChange})`, `TextField({label, value, onChange, onBlur, error, hint, multiline, type})` — label sempre visível; `error` com `role="alert"` ligado por `aria-describedby`.
- `Sheet({open, title, onClose, children, footer})` — painel lateral 440 px ≥ 1024 px, tela cheia abaixo; foco no título ao abrir, `Esc` fecha, foco volta ao elemento que abriu; `aria-modal="true"`, `aria-labelledby`.
- `Dialog({open, title, description, confirmLabel, destructive, onConfirm, onCancel})`.
- `useToast() -> { show({message, actions:[{label, onClick}], duration=8000}) }`; região `aria-live="polite"`.
- `Avatar({name})` — iniciais (2 letras), fundo `--color-brand-soft`, texto `--color-brand-strong`.
- `EmptyState({title, body, action})`, `Menu({label, items:[{label, onSelect, destructive}]})` — botão "⋯" com `aria-haspopup="menu"`, navegação por setas, `Esc` fecha.

- [ ] **Step 1: Testes** em `src/ui/ui.test.jsx`:
  - `StageTabs marca aria-selected e chama onChange`
  - `Sheet foca o título ao abrir, fecha com Esc e devolve o foco`
  - `Toast executa a ação e some após duration` (fake timers, 8000 ms)
  - `TextField com error expõe role=alert ligado ao campo`
  - `Menu abre, navega por seta e fecha com Esc`
  - `Avatar mostra as iniciais de "Karina Cardoso" como "KC"`
- [ ] **Step 2:** `npm run test:ui` → FAIL.
- [ ] **Step 3:** Implementar os componentes só com tokens (nenhuma cor literal nos `.module.css`).
- [ ] **Step 4:** `npm run test:ui` → PASS.
- [ ] **Step 5: Commit** — `"Kit de componentes de interface"`

---

### Task 6: Domínio do cliente (vocabulário, datas, etapas)

**Files:** Create `src/domain/vocab.js`, `src/domain/dates.js`, `src/domain/stages.js`; Test `src/domain/domain.test.js`.

**Interfaces:**
- `STAGES` = `[{id:'chamar', label:'Chamar', shortLabel:'Chamar'}, {id:'aguardando', label:'Aguardando resposta', shortLabel:'Aguardando'}, {id:'agendado', label:'Agendados', shortLabel:'Agendados'}, {id:'concluido', label:'Concluídos', shortLabel:'Concluídos'}]`; `stageLabel(id)`.
- `dueText(daysUntilDue) -> string`: `-1` → "Atrasado 1 dia", `-3` → "Atrasado 3 dias", `0` → "Vence hoje", `1` → "Vence amanhã", `4` → "Vence em 4 dias".
- `dueTone(item) -> 'late'|'soon'|'waiting'|'done'|'out'`.
- `ruleText(item) -> string`: capilar → "Sessão a cada {effectiveIntervalDays} dias"; `hasDualReturn` com `cyclePhase==='review'` → "Retoque (15 dias)"; com `'renewal'` → "Nova aplicação (6 meses)"; demais → "Ciclo de {effectiveIntervalDays} dias".
- `reasonText(item)` (lê `item.stageReason` e `item.attempt`): `segunda_tentativa` → "{attempt}ª tentativa", `faltou` → "Faltou — remarcar", demais → `''`.
- `doneActionLabel(item)`: review → "Fez o retoque"; renewal com dual → "Fez nova aplicação"; demais → "Veio".
- `formatLongDate(iso)` → "quinta, 5 de novembro" (fuso `America/Sao_Paulo`); `formatShortDate(iso)` → "05/11/2026".

- [ ] **Step 1: Testes** com cada valor acima.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"Vocabulário e formatação do novo fluxo"`

---

### Task 7: Cliente da API, roteador e casca do app

**Files:** Create `src/api/client.js`, `src/api/endpoints.js`, `src/app/router.js`, `src/app/AppShell.jsx` (+css), `src/app/TopNav.jsx`, `src/app/BottomNav.jsx`, `src/features/auth/LoginPage.jsx`, `src/features/auth/ForcedPasswordPage.jsx`; Modify `src/main.jsx` (renderiza `AppShell`); Test `src/app/app.test.jsx`.

**Interfaces:**
- `request(method, url, body?) -> Promise<json>`; lança `ApiError {status, code, message}`; em 401 chama o callback registrado por `onUnauthorized(fn)`; mensagem padrão de rede: "Sem conexão com o servidor. Nada foi salvo."
- `endpoints`: `getSession()`, `login(username, password)`, `logout()`, `getToday()`, `getDashboard()`, `act(patientId, categoryId, body)`, `restore(patientId, categoryId, before)`, `updatePatient(id, fields)`, `mergePatient(sourceId, targetId)`, `importFile(file)`, mais os de configurações já existentes (`/api/categories`, `/api/auth/password`, `/api/admin/*`).
- `useRoute() -> {path, params, query, navigate(to, {replace})}` sobre `history.pushState` + `popstate`. Rotas: `/hoje`, `/pacientes`, `/pacientes/:id`, `/importar`, `/configuracoes`, `/configuracoes/:secao`; `/` redireciona para `/hoje`.
- O servidor já serve `index.html` para rotas desconhecidas (fallback existente) — conferir que `/hoje` recarregado funciona.
- `AppShell`: checa sessão; sem sessão → `LoginPage`; `mustChangePassword` → `ForcedPasswordPage` (reaproveita a lógica de `PasswordChangeForm` com os novos componentes); senão `TopNav` (≥ 768 px) / `BottomNav` (< 768 px) + página da rota.

- [ ] **Step 1: Testes:** `request em 401 chama onUnauthorized`; `erro de rede vira ApiError com a mensagem padrão`; `navigate('/pacientes') troca a página e o voltar retorna a /hoje`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS e `npm run build`.
- [ ] **Step 5: Commit** — `"Casca do app: rotas, navegação e cliente da API"`

---

### Task 8: `useToday` — ações otimistas, "Movido para…" e desfazer

**Files:** Create `src/state/useToday.js`; Test `src/state/useToday.test.jsx`.

**Interfaces:**
- `useToday() -> { status: 'loading'|'ready'|'error', items, counts, categories, referenceDate, moved: Map<key,{toStage, until}>, lastMovedStage, act(item, body), undo(key), canUndo(key), reload() }` — `lastMovedStage` é a etapa de destino da última ação (alimenta `StageTabs.pulseId`); `canUndo(key)` é verdadeiro enquanto houver `before` guardado nesta sessão com `key = \`${patientId}:${categoryId}\``.
- `act`: (1) aplica o estágio previsto localmente (`contacted→aguardando`, `scheduled→agendado`, `done→concluido`, `no_show→chamar`, `archive→fora`); (2) registra `moved[key] = {toStage, until: now+4000}`, mantendo o item visível na etapa de origem; (3) chama `endpoints.act`; (4) sucesso: substitui os itens do paciente pelos `items` devolvidos, guarda `before` e mostra toast "Movido para {etapa}" com ações "Ver" (navega para `/hoje?etapa=…`) e "Desfazer" (8000 ms); (5) erro: reverte o item, remove `moved[key]`, toast com a mensagem do `ApiError`.
- `undo(key)`: chama `endpoints.restore` com o `before` guardado e aplica os `items` devolvidos; toast "Desfeito".
- Contadores derivados dos itens locais (atualizam na hora).

- [ ] **Step 1: Testes** (mock de `endpoints`, fake timers):
  - `act contacted mantém o item visível por 4000 ms com moved e depois o remove de chamar`
  - `contadores mudam imediatamente (chamar -1, aguardando +1)`
  - `erro de rede reverte o item e mostra a mensagem` (Review Focus 2)
  - `undo chama restore com o before e devolve o item a chamar`
  - `canUndo é falso para itens sem ação nesta sessão`
  - `toast oferece Ver e Desfazer`
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"Estado da tela Hoje com ações otimistas e desfazer"`

---

### Task 9: Tela Hoje

**Files:** Create `src/features/today/TodayPage.jsx`, `TaskRow.jsx`, `ScheduleDialog.jsx`, `ArchiveDialog.jsx`, `whatsapp.js` (+css); Test `src/features/today/today.test.jsx`.

**Interfaces:**
- Consumes: `useToday` (Task 8), `STAGES`/`dueText`/`ruleText`/`reasonText`/`doneActionLabel` (Task 6), UI kit (Task 5).
- `TodayPage`: título "Hoje · {formatLongDate}"; `StageTabs` (etapa vem de `?etapa=`, padrão `chamar`); `Select` "Todos os procedimentos" (`?proc=`); busca por nome/telefone (filtro local); lista de `TaskRow`; `EmptyState` com título "Ninguém para chamar agora" e corpo apontando a etapa ou procedimento com mais itens, quando existir.
- `TaskRow({item, moved, onAction, onOpen})`:
  - Estado normal: `Avatar`, nome (botão que abre a ficha `/pacientes/:id`), linha "{categoryName} · {ruleText}" + `reasonText`, `Badge` com `dueText` (em `agendado`: "Agendado para {data}").
  - Ação principal por etapa: `chamar` → "Enviar WhatsApp" (sem telefone: "Adicionar telefone", abre a ficha com o campo de telefone focado — Review Focus 1); `aguardando` → "Agendou"; `agendado` → `doneActionLabel(item)`; `concluido` → "Desfazer" só se `canUndo(key)`, senão "Abrir ficha".
  - `Menu` "⋯": chamar → Agendou, Não vai voltar; aguardando → Mandar de novo, Não vai voltar; agendado → Remarcar, Faltou.
  - Estado `moved`: fundo `--status-done-bg`, texto "✓ Movido para {etapa}", botões "Ver" e "Desfazer"; `aria-live` na linha.
  - Celular: nome + selo na 1ª linha, procedimento na 2ª, botão principal `fullWidth`.
- `openWhatsApp(item)` em `whatsapp.js`: abre `https://wa.me/{whatsappNumber}?text={encodeURIComponent(mensagem da fase)}` com `window.open(url, '_blank', 'noopener,noreferrer')` e então `act(item, {action:'contacted', cycleKey: item.cycleKey})`.
- `ScheduleDialog`: campo de data (mínimo hoje) → `act(item, {action:'scheduled', date})`.
- `ArchiveDialog`: motivos "Parou o tratamento", "Teve alta", "Pausar até…" (com data), "Não volta mais em nenhum procedimento" (exige confirmação nomeando paciente e procedimentos) → `act(item, {action:'archive', reason, until, allCategories})`.

- [ ] **Step 1: Testes:**
  - `Enviar WhatsApp abre wa.me com a mensagem e registra contato`
  - `paciente sem telefone mostra "Adicionar telefone" e não abre wa.me`
  - `linha movida mostra "Movido para Aguardando resposta" com Desfazer`
  - `etapa vem da URL (?etapa=agendado) e trocar a aba atualiza a URL`
  - `filtro de procedimento e busca reduzem a lista`
  - `"Não volta mais em nenhum procedimento" pede confirmação com o nome do paciente`
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"Tela Hoje"`

---

### Task 10: Ficha do paciente

**Files:** Create `src/features/patient-sheet/PatientSheet.jsx`, `ProcedureSection.jsx`, `AutosaveField.jsx`, `MergeSection.jsx` (+css); Test `src/features/patient-sheet/sheet.test.jsx`.

**Interfaces:**
- Rota `/pacientes/:id` abre `Sheet` sobre a página de origem (Hoje ou Pacientes); fechar volta à URL anterior.
- Dados: itens do paciente vindos de `getDashboard()` (todas as categorias) + `allPatients` para unificação.
- Ordem das seções conforme spec 3.3; "O que fazer agora" reaproveita as mesmas ações de `TaskRow` (via `useToday().act`) para cada item em etapa ativa.
- `AutosaveField({label, value, onSave, multiline, type})`: salva no `blur` se o valor mudou; estados "Salvando…", "Salvo" (some em 2 s) e erro inline com o texto do `ApiError`; usado para nome, telefone e anotação (`endpoints.updatePatient`).
- `ProcedureSection`: última sessão, próximo retorno, `Select` de protocolo 15/21/30 (capilar; envia `customIntervalDays`), data personalizada (envia `customDueDate`; se anterior à última sessão mostra erro "A data precisa ser depois da última sessão ({data})").
- Histórico recolhível; "Editar cadastro" e "Unificar cadastro duplicado" recolhidos por padrão; unificar pede `Dialog` de confirmação.

- [ ] **Step 1: Testes:** `editar telefone e sair do campo salva e mostra "Salvo"`; `erro ao salvar mostra a mensagem no campo e mantém o valor digitado`; `data personalizada anterior à última sessão mostra erro`; `abrir com ?campo=telefone foca o telefone`; `Esc fecha e volta para /hoje`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"Ficha do paciente com salvamento automático"`

---

### Task 11: Tela Pacientes

**Files:** Create `src/features/patients/PatientsPage.jsx` (+css); Test `src/features/patients/patients.test.jsx`.

**Interfaces:** lista a partir de `getDashboard()`; uma linha por paciente com procedimentos como `Badge`s e a situação mais urgente; filtros `Select` "Procedimento" e "Situação" (`Em acompanhamento` = `stage` em `chamar|aguardando|agendado|concluido`; `Ainda não é hora`; `Fora da lista`; `Sem telefone`); busca; contagem "N pacientes". Linha abre `/pacientes/:id`.

- [ ] **Step 1: Testes:** `filtro "Sem telefone" mostra só quem não tem telefone`; `filtro "Fora da lista" mostra arquivados com o motivo`; `busca por telefone encontra o paciente`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar → **Step 4:** PASS.
- [ ] **Step 5: Commit** — `"Tela Pacientes"`

---

### Task 12: Importar agenda, Configurações e remoção da interface antiga

**Files:**
- Create: `src/features/import/ImportPage.jsx`, `src/features/settings/SettingsPage.jsx`, `PrazosSection.jsx`, `MyPasswordSection.jsx`, `UsersSection.jsx`, `AuditSection.jsx`, `BackupsSection.jsx` (+css)
- Delete: `src/App.jsx`, `src/components/` (todos), `src/styles.css`
- Test: `src/features/settings/settings.test.jsx`, `src/features/import/import.test.jsx`

**Interfaces:**
- `ImportPage`: área de arrastar/selecionar (`.xlsx,.xls,.csv`), botão "Importar agenda"; resultado: "Importados {validEvents} atendimentos · {newPatients} pacientes novos · {removedAppointments} removidos (cancelados)" e, se `cleanupSkipped > 0`, aviso "{cleanupSkipped} agendamentos mantidos (parecia exportação parcial)".
- `SettingsPage` com seções por `/configuracoes/:secao` (`prazos`, `senha`, `usuarias`, `auditoria`, `backups`); seções de admin só aparecem para `role === 'admin'`. Portar a lógica de `SettingsModal`, `AdminModal` e `PasswordChangeForm` para os novos componentes, sem mudar as chamadas de API.
- Link de backup completo (admin) em Backups.

- [ ] **Step 1: Testes:** `recepção não vê Usuárias, Auditoria, Backups nem edição de prazos`; `importação mostra o resumo e o aviso de exportação parcial`; `troca de senha com confirmação diferente mostra erro`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar e apagar a interface antiga → **Step 4:** `npm test` e `npm run build` PASS; `grep -rn "style={{" src/features src/app` sem resultados.
- [ ] **Step 5: Commit** — `"Importar agenda e Configurações no novo visual; remove interface antiga"`

---

### Task 13: Verificação final e publicação

**Files:** nenhum novo (ajustes que a verificação exigir).

- [ ] **Step 1:** `npm test` → todos PASS; `npm run build` → sucesso; `npm audit --omit=dev` → 0 vulnerabilidades.
- [ ] **Step 2:** Servidor isolado com a base fictícia (`scratchpad/ux/gen_fake.mjs`, 134 pacientes, `DATA_DIR` temporário) e navegador em 375×812, 820×1180 e 1280×800. Conferir e registrar com captura: primeiro paciente visível sem rolar no celular; nenhuma rolagem horizontal da página; etapas visíveis sem rolagem; WhatsApp → "Movido para Aguardando resposta" → Desfazer; Agendou com data; Fez o retoque; Não vai voltar (todos) com confirmação e desfazer; ficha salva campo; recepção sem itens de admin; foco ao abrir/fechar a ficha; `prefers-reduced-motion`.
- [ ] **Step 3:** Rodar `vectorlab-ux-skills:ux-audit` sobre as telas novas e corrigir falhas de regra obrigatória.
- [ ] **Step 4:** Commit dos ajustes; push para `origin/main` quando a usuária autorizar.
- [ ] **Step 5:** Publicar: confirmar backup diário recente em `/data/backups` e envio ao R2; `railway up --ci`; conferir logs (migração `user_version 2`, boot limpo, "[Backup externo] Enviado") e `GET /api/health`; pedir à usuária para validar com a equipe.
