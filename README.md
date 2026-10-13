# Kindora Paws

Site de donativos em euros para apoiar a alimentação, os medicamentos e os cuidados diários de cães em abrigo. Marca provisória criada para este projeto. A estrutura foi inspirada em https://canil.funchal.pt/; o projeto não reutiliza a identidade municipal nem afirma automaticamente uma parceria com a Câmara Municipal do Funchal.

## O que está incluído

- Página responsiva, navegação móvel e botão fixo de doação.
- Interface principal em inglês, alemão, francês, espanhol e português.
- Quatro fotografias reais dos cães do abrigo, originais PNG e versões WebP para o site.
- Valores rápidos, valor personalizado de €5 a €10.000 e frequência única/mensal.
- Stripe Checkout, webhooks assinados, confirmação real e Customer Portal para os apoios mensais.
- Banco Supabase com RLS, registo de pagamentos, reembolsos e processamento idempotente.
- Administração completa em `/admin.html`: conteúdo em cinco idiomas, aparência, uploads de imagens, páginas, pixels/tags, condições, organização, planos, produtos e pedidos.
- Loja com carrinho, estoque reservado no servidor, frete fixo por país permitido e entrega digital após pagamento confirmado.
- Privacidade e termos base em inglês, com campos da organização carregados do banco.
- Google Ads e Meta Pixel preparados; scripts opcionais só carregam após consentimento. Não foram configurados IDs de anúncios.

## Abrir localmente

Instale Node.js 24 LTS para executar também os testes TypeScript do backend. O site estático e o servidor local funcionam em Node.js 22 ou posterior. Para servir o site não é necessário instalar dependências. Para executar a bateria de testes, rode `npm ci` primeiro (Happy DOM é uma dependência apenas de desenvolvimento).

```bash
npm start
```

Acesse http://localhost:3000. Abrir `index.html` por `file://` não executa corretamente os módulos JavaScript.

```bash
npm test
npm run check
```

## Estado atual

O projeto Supabase `rnqceahikiauoosdlype` foi preparado nesta entrega. Consulte `docs/ESTADO-DA-ENTREGA.md` para as verificações executadas. As funções do frontend apontam para esse projeto. Não reaplique a migração manualmente sobre o mesmo banco.

**Stripe live e webhook estão configurados nas Edge Functions.** Os checkouts abrem assim que os dados da organização (identidade legal, registo, morada, contacto e textos de privacidade) forem preenchidos no painel `/admin.html`, ou via SQL em `public.campaign_settings`. A página não simula pagamentos aprovados, números de doadores ou casos de resgate.

## Configuração e hospedagem

Leia `docs/STRIPE-E-SUPABASE.md` e `docs/DEPLOY-EASYPANEL.md`. O frontend pode ser hospedado como site estático em qualquer serviço. O backend roda nas Edge Functions do Supabase, independentemente da hospedagem do site.

`dist/config.js` contém apenas informações públicas. Chaves secretas, service role, token de CLI e senha do banco não estão no projeto. Configure segredos exclusivamente no servidor. As credenciais privadas compartilhadas na conversa devem ser substituídas antes do lançamento.

## Estrutura

```text
dist/                 Site pronto para servir
assets-originals/     Quatro imagens PNG originais
supabase/             SQL, RLS e Edge Function donations
scripts/              Servidor local e validações
tests/                Testes automatizados e teste SQL com rollback
docs/                 Configuração, deploy, estado e marca
PROMPT-DEVIN.md        Instruções para completar a configuração real
Dockerfile            Frontend servido por Nginx na porta 80
```

## Material de divulgação

A identidade e a descrição de cada imagem estão em `docs/MARCA-E-IMAGENS.md`. Os prompts de vídeos e anúncios serão desenvolvidos na próxima etapa, após confirmar a identidade real da campanha. Nenhum anúncio, campanha ou email foi publicado/enviado por este projeto.
