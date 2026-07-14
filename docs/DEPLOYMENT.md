# Implantação

## Supabase

1. Crie um projeto e aplique, na ordem, todos os arquivos de `supabase/migrations`; a segunda migration depende integralmente da fundação.
2. Em Authentication, habilite e-mail/senha e configure a URL do site.
3. Use apenas buckets privados para documentos operacionais; URLs devem ser assinadas no servidor.
4. Preencha as variáveis descritas em `.env.example`. A service role nunca pode usar o prefixo `NEXT_PUBLIC_`.
5. Crie um usuário e acesse `/onboarding`; a função transacional cria empresa, filial, memberships, papéis e sequências.

## Vercel

1. Importe o repositório como projeto Next.js.
2. Cadastre `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_APP_URL` por ambiente.
3. Use `pnpm build` como comando de build e mantenha Node 22 ou superior.
4. Adicione a URL de produção à lista de redirect URLs do Supabase Auth.
5. Antes de promover, valide login, onboarding, isolamento entre duas empresas e bloqueio de acesso sem permissão.

## Checklist de segurança

- RLS ativa em toda tabela exposta pela API.
- Nenhuma chave administrativa no navegador.
- Uploads privados com tipo e tamanho validados.
- Funções `security definer` com `search_path` fixo e privilégios mínimos.
- Auditoria sem permissão de update/delete para usuários da aplicação.
- Testes de acesso horizontal e isolamento multiempresa aprovados.
