# Motora ERP

> Toda fase segue o [protocolo obrigatório de revisão](docs/PHASE_REVIEW_PROTOCOL.md): revisão regressiva, zero defeito conhecido e continuidade para a fase seguinte.

Fundação de um ERP SaaS multiempresa e multifilial para oficinas automotivas, construído com Next.js, TypeScript, React, Tailwind CSS e Supabase.

## Estado atual

A Fase 1 iniciou com:

- interface responsiva do shell administrativo;
- login real via Supabase Auth;
- onboarding transacional de empresa e filial;
- banco versionado com memberships, RBAC, sequências e auditoria;
- RLS para isolamento entre empresas e filiais;
- clientes Supabase para browser e servidor;
- documentação de arquitetura e implantação.

A Fase 2 acrescentou:

- central de atendimento;
- clientes e veículos com edição e arquivamento seguro;
- agenda por filial;
- recepção e check-in com quilometragem, combustível e avarias;
- inspeções configuráveis;
- orçamentos versionáveis com itens e totais no banco;
- ordens de serviço em tabela e Kanban;
- numeração transacional, histórico de status e conversão de orçamento em OS;
- RLS e permissões para todos os novos módulos.

As Fases 3 e 4 completaram compras, estoque, inventário, transferências, contas a pagar e receber, pagamentos, caixa, comissões, conciliação e relatórios financeiros.

A Fase 5 acrescenta:

- CRM com segmentação e indicadores de recorrência, inatividade, inadimplência e satisfação;
- garantias e retornos com análise, decisão e ordem de serviço separada;
- contratos, motoristas, veículos e faturamento consolidado de frotas;
- modelos de mensagens, regras e fila idempotente de automações;
- portal externo do cliente com token temporário, aprovação de orçamento e avaliação;
- painéis de BI operacional, comercial, financeiro e de estoque;
- cadastro e trilha de eventos de integrações sem expor credenciais ao navegador;
- RLS, escopo multiempresa/multifilial, auditoria e revisão regressiva das cinco fases.
- central de notificações operacionais, recuperação de senha e administração de configurações;
- exportação e anonimização LGPD com bloqueios transacionais e trilha de auditoria;
- seed separado para demonstração e checklist final de implantação;
- go-live com Dev Admin, Superadmin, Gerente e Administrativo, tela de cargos com palavras-chave e criação protegida de perfis personalizados.

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e informe as chaves do Supabase.
2. Aplique, em ordem, as migrations em `supabase/migrations`.
3. Instale as dependências com `pnpm install`.
4. Execute `pnpm dev`.

Consulte [a arquitetura](docs/ARCHITECTURE.md) e [a implantação](docs/DEPLOYMENT.md) antes de ampliar os módulos.
Use também o [checklist de entrega](docs/DELIVERY_CHECKLIST.md) para produção, demonstração, segurança, permissões e integrações pendentes.
