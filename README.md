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

A Fase 2 acrescenta:

- central de atendimento;
- clientes e veículos com edição e arquivamento seguro;
- agenda por filial;
- recepção e check-in com quilometragem, combustível e avarias;
- inspeções configuráveis;
- orçamentos versionáveis com itens e totais no banco;
- ordens de serviço em tabela e Kanban;
- numeração transacional, histórico de status e conversão de orçamento em OS;
- RLS e permissões para todos os novos módulos.

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e informe as chaves do Supabase.
2. Aplique, em ordem, as migrations em `supabase/migrations`.
3. Instale as dependências com `pnpm install`.
4. Execute `pnpm dev`.

Consulte [a arquitetura](docs/ARCHITECTURE.md) e [a implantação](docs/DEPLOYMENT.md) antes de ampliar os módulos.
