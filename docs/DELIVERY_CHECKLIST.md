# Checklist de entrega e implantação

## Ambiente real

- Aplicar todas as migrations em ordem e não executar `supabase/demo_seed.sql`.
- Configurar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente hospedado.
- Habilitar autenticação por e-mail/senha e confirmação de e-mail conforme a política comercial.
- Cadastrar a URL de produção e `/reset-password` nas URLs de redirecionamento do Supabase Auth.
- Criar buckets privados para anexos e emitir somente URLs assinadas.
- Concluir o onboarding para criar empresa, primeira filial, papéis e sequências.
- Validar uma segunda empresa de teste antes de liberar novos clientes.

## Ambiente de demonstração

1. Usar um projeto Supabase separado da produção.
2. Criar o usuário de demonstração no Auth.
3. Aplicar as migrations.
4. Executar `supabase/demo_seed.sql` uma única vez; o script é idempotente.
5. Manter credenciais de demonstração fora do repositório e rotacioná-las periodicamente.

## Segurança

- RLS ativa em todas as tabelas expostas.
- Papéis `anon` e `authenticated` sem `TRUNCATE`, `REFERENCES` ou `TRIGGER` em tabelas públicas.
- Funções `security definer` com `search_path` fixo e concessões explícitas.
- Service role, senha do banco e tokens somente no servidor ou ambiente local ignorado.
- Tokens do portal armazenados somente como hash, com expiração e revogação.
- Operações financeiras, estoque, garantias e anonimização executadas por funções transacionais.
- Testar acesso horizontal, usuário sem permissão, sessão expirada e token inválido.
- Revisar retenção, consentimento, exportação e anonimização antes da operação comercial.

## Permissões avançadas

| Módulo | Permissões principais |
| --- | --- |
| CRM | `crm.view`, `crm.manage` |
| Garantias | `warranties.view`, `warranties.manage`, `warranties.approve` |
| Frotas | `fleets.view`, `fleets.manage` |
| Automações | `automations.view`, `automations.manage` |
| Portal | `portal.view`, `portal.manage` |
| BI | `bi.view` |
| Integrações | `integrations.view`, `integrations.manage` |
| Notificações | `notifications.view`, `notifications.manage` |
| Privacidade | `privacy.view`, `privacy.export`, `privacy.anonymize` |

## Integrações pendentes

A aplicação entrega cadastro seguro, endpoints, fila idempotente e histórico de eventos. O envio real depende de contratos e credenciais externas para:

- WhatsApp Business;
- provedor de e-mail e SMS;
- adquirentes e gateways de pagamento;
- conciliação bancária/Open Finance;
- emissão fiscal municipal/estadual;
- contabilidade;
- catálogos de peças e consulta veicular.

Cada adaptador deve consumir segredos por referência no servidor, aplicar retentativas limitadas e registrar sucesso ou erro em `integration_events`.
