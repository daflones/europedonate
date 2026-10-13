# Estado da entrega — 13/10/2026

## Atualização do painel e da loja

O painel completo inclui CMS, páginas, cores, uploads de imagens, pixels/tags, condições de doação, planos e catálogo, pedidos e entrega. O catálogo diferencia apoios, mensal, produtos físicos e digitais. Leia `PAINEL-E-LOJA.md`.

Stripe live e webhook foram configurados com a chave recebida. O webhook é `we_1UQAmAL4rsC34JUt8O6hAM10`, URL `https://rnqceahikiauoosdlype.supabase.co/functions/v1/donations/webhook`. A conta retorna cobranças e repasses habilitados, identificação comercial Multi Crypto, país BR e moeda padrão BRL. Nenhuma cobrança foi feita.

20 testes automatizados passaram, incluindo duas simulações de DOM para o painel e a página pública. Os testes SQL de doação e de loja passaram no banco real com rollback. As leituras anónimas das tabelas financeiras, catálogo administrativo e páginas administrativas retornaram 401. Os endpoints públicos de health, config, catálogo e navegação responderam 200. A configuração informa `checkout_ready=true`, `donations_enabled=false` e `shop_enabled=false`.

A revisão automática rejeitou a ativação live que usaria uma identificação pública ainda incompleta. Esse bloqueio permanece: faltam os dados reais de identificação, endereço, contacto e políticas do recebedor. A tarefa de implementar os pagamentos nas Edge Functions foi concluída; a abertura de cobranças está pendente. Não houve teste com cartão live/sandbox nem QA visual em browser.
