# Hospedar — kindorapaws.site

## EasyPanel com Dockerfile

1. O código está no repositório `daflones/europedonate` (branch `main`). O `Dockerfile` fica na raiz, junto com a pasta `dist`.
2. No EasyPanel crie um serviço **App**, origem Git → `daflones/europedonate`, branch `main`.
3. Selecione **Dockerfile** como build. Porta interna do serviço: **80**. O container usa Nginx; não usa `npm start` dentro dessa imagem.
4. Faça deploy e aponte `kindorapaws.site` (e `www.kindorapaws.site`, se desejar) para o serviço com HTTPS ativado.
5. Já configurado: `SITE_URL=https://kindorapaws.site` e `ALLOWED_ORIGINS=https://kindorapaws.site,https://www.kindorapaws.site` nos secrets da Edge Function; `canonical_url=https://kindorapaws.site` no banco e em `dist/config.js`.
6. Verifique o checkout e o retorno da Stripe no domínio final antes de abrir os anúncios.

## Hospedagem estática

Você pode enviar **o conteúdo de `dist/`** para uma hospedagem estática comum. Todo o backend continua no Supabase. Preserve os arquivos `.html`, `.js`, `.css`, `robots.txt` e `assets/`. Não envie `.env`.

## Publicar para indexação

Já aplicado para produção: as páginas públicas não usam `noindex`; `/admin.html`, `/order.html` e `/thank-you.html` seguem bloqueados no `robots.txt`. Crie um sitemap com o domínio final se necessário.

## Google Ads e Meta

Preencha os IDs públicos no `dist/config.js`. O Google Ads precisa de `googleTagId` no formato `AW-...` e `googleAdsConversionLabel`; Meta precisa de `metaPixelId`. Os códigos só são carregados com consentimento opcional. Uma visita à página de sucesso não dispara conversão: o evento exige estado `paid`, ambiente live e referência não marcada anteriormente no browser.

Esta implementação faz tracking no browser com deduplicação local. Não inclui Meta Conversions API, Enhanced Conversions, Google Consent Mode avançado com CMP certificada, nem envio de dados pessoais aos anúncios. Ajuste as integrações que a campanha real exigir com o Devin. Nenhuma aprovação de Google/Meta ou resultado de anúncios é garantido pelo site.

## Git

O pacote não contém tokens, service role nem senha do banco. Revise alterações, mantendo `.env` ignorado. Antes de publicar código de produção, substitua as credenciais privadas que foram compartilhadas na conversa. Não envie `assets-originals` à hospedagem estática se quiser reduzir o tamanho do deploy; elas são material de edição.
