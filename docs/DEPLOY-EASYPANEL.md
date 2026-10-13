# Hospedar com domínio .com

## EasyPanel com Dockerfile

1. Extraia o ZIP. Envie o conteúdo para seu repositório Git. O `Dockerfile` deve ficar na raiz do repositório, juntamente com a pasta `dist`.
2. No EasyPanel crie um serviço **App**, escolha a origem Git e a branch correta.
3. Selecione **Dockerfile** como build. Porta interna do serviço: **80**. O container usa Nginx; não usa `npm start` dentro dessa imagem.
4. Faça deploy e adicione o domínio .com com HTTPS. Se usar Cloudflare, crie o DNS apropriado para o servidor e configure SSL de ponta a ponta. Não use uma imagem que force conversão cambial ou local de recebedor diferente do real.
5. No Supabase altere `SITE_URL` e `ALLOWED_ORIGINS` para o domínio final. Inclua o `www` apenas se ele também for usado. Remova `http://localhost:3000` do ambiente público quando concluir os testes locais.
6. Em `dist/config.js` preencha `canonicalUrl` com a URL HTTPS final. Adicione canonical e metadados sociais absolutos de acordo com esse domínio.
7. Configure a Stripe e os dados reais no painel. Verifique o checkout e o retorno no domínio final antes de abrir os anúncios.

## Hospedagem estática

Você pode enviar **o conteúdo de `dist/`** para uma hospedagem estática comum. Todo o backend continua no Supabase. Preserve os arquivos `.html`, `.js`, `.css`, `robots.txt` e `assets/`. Não envie `.env`.

## Publicar para indexação

Enquanto é prévia, todas as páginas usam `noindex` e `robots.txt` bloqueia indexação. Na campanha pública, depois de concluir as informações e verificar a operação:

- Remova `noindex,nofollow` da página principal e das políticas públicas.
- Mantenha `/admin.html` e `/thank-you.html` sem indexação.
- Atualize `robots.txt` para permitir a página principal e bloquear `/admin`, `/admin.html`, `/thank-you` e `/thank-you.html`.
- Crie um sitemap com o domínio final se necessário.

## Google Ads e Meta

Preencha os IDs públicos no `dist/config.js`. O Google Ads precisa de `googleTagId` no formato `AW-...` e `googleAdsConversionLabel`; Meta precisa de `metaPixelId`. Os códigos só são carregados com consentimento opcional. Uma visita à página de sucesso não dispara conversão: o evento exige estado `paid`, ambiente live e referência não marcada anteriormente no browser.

Esta implementação faz tracking no browser com deduplicação local. Não inclui Meta Conversions API, Enhanced Conversions, Google Consent Mode avançado com CMP certificada, nem envio de dados pessoais aos anúncios. Ajuste as integrações que a campanha real exigir com o Devin. Nenhuma aprovação de Google/Meta ou resultado de anúncios é garantido pelo site.

## Git

O pacote não contém tokens, service role nem senha do banco. Revise alterações, mantendo `.env` ignorado. Antes de publicar código de produção, substitua as credenciais privadas que foram compartilhadas na conversa. Não envie `assets-originals` à hospedagem estática se quiser reduzir o tamanho do deploy; elas são material de edição.
