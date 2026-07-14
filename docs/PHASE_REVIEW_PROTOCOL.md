# Protocolo obrigatório de encerramento de fase

Este documento complementa o prompt mestre do Motora ERP e é requisito de aceite para todas as fases.

## Regra de conclusão

Uma fase somente pode ser declarada concluída quando estiver com **zero defeito conhecido** após revisão técnica e regressiva. A revisão deve abranger a fase recém-implementada e todas as fases anteriores.

## Revisão obrigatória

Antes de publicar cada fase, executar e registrar:

1. validação das migrations e compatibilidade do banco remoto;
2. revisão das políticas RLS, permissões, funções transacionais e trilha de auditoria;
3. lint, verificação de tipos, testes automatizados e builds de produção;
4. teste dos fluxos críticos, estados vazios, erros, carregamento e responsividade;
5. regressão dos módulos entregues nas fases anteriores;
6. revisão de segurança para segredos, isolamento por organização/filial e operações irreversíveis;
7. correção de todo defeito conhecido antes da publicação.

## Continuidade

Depois que a revisão for aprovada e a versão publicada, o desenvolvimento deve avançar para a próxima fase do prompt mestre, salvo orientação explícita em contrário.

## Evidências

Cada entrega deve informar objetivamente quais validações passaram, quais limitações externas permanecem e se existe algum defeito conhecido. Uma fase não pode ser marcada como concluída se houver falha conhecida sem tratamento.
