# Configurar Stripe e Supabase

## Stripe: o que você precisa pegar

1. **Secret key**: `sk_test_...` para testar; `sk_live_...` para produção. Obtenha no Dashboard Stripe → Developers/Workbench → API keys. Configure como `STRIPE_SECRET_KEY` nos secrets da Edge Function. Não coloque no frontend nem no Git.
2. **Webhook signing secret**: `whsec_...`, da URL de webhook cadastrada na Stripe. Configure como `STRIPE_WEBHOOK_SECRET`. O segredo do ambiente de teste é diferente do ambiente live e do Stripe CLI.
3. **Domínio HTTPS final**: usado em `SITE_URL` e `ALLOWED_ORIGINS`.
4. **Conta Stripe ativada**, com destinatário legal correto, conta bancária de recebimento, dados de suporte e métodos elegíveis ativados. Receber o checkout em EUR não garante que a Stripe liquidará EUR sem conversão; isso depende da conta e da conta bancária configuradas.

Não é necessária publishable key `pk_...` nesta arquitetura: o browser redireciona para o Stripe Checkout hospedado. Ela só será necessária se você decidir implementar Elements/checkout embutido no futuro. Produtos e preços fixos também não são necessários: o backend cria `price_data` para o valor escolhido.

## Webhook

URL exata do projeto:

```text
https://rnqceahikiauoosdlype.supabase.co/functions/v1/donations/webhook
```

Use a versão **2026-09-30.endive**, a mesma definida no backend. Eventos:

```text
checkout.session.completed
checkout.session.async_payment_succeeded
checkout.session.async_payment_failed
checkout.session.expired
invoice.paid
invoice.payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
charge.refunded
```

`invoice.paid` contabiliza os pagamentos mensais. O primeiro pagamento mensal não é contado novamente como pagamento único. Assinatura validada sobre o corpo original, janela de cinco minutos e chave única do evento. Os reembolsos que chegam antes dos pagamentos são reconciliados posteriormente. Eventos de checkout/subscrição de outras aplicações são ignorados; reembolsos são mantidos como estado mínimo e só afetam um donativo quando há PaymentIntent correspondente.

## Secrets do Supabase

Dashboard → projeto → Edge Functions → Secrets:

| Nome | Valor |
| --- | --- |
| `STRIPE_SECRET_KEY` | Chave secreta do ambiente correto |
| `STRIPE_WEBHOOK_SECRET` | Segredo de assinatura do webhook desse ambiente |
| `STRIPE_API_VERSION` | `2026-09-30.endive` |
| `SITE_URL` | `https://SEU-DOMINIO.com`, sem barra final |
| `ALLOWED_ORIGINS` | `https://SEU-DOMINIO.com,https://www.SEU-DOMINIO.com` |
| `RATE_LIMIT_SALT` | String privada aleatória, já criada no projeto atual |
| `STRIPE_PORTAL_CONFIGURATION` | Opcional: `bpc_...` da configuração do portal |

`SUPABASE_URL` e a chave de servidor são disponibilizadas pelo próprio ambiente hosted. Não configure um secret com prefixo reservado `SUPABASE_`. A função aceita a service role legada ou o mapa de secret keys injetado pela plataforma.

Não altere `RATE_LIMIT_SALT` depois de começar a receber donativos: ela também protege os tokens de confirmação associados aos pedidos existentes. Em desenvolvimento local, preencha um `.env` ignorado pelo Git. Não coloque credenciais num arquivo versionado.

## Métodos de pagamento

O backend não força `payment_method_types`. A Stripe apresenta os métodos elegíveis para a conta, país, moeda, dispositivo e frequência. Cartões, Apple Pay/Google Pay e métodos locais europeus só aparecem quando elegíveis e ativados. Não prometa que todos os métodos locais estarão disponíveis para todas as pessoas ou para subscrições.

Abra Stripe Dashboard → Settings → Payment methods para ajustar a disponibilidade. Configure também Customer Portal para permitir atualização do método de pagamento e cancelamento de subscrições. Desative mudança de plano/preço e proratações nesse portal se não forem parte da operação da campanha. Recibos de pagamento da Stripe podem ser ativados no Dashboard; não equivalem automaticamente a certificados fiscais de caridade.

## Criar um administrador

Crie uma conta em Supabase Dashboard → Authentication → Users → Add user, com email e palavra-passe escolhidos por você. Não é necessário disparar convite. Copie o UUID e execute no SQL Editor:

```sql
insert into public.admin_members(user_id)
values ('UUID-DO-UTILIZADOR')
on conflict do nothing;
```

Abra `/admin.html`. O nome legal, identificação fiscal/registo, país, morada, contacto, retenção de dados e transferências internacionais devem refletir a operação real. Confirme a autorização da campanha e revise as políticas antes de habilitar os donativos. A marca comercial pode ser diferente do destinatário legal; ambos precisam estar claros.

Pode adicionar relatórios e texto de missão verificado com SQL:

```sql
update public.campaign_settings set
  mission_text = '{"en":"YOUR VERIFIED MISSION","pt":"A SUA MISSÃO VERIFICADA"}'::jsonb,
  reports = '[{"title":"Care and spending report","url":"https://YOUR-DOMAIN.com/report.pdf"}]'::jsonb
where id = true;
```

## Reimplantar ou usar outro banco

No projeto atual a migração já foi aplicada. Para outro projeto novo, aplique `supabase/migrations/20261013181000_kindora_donations.sql` uma única vez, atualize `dist/config.js` e configure os secrets.

Com Supabase CLI autenticado por variável de ambiente ou login local:

```bash
supabase link --project-ref rnqceahikiauoosdlype
supabase functions deploy donations --no-verify-jwt
```

O gateway JWT está desativado nessa função porque a doação é anónima e a Stripe não envia um JWT Supabase. A rota de pagamento exige origem autorizada e validação do pedido; o webhook exige assinatura Stripe. A anon/publishable key não dá acesso às tabelas financeiras.

## Verificação final na Stripe

Teste em sandbox: pagamento aprovado, cartão recusado, SCA/3DS, cancelamento, um método assíncrono, mensal, cancelamento de mensal e reembolso parcial/total. Reenvie um webhook para confirmar que o total não duplica. Depois teste os métodos efetivamente ativados na conta live. A chave live foi recebida e configurada, mas não foram executadas cobranças com cartão nem testes sandbox. Consulte o estado da entrega e o bloqueio de ativação registrado.

## Referências oficiais

- https://docs.stripe.com/checkout/quickstart
- https://docs.stripe.com/webhooks
- https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods
- https://docs.stripe.com/api/versioning
- https://docs.stripe.com/api/invoice-payment/list
- https://supabase.com/docs/guides/functions/secrets
- https://supabase.com/docs/guides/database/postgres/row-level-security


O primeiro acesso administrativo também pode ser criado pela interface usando o código privado de configuração, sem executar SQL manual. Leia `PAINEL-E-LOJA.md`. As migrações de CMS, loja, Storage e páginas também já foram aplicadas ao projeto atual.
