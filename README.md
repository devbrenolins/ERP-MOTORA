# Motora ERP

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

## Desenvolvimento

1. Copie `.env.example` para `.env.local` e informe as chaves do Supabase.
2. Aplique `supabase/migrations/20260714170000_foundation.sql`.
3. Instale as dependências com `pnpm install`.
4. Execute `pnpm dev`.

Consulte [a arquitetura](docs/ARCHITECTURE.md) e [a implantação](docs/DEPLOYMENT.md) antes de ampliar os módulos.
