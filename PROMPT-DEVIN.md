# Prompt para Devin / Windsurf

Você vai concluir a configuração de produção do projeto **Kindora Paws**, um site de donativos em EUR para alimentação, medicamentos e cuidados de cães em abrigo. Trabalhe sobre este projeto; preserve o desenho, a experiência móvel e as imagens existentes.

## Primeiro, leia

`README.md`, `docs/ESTADO-DA-ENTREGA.md`, `docs/STRIPE-E-SUPABASE.md`, `docs/DEPLOY-EASYPANEL.md`, `dist/config.js`, a migração SQL e `supabase/functions/donations/index.ts`.

A página principal já tem cinco idiomas, doação única/mensal, valor livre, navegação móvel e consentimento de marketing. O backend usa Supabase Edge Functions e Stripe REST API. O frontend é HTML/CSS/JS modular estático, sem dependências de execução. Happy DOM é usado apenas nos testes. Não migre para outro framework sem necessidade concreta.

## Dados que o dono fornecerá em ambiente seguro

- Domínio .com HTTPS definitivo.
- Stripe secret key do sandbox e depois live.
- Stripe webhook signing secret do endpoint, diferente em cada ambiente.
- Identificação do responsável legal que recebe os donativos, registo/NIF, país, morada, contacto e autorização da campanha.
- Prazos e fundamentos de retenção de dados; processamento internacional e salvaguardas reais dos fornecedores.
- IDs do Google Ads/Meta, quando houver.
- Fotos, documentos e relatórios reais autorizados, se disponíveis.

Não coloque chaves secretas no código, frontend, logs, commit ou ZIP. Não solicite que o dono publique tokens no chat. O Supabase atual é `rnqceahikiauoosdlype`; as informações públicas estão em `dist/config.js`. A migração foi aplicada ao banco atual: consulte o histórico antes de usar `db push` e não reaplique tabelas existentes. Se usar outro projeto, faça a instalação normal da migração numa base nova.

## Tarefas obrigatórias

1. Execute `npm test` e `npm run check` com Node.js 24. Confirme que o backend deployed corresponde ao código desta entrega.
2. Revise os dados reais da organização. A referência `canil.funchal.pt` é o site municipal; não afirme vínculo institucional sem a informação e autorização reais do responsável. Não invente números, depoimentos, doenças, urgências, registro de caridade ou benefícios fiscais.
3. Configure os secrets Supabase `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL`, `ALLOWED_ORIGINS`, `STRIPE_API_VERSION` e, se usado, `STRIPE_PORTAL_CONFIGURATION`. Preserve `RATE_LIMIT_SALT` já existente para não mudar tokens de confirmação. Não use service role no browser.
4. Cadastre webhook na Stripe: `https://rnqceahikiauoosdlype.supabase.co/functions/v1/donations/webhook`, versão `2026-09-30.endive`, e eventos listados na documentação. O corpo original deve continuar sendo usado para verificar a assinatura.
5. Ative métodos elegíveis no Dashboard Stripe e configure Customer Portal para gerir pagamentos e cancelar futuros apoios mensais. Mantenha seleção dinâmica de métodos; não fixe apenas cartão. Não prometa que todos os métodos europeus estarão disponíveis em todas as contas ou subscrições.
6. Crie uma conta administrativa no Supabase e autorize seu UUID em `public.admin_members`, sem disparar mensagens ou convites não solicitados. O painel `/admin.html` usa RLS; contas comuns não podem consultar dados dos doadores.
7. Revise termos e privacidade para a entidade real. As páginas base estão em inglês. Traduza as políticas completas para os mercados da campanha, se necessário. Ajuste base legal, retenção, localização de processamento, transferências internacionais e direitos aplicáveis com dados confirmados.
8. Faça QA real em browser, em pelo menos 360 px, 390 px, 768 px e 1440 px. Verifique menu, idioma, campos, teclado, cookies, foco, barra fixa, longos textos em alemão, rolagem e checkout. Nesta entrega não houve teste visual em browser; houve verificações estáticas e testes automatizados do backend.
9. Faça testes Stripe sandbox de sucesso, falha, SCA, abandono, método assíncrono, apoio mensal, nova fatura mensal, cancelamento, reembolso parcial/total e webhook reenviado. Verifique que valores em centavos EUR e o total recebido não duplicam. Use `tests/database.integration.sql` para validar a transação com rollback.
10. Preencha `canonicalUrl`, metadados sociais e URLs definitivas. Hospede o frontend no EasyPanel usando Dockerfile e porta interna 80. Atualize as origens permitidas e remova localhost da produção. Verifique HTTPS e retorno Stripe no domínio final.
11. Só abra `donations_enabled` depois de completar a configuração e os dados da campanha. Remova o bloqueio de indexação apenas das páginas públicas apropriadas. Preserve `noindex` em administração e confirmação.
12. Se forem fornecidos IDs de anúncios, configure-os em `dist/config.js`. Carregue marketing somente após consentimento e registre conversão apenas com pagamento `paid` verificado e live. Nunca envie token privado, nome ou email do doador nos eventos atuais.

## Critérios de conclusão

- Frontend e backend sem credenciais privadas versionadas.
- Dados financeiros inacessíveis com anon key ou conta comum.
- Checkout em EUR, com método elegível e retorno no domínio certo.
- Webhook inválido rejeitado; webhooks repetidos não criam duplicidade.
- Redirecionamento não altera um donativo pendente para pago.
- Mensal cria subscrição, contabiliza faturas e permite cancelamento.
- Reembolsos e eventos fora de ordem reconciliados.
- Interface móvel utilizável e cinco idiomas íntegros.
- Destinatário Stripe corresponde ao responsável divulgado no site.
- Relatório final honesto, indicando testes realizados e pendências reais.

Não publique anúncios nem envie emails/mensagens sem instrução expressa. Ao terminar, entregue os arquivos atualizados, instruções de deploy e um ZIP limpo. O dono pretende hospedar com domínio .com; não efetue compras de domínio nem altere configurações de conta fora desse escopo.


## Escopo ampliado já implementado

O dono confirmou que deseja tanto doações quanto produtos vendidos. Preserve o painel completo, o CMS, os uploads no Storage e a loja. Leia `docs/PAINEL-E-LOJA.md`.

- Site público dinâmico lê configurações, textos, visuais, páginas e catálogo via Edge Functions.
- Planos de apoio usam a doação; mercadorias usam `/shop-checkout` e pedidos privados.
- Estoque reservado transacionalmente; expiração devolve estoque sem duplicidade.
- Produtos digitais entregam um link depois da confirmação. Produtos físicos recolhem endereço na Stripe e usam frete fixo configurável.
- Administradores editam entrega/rastreio/notas, sem conseguir alterar totais ou forçar pagamento confirmado.
- O primeiro administrador escolhe email e senha usando um código privado; não existe senha padrão no código ou no ZIP.
- As chaves Stripe live e o webhook já estão nos secrets. Não crie webhook duplicado.
- A ativação live foi bloqueada pela revisão automática por informações públicas do recebedor ainda incompletas. Não contorne esse bloqueio ou invente informações. Complete os dados reais antes de retomar a ativação.

Rode `npm ci` para instalar apenas as dependências de testes, depois `npm test` e `npm run check`. Há 20 testes automatizados e dois testes SQL com rollback: `tests/database.integration.sql` e `tests/shop.integration.sql`. Faça o QA visual e os testes Stripe sandbox restantes, incluindo físico/digital, impostos, frete, falta de estoque e entrega, antes do lançamento.
