# Painel da Oficina (Agenda) + Portal do Cliente

Funcionalidades adicionadas em julho/2026: quadro operacional estilo planilha em `/painel-oficina`
e portal do cliente ampliado em `/portal`, com timeline permanente, fotos, anexos e notificações.

## Rotas e componentes

| Rota | Componente | Descrição |
| --- | --- | --- |
| `/painel-oficina` | `components/workshop-board.tsx` | Quadro estilo Excel com todos os veículos, cores por status, alteração rápida e tempo real |
| `/portal` | `components/customer-portal.tsx` | Portal do cliente com login por CPF + placa (ou código de acesso), progresso e timeline |
| — | `components/service-progress.tsx` | Barra de progresso e timeline reutilizáveis (painel + portal) |
| — | `lib/workshop.ts` | Tipos e metadados de status: grupos de cor, rótulos, etapas, indicadores e formatadores |

## Cores das linhas (identificação rápida)

Cada linha do quadro é pintada pelo grupo do status (tokens em `app/globals.css`, com variante dark):

| Grupo | Cor | Status incluídos |
| --- | --- | --- |
| Agendado | 🔵 azul | `awaiting_triage`, `queued` |
| Aguardando diagnóstico | 🟡 amarelo | `diagnosis`, `awaiting_estimate`, `awaiting_approval` |
| Aguardando peças | 🟠 laranja | `awaiting_parts` |
| Em manutenção | 🟣 roxo | `in_progress`, `paused`, `outsourced`, `testing`, `washing` |
| Finalizado | 🟢 verde | `awaiting_payment`, `ready` |
| Entregue | ⚫ grafite | `delivered` |
| Atrasado | 🔴 vermelho | derivado: `due_at` no passado e serviço ainda aberto |
| Cancelado | ⬜ cinza | `cancelled` |

Indicadores ao lado do ícone do carro: atrasado (⚠), parado há 3+ dias (🕒), esperando peça (📦),
aguardando aprovação (💲), em andamento (🛠), finalizado (✅) e pronto para retirada (🚗).

## Banco de dados (migration `20260715150000_workshop_board_portal.sql`)

- `work_order_events` — timeline permanente (imutável para usuários: sem `update`/`delete`).
  Alimentada por gatilhos a cada criação de OS e mudança de status, registrando data, hora e usuário.
- `work_order_photos` — fotos por etapa (`intake`, `before`, `during`, `after`, `delivery`), com
  `visible_to_customer` e soft delete.
- `work_order_attachments` — arquivos (PDF da OS, nota fiscal, documentos).
- `notification_settings` — canais escolhidos pelo administrador por filial (WhatsApp, SMS, e-mail)
  e lista de status que disparam aviso. Gerenciado pelo botão "Notificações" do painel
  (exige permissão `notifications.manage`).
- `customer_notifications` — fila de envio (outbox) com `status` `pending|sent|failed|cancelled`.
  O envio real fica a cargo de um worker/integração que consome a fila; a estrutura já está pronta.
- `workshop_board_metrics` — view (security invoker) com os indicadores do dashboard.
- RPCs:
  - `portal_login(p_tax_id, p_license_plate, p_order_number)` — acesso self-service do cliente
    (CPF/CNPJ + placa, ou placa + número da OS). Gera token de 24h em `portal_access_tokens`.
  - `get_customer_portal(p_token)` — ampliado com itens, timeline, fotos, anexos e garantias por OS.
  - `get_team_directory(p_organization_id)` — nomes da equipe (mecânicos/autores) para membros da organização.
- Tempo real: `work_orders` e `work_order_events` adicionados à publicação `supabase_realtime`.
- Storage: bucket `work-order-media` (leitura pública por URL não adivinhável, escrita autenticada).

## Tempo real

- **Painel**: assinatura `postgres_changes` na tabela `work_orders` filtrada pela filial; qualquer
  alteração recarrega o quadro em ~350 ms sem refresh. O selo "Ao vivo" indica a conexão ativa.
- **Portal**: o cliente é anônimo (sem RLS de leitura), então o snapshot é renovado a cada 20 s via
  `get_customer_portal`, além do botão "Atualizar agora".

## Permissões

| Papel | Acesso |
| --- | --- |
| Administrador / Atendente (`work_orders.update`) | Ver painel, trocar status, registrar observações |
| Mecânico (`work_orders.view` + `update`) | Ver painel e atualizar o andamento |
| Administrador (`notifications.manage`) | Configurar canais de aviso automático |
| Cliente (anônimo com token) | Somente leitura do próprio atendimento + aprovação de orçamento e avaliação |

Todas as tabelas novas têm RLS baseada em `has_permission` herdada da OS correspondente.

## Itens, PDF e conversão orçamento → OS

- **Itens e valores** (`components/items-editor.tsx`): ao editar um orçamento ou uma OS, o diálogo
  exibe o lançamento de serviços/peças (tipo, descrição, quantidade, valor unitário, desconto).
  O total do documento é recalculado pelos gatilhos `recalculate_estimate_totals` /
  `recalculate_work_order_totals` — nunca é digitado direto no cabeçalho.
- **PDF imprimível** (`components/document-print.tsx`): botão de impressora nas linhas de
  orçamentos, nos cards do kanban de OS e no drawer do painel. Abre a visualização A4 (empresa,
  cliente, veículo, itens, totais, termos e assinaturas) e usa a impressão do navegador
  (Imprimir → Salvar como PDF). Regras de impressão em `app/globals.css` (`.print-overlay`).
- **Gerar OS**: botão nas linhas de orçamentos chama `convert_estimate_to_work_order` (RPC já
  existente). Itens pendentes são aprovados junto com o orçamento antes da conversão; o orçamento
  fica `converted` e a OS nasce `queued` com os itens copiados.
- **Correção de persistência**: os `defaults` dos módulos genéricos (ex.: `number: ""` para o
  gatilho numerar) passaram a ser aplicados **somente na criação** — antes eram enviados também no
  update, apagando o número do documento na primeira edição e quebrando as edições seguintes por
  violação de unicidade.

## Fluxo de notificação ao cliente

1. Atendente muda o status no painel (atualização otimista, sem recarregar).
2. Gatilho `log_work_order_activity` grava o evento na timeline (com usuário e horário) e, se o
   status estiver na lista configurada, enfileira mensagens nos canais habilitados em
   `customer_notifications`.
3. O worker de integração (WhatsApp/SMS/e-mail) consome a fila e marca `sent`/`failed`.
4. O drawer da OS mostra os avisos enviados e o portal reflete o novo status em até 20 s.
