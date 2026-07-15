# Revisão de go-live

Data: 14 de julho de 2026

## Hierarquia inicial

- **Dev Admin**: acesso técnico integral do programador, incluindo testes, usuários, configurações e cargos;
- **Superadmin**: dono da empresa, com acesso integral de negócio e elevação de cargos;
- **Gerente**: operação, equipe, indicadores e aprovações, sem elevar cargos;
- **Administrativo**: atendimento, cadastros, documentos e relatórios, sem elevar cargos;
- perfis funcionais adicionais: Consultor de atendimento, Mecânico, Estoquista, Comprador, Financeiro, Caixa, Vendedor, Auditor e Somente leitura.

O código interno `super_admin` representa o Dev Admin. O código interno `owner` representa o Superadmin. Essa separação mantém compatibilidade com as políticas existentes sem expor nomenclatura técnica ao usuário.

## Controles revisados

- apenas Dev Admin e Superadmin recebem `roles.manage`;
- tentativas de conceder `roles.manage` a outros cargos são bloqueadas por trigger;
- criação de cargo personalizado ocorre em RPC transacional;
- cargos personalizados nunca podem receber `roles.manage`;
- tela de cargos mostra descrição, palavras-chave e total de permissões;
- todas as quatro contas iniciais autenticaram com sucesso;
- Dev Admin e Superadmin possuem 85 de 85 permissões;
- Gerente possui 77 permissões e Administrativo possui 29;
- RLS permanece ativa em todas as tabelas públicas;
- lint remoto do banco sem erros.

## Recuperação de acesso

O fluxo foi movido para modos públicos da rota `/login`, evitando o redirecionamento indevido observado no primeiro teste de produção. Os endereços antigos permanecem como redirecionamentos temporários para compatibilidade.
