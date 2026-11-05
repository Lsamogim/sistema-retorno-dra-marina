# Redesign do frontend — Controle de Retornos (Dra. Marina)

Data: 2026-11-05 · Status: aprovado por partes no chat, aguardando revisão desta especificação

## 1. Contexto e objetivo

A Dra. Marina tentou usar o sistema e não entendeu as informações nem o que clicar. Ao marcar uma caixinha, o cartão do paciente sumia da tela sem aviso (ele mudava de status e saía do filtro padrão "Para chamar"). Auditorias de interface e de código (2026-11-05) confirmaram:

- A tela abre filtrando só `atrasado + vencendo`; quase toda ação muda o status e o cartão é removido sem feedback (caixinhas e "Já chamei" não geram aviso nem desfazer).
- 24 controles antes do primeiro paciente, 4 dimensões de filtro, 8 abas de status; no celular o primeiro paciente fica abaixo da dobra e as abas de destino ficam escondidas em rolagem horizontal sem barra.
- Vocabulário inconsistente (Retoque/Retorno/Procedimento/1º-2º retorno; 6 formas de "tirar da lista"; quatro "Todos").
- Sistema visual sem escala: 123 cores soltas, 15 tamanhos de fonte, 69 paddings, 14 raios, 10 sombras; bordas de campos com contraste 1,6:1; informação crítica em 11 px.

**Objetivo:** uma interface que a Dra. e a recepção entendam sem explicação, onde nada some sem a tela dizer para onde foi, igualmente boa no computador, no iPad e no celular.

### Usuários e aparelhos
- Recepção e Dra. Marina usam igualmente, em computador, celular e iPad.
- A agenda (planilha) é importada **uma vez por semana**; entre importações a equipe registra manualmente "agendou" e "veio".

### Critérios de sucesso
1. Ao abrir, fica evidente "quem chamar hoje e o que fazer com cada um".
2. Nenhuma ação remove um paciente da vista sem mostrar o destino e oferecer desfazer.
3. No celular (375×812) o primeiro paciente aparece sem rolar.
4. Contraste WCAG 2.1 AA (texto ≥ 4,5:1; componentes de interface ≥ 3:1) e alvos de toque ≥ 44 px.
5. Registrar um contato leva 1 toque (hoje: 2, e o segundo é esquecido).

### Fora do escopo
- Regras de cálculo de retorno (intervalos, fases) — continuam as atuais.
- Contas, auditoria, backups — mantidos; só ganham o novo visual.
- Modo escuro, notificações push, envio automático de WhatsApp.

## 2. Fluxo e regras (Parte 1 — aprovada)

### 2.1 Etapas
Quatro etapas fixas, sempre visíveis, com contador:

| Etapa | Quem aparece | Ação principal | Outras ações |
|---|---|---|---|
| **Chamar** | Prazo vencido ou vencendo em até 5 dias; "Aguardando resposta" há mais de 3 dias volta como **2ª tentativa** (e 3ª…); agendamento manual cuja data passou sem confirmação volta como **Faltou?** | Enviar WhatsApp | Agendou · Não vai voltar · Adicionar telefone (se não houver) |
| **Aguardando resposta** | Contato registrado há ≤ 3 dias | Agendou | Mandar de novo · Não vai voltar |
| **Agendados** | Agendamento futuro da planilha **ou** "Agendou" manual com data futura | Veio / fez o procedimento | Remarcar · Faltou |
| **Concluídos** | Retorno marcado como feito nos últimos 7 dias | — | Desfazer |

Fora do fluxo do dia (só na tela **Pacientes**): **Ainda não é hora** (próximo retorno a mais de 5 dias) e **Fora da lista** (arquivado).

### 2.2 Regras
1. **Nada some em silêncio.** Após uma ação, o cartão permanece no lugar por ~4 s em estado "✓ Movido para *Etapa* · Ver · Desfazer", depois sai com animação; o contador da etapa de destino pulsa. Um aviso no rodapé (região `aria-live`) repete o destino com "Ver" e "Desfazer" por 8 s.
2. **Botões com nome de ação** substituem caixinhas: "Enviar WhatsApp", "Agendou", "Veio", "Fez o retoque", "Fez nova aplicação". Ações de efeito grande mostram a consequência ("Próximo contato: 05/05/2027").
3. **WhatsApp registra o contato:** um toque abre `wa.me` com a mensagem pronta e move o paciente para "Aguardando resposta" (com desfazer). Sem telefone, o botão principal vira "Adicionar telefone".
4. **Vocabulário único:** Botox/Preenchimento: "Retoque (15 dias)" e "Nova aplicação (6 meses)". Capilar: "Sessão a cada 15/21/30 dias". Tirar da lista: "Não vai voltar" com motivo (Parou o tratamento · Teve alta · Pausar até [data] · Não volta mais em nenhum procedimento). Datas por extenso relativo ("Atrasado 2 dias", "Vence em 3 dias"), nunca "2d".
5. **Categoria é etiqueta e filtro**, não ponto de partida. "Hoje" reúne todos os procedimentos; seletor "Todos os procedimentos ▾" filtra.
6. **Confirmação** para "Não volta mais em nenhum procedimento", nomeando o paciente e as categorias afetadas.
7. **Importação semanal reconcilia:** um agendamento real da planilha substitui o "Agendou" manual; um atendimento real marca o retorno como feito.

### 2.3 Ações por etapa → efeito no servidor
| Ação | Efeito | Destino |
|---|---|---|
| Enviar WhatsApp | `contacted_at = agora`, `contact_attempts += 1` | Aguardando resposta |
| Mandar de novo | idem | Aguardando resposta (prazo de 3 dias reinicia) |
| Agendou (data) | `scheduled_for = data` | Agendados |
| Remarcar (data) | `scheduled_for = nova data` | Agendados |
| Veio / Fez o retoque / Fez nova aplicação | marca o marco ativo como feito (`review`/`renewal` atuais) + `done_at = agora`; limpa `scheduled_for`, `contacted_at`, `contact_attempts` | Concluídos (7 dias) → Ainda não é hora |
| Faltou | limpa `scheduled_for` | Chamar ("Faltou — remarcar") |
| Não vai voltar (motivo) | `archived = 1`, motivo; "Pausar até" grava `archived_until` | Fora da lista (Pacientes) |
| Desfazer | restaura o estado anterior exato (snapshot devolvido pela ação) | etapa original |

## 3. Telas (Parte 2 — aprovada)

### 3.1 Navegação
- Três áreas: **Hoje**, **Pacientes**, **Importar agenda** + engrenagem (**Configurações**).
- Computador/iPad: barra superior. Celular (< 768 px): barra inferior fixa (Hoje · Pacientes · Agenda · Mais).
- Rotas com URL: `/hoje?etapa=chamar|aguardando|agendados|concluidos&proc=<categoria>`, `/pacientes`, `/pacientes/:id` (ficha), `/importar`, `/configuracoes/...`. O botão voltar do navegador/celular funciona.

### 3.2 Hoje
- Cabeçalho: "Hoje · quinta, 5 de novembro".
- Etapas: pílulas em linha (≥ 768 px) ou grade 2×2 (celular). Nunca rolagem horizontal escondida.
- Filtro de procedimento e busca na mesma linha.
- Lista ordenada por urgência (mais atrasado primeiro). Sem seletor de ordenação, sem "Recentes", sem filtros "Atrasados"/"Vencendo".
- Linha (≥ 768 px, ~56–64 px de altura): avatar com iniciais · nome · "Procedimento · regra" · selo de prazo · ação principal · menu "⋯" com as demais ações.
- Cartão (celular): nome + selo na 1ª linha, procedimento na 2ª, botão principal em largura total.
- Paciente com mais de um procedimento pendente aparece uma vez por procedimento (cada linha é uma tarefa).
- Tela vazia orienta: "Ninguém para chamar hoje. Botox tem 3 vencendo esta semana →".

### 3.3 Ficha do paciente
- Painel lateral (≥ 1024 px, largura 440 px, lista continua visível); tela cheia no iPad retrato e celular.
- Ordem: (1) nome, telefone, botão WhatsApp; (2) **O que fazer agora** — ações da etapa; (3) **Procedimentos** — por categoria: última sessão, próximo retorno, protocolo 15/21/30 (capilar), data personalizada; (4) Anotações; (5) Histórico; (6) recolhidos: Editar cadastro, Unificar cadastro duplicado.
- Cada campo salva sozinho ao sair dele, com "Salvo" discreto e tratamento de erro no próprio campo. Não existe "Salvar ficha".
- Foco vai para o título ao abrir e volta ao cartão de origem ao fechar; `Esc` fecha.

### 3.4 Pacientes
Busca + lista de todos com filtros: procedimento; situação (Em acompanhamento · Ainda não é hora · Fora da lista · Sem telefone). Clique abre a ficha.

### 3.5 Importar agenda
Área de arrastar/selecionar arquivo; resultado em linguagem simples: "Importados 301 atendimentos · 4 agendamentos confirmados · 2 removidos (cancelados) · 47 mantidos (parecia exportação parcial)".

### 3.6 Configurações
Seções: Prazos e mensagens (admin) · Minha senha · Usuárias · Auditoria · Backups (admin). Reaproveita a lógica atual com o novo visual.

### 3.7 Login e troca obrigatória de senha
Mesma lógica atual, novo visual.

## 4. Identidade visual (Parte 3 — aprovada: paleta Quantus)

### 4.1 Cores
| Token | Valor | Papel |
|---|---|---|
| `--color-ink` (Haiti) | `#18102B` | texto principal, barra de navegação, aba ativa |
| `--color-brand` (Electric Violet) | `#834DFB` | ação principal (fundo), marca, avatar |
| `--color-brand-strong` | `#4A2BB8` | texto/links em violeta, botão secundário |
| `--color-brand-soft` | `#EEEAFE` | fundos suaves de violeta (avatar, contador) |
| `--color-highlight` (Turbo) | `#F0E100` | destaque pontual: contador da etapa ativa, indicador de seção atual. **Nunca texto.** |
| `--color-canvas` (Blue Chalk) | `#F5F3FF` | fundo das telas |
| `--color-surface` | `#FFFFFF` | cartões, painéis |
| `--color-ink-2` | `#4B4462` | texto secundário |
| `--color-ink-3` | `#5E5775` | metadados (6,8:1 sobre branco; 6,2:1 sobre canvas) |
| `--color-border` | `#E4DFF7` | borda decorativa de cartão |
| `--color-border-control` | `#8C84A8` | borda de campos e controles (3,5:1 sobre branco; 3,2:1 sobre canvas) |
| Situação | `atrasado #A3201A/#FDECEC` · `vence em breve #8A5300/#FFF4D6` · `aguardando #1D4ED8/#E8EFFE` · `concluído/movido #14653A/#E9F8EF` · `fora da lista #4B4462/#EFEDF5` | selos e estados |

Contrastes medidos: selos de situação entre 5,8:1 e 6,6:1; violeta escuro sobre canvas 8,2:1; Haiti sobre Turbo 13,5:1; texto da barra escura 9,0:1.

Regras: branco sobre violeta (4,75:1) só em botões ≥ 13 px semibold; texto Haiti sobre Turbo; cores de situação nunca usam o violeta; WhatsApp usa o violeta (ação principal), com ícone do WhatsApp.

### 4.2 Tipografia
Plus Jakarta Sans servida localmente (`@fontsource`), pesos 400/500/600/700. Escala: 12/16 (legenda) · 14/20 (meta, selos) · 15/22 (corpo desktop) · 16/24 (corpo celular, campos) · 18/26 (título de seção) · 22/28 (título de página) · 28/34 (destaque). Campos com 16 px no celular (evita zoom do iOS).

### 4.3 Espaço, forma e profundidade
- Espaçamento base 4: 4, 8, 12, 16, 24, 32, 48.
- Raios: 6 (selos), 10 (botões/campos), 14 (cartões), 20 (painéis/celular), 999 (pílulas).
- Sombras: `sm` (cartão em hover), `md` (painel lateral), `overlay` (diálogos).
- Alturas de controle: 36 px (compacto, só desktop) e 44 px (padrão/toque).
- Movimento: 150–250 ms com `transform`/`opacity`; desativado com `prefers-reduced-motion`.

### 4.4 Componentes (`src/ui/`)
Button (primary · secondary · ghost · danger; md 44 / sm 36; com ícone) · IconButton · Badge (variantes de situação) · StageTabs · Select · TextField/TextArea · Card · Sheet (painel lateral/tela cheia com foco preso) · Dialog (confirmações) · Toast (com ação) · Avatar · EmptyState · Menu (ações "⋯"). Nenhum `style={{}}` inline nas telas.

## 5. Arquitetura técnica (Parte 4 — aprovada)

### 5.1 Frontend
```
src/
  main.jsx, app/        App shell, roteador (History API, sem biblioteca), AuthGate
  api/                  client.js (fetch, erros, 401 global), endpoints.js
  domain/               stages.js (rótulos/ordem das etapas), vocab.js, dates.js
  state/                useToday (dados + mutações otimistas + desfazer), useSession
  ui/                   componentes da seção 4.4 (cada um com .module.css)
  features/
    today/              TodayPage, StageTabs, TaskRow, MovedState
    patients/           PatientsPage, filtros
    patient-sheet/      PatientSheet e seções
    import/             ImportPage
    settings/           Prazos, MinhaSenha, Usuárias, Auditoria, Backups
    auth/               Login, TrocaObrigatoriaDeSenha
  styles/tokens.css, base.css
```
- Mutação: aplica o novo estado localmente, mostra "Movido para…", envia a requisição; em erro, reverte e mostra a mensagem. A resposta traz o item atualizado e o `before` para desfazer.
- Sem recarregar o painel inteiro após cada ação.
- Dependências novas: `@fontsource/plus-jakarta-sans`; dev: `vitest`, `@testing-library/react`, `jsdom`.

### 5.2 Servidor
1. `returnEngine` passa a devolver `stage` em cada item: `chamar | aguardando | agendado | concluido | ainda_nao | fora`, além de `attempt` (nº da tentativa) e `reason` (`atrasado | vencendo | segunda_tentativa | faltou`).
2. Novas colunas em `patient_category_states`: `scheduled_for TEXT`, `done_at TEXT`, `contact_attempts INTEGER DEFAULT 0`, `archived_until TEXT` (migração numerada via `PRAGMA user_version`).
3. Regras: aguardando expira em 3 dias (`contacted_at`); concluído visível por 7 dias (`done_at`); `scheduled_for` passado sem atendimento → chamar/`faltou`; `archived_until` passado → volta ao fluxo.
4. `PATCH /api/patients/:id/categories/:cat` aceita `{action: 'contacted'|'scheduled'|'done'|'no_show'|'archive'|'unarchive', ...}` e responde `{item, before}`; `POST /api/patients/:id/categories/:cat/restore` recebe o `before` e o restaura (inclusive o caso "todos os procedimentos", com um `before` por categoria). O formato atual do PATCH continua aceito durante a transição.
5. `GET /api/today` devolve os itens das 4 etapas com contadores; `GET /api/dashboard` permanece para Pacientes/compatibilidade.
6. Auditoria registra as novas ações (`contacted`, `scheduled`, `done`, `no_show`, `restore`).

### 5.3 Testes
- Servidor (`node --test`): mapeamento de etapas (todas as transições da tabela 2.3, expirações de 3 e 7 dias, faltou, pausa), restore.
- Interface (Vitest + Testing Library): ação → estado "Movido para" → desfazer; erro de rede reverte; ficha salva campo e mostra erro.
- Navegador, com a base fictícia (134 pacientes): 375×812, 820×1180, 1280×800; checklist de contraste, alvos de 44 px, foco e `prefers-reduced-motion`.

### 5.4 Publicação
Troca direta (aprovado): após testes com dados fictícios, publicar no Railway substituindo a interface atual. Backup manual antes do deploy (a migração só adiciona colunas).

## 6. Riscos e decisões em aberto
- Violeta não é uma cor "clínica" tradicional: decisão consciente da cliente (paleta escolhida em 2026-11-05).
- A borda de controle (3,2:1 sobre o canvas) está perto do mínimo: campos ficam sobre fundo branco sempre que possível.
- Paciente com vários procedimentos pendentes aparece em várias linhas; se a equipe achar repetitivo, agrupar por paciente numa iteração futura.
