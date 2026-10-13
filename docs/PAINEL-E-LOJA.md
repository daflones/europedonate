# Painel completo e loja

## Primeiro acesso

Abra `/admin.html`, expanda **Primeiro acesso: criar administrador**, informe o código privado recebido na entrega e escolha seu email e uma palavra-passe com pelo menos 12 caracteres. Depois entre com esses dados. Não é enviado convite ou email de confirmação. O código deixa de criar administradores após a primeira conta autorizada.

O código não está no ZIP nem no Git. No servidor ele está em `ADMIN_BOOTSTRAP_SECRET`. Se perder o código antes de criar sua conta, um responsável com acesso ao Supabase pode substituir esse secret. Depois do primeiro administrador, gerencie membros pelo Supabase; o bootstrap não concede novos acessos.

## O que pode gerir

| Área | Controles |
| --- | --- |
| Visão geral | Totais live separados para doações e vendas |
| Doações | Dados do doador, frequência, status, opt-in e paginação |
| Pedidos | Itens, endereço de entrega, pagamento, notas, preparação, envio e rastreio |
| Planos e produtos | Preços, descrições, imagens, traduções, publicação e estoque |
| Textos | Conteúdo principal em EN/DE/FR/ES/PT |
| Páginas | Páginas novas e modelos editáveis de privacidade, doações e compras; blocos de texto, imagem e botão |
| Aparência | Nome, slogan, cores, estilo de títulos, logo, fotos e seções visíveis |
| Pixels e tags | Google Ads, GA4, GTM, Meta Pixel, scripts HTTPS e domínio canonical |
| Condições | Mínimo/máximo, valores rápidos, mensal, abertura de checkouts, frete, países e Stripe Tax |
| Organização | Identificação, contactos, políticas, links reais e relatórios |
| Conta | Alteração da palavra-passe |

As imagens enviadas pelo painel ficam no bucket público `site-media`, com upload permitido somente para administradores. Formatos PNG/JPG/WebP/GIF até 10 MB. Não use esse bucket para guardar dados dos doadores.

## Tipos do catálogo

- `support_once`: apoio/doação única; não inclui entrega de mercadoria.
- `support_monthly`: plano de apoio mensal; cria subscrição Stripe.
- `physical`: produto vendido, com carrinho, frete e endereço recolhido no checkout.
- `digital`: produto vendido, com URL de entrega acessível na confirmação privada depois de pago.

Há três apoios iniciais editáveis: €10/mês, €25/mês e €25 uma vez. O catálogo já inclui produtos físicos publicados (prints, postais, tote bag e caneca) e fotografias digitais com entrega por ligação. Ajuste preços, descrições, imagens, traduções e estoque no painel conforme a operação real.

Produtos digitais não publicados ou sem URL de entrega não podem ser comprados. Os arquivos digitais não usam DRM: a confirmação protege a apresentação do link, mas a proteção final do arquivo depende do serviço de arquivos escolhido.

## Estoque e entrega

O servidor obtém os preços do banco e reserva estoque numa transação. Pedidos repetidos usam a mesma referência e chave de idempotência. Ao expirar ou falhar, a reserva é devolvida uma só vez. Reservas antigas sem checkout vinculado são libertadas após 75 minutos, na próxima consulta do catálogo. Uma sessão de checkout da loja expira em uma hora.

O frete é fixo, em EUR, para o carrinho que contém produto físico. Os países aceitos são configuráveis no painel. Não há cotação de transportadora ou expedição automática. O administrador é responsável pelo envio e pode registrar o rastreio. Reembolsos financeiros são feitos no Dashboard Stripe e registrados pelo webhook; o estoque de produtos devolvidos deve ser ajustado conforme a devolução física real.

## Políticas e publicação

Os modelos `privacy`, `donation-terms` e `purchase-terms` aparecem como rascunhos no painel. Ao editar e publicar, passam a substituir o conteúdo dessas páginas correspondentes. A operação deve distinguir uma compra de um donativo, divulgar o recebedor real e cumprir os direitos aplicáveis aos produtos vendidos.

Pixels e scripts de marketing dependem de consentimento. Não coloque script de pagamentos ou chaves privadas nos campos de tags. O consentimento é carregado nas páginas públicas, incluindo as páginas personalizadas.

## Estado das cobranças

A chave Stripe live e o webhook estão configurados. A ativação live solicitada foi rejeitada pela revisão automática porque os dados públicos e de política do recebedor ainda estavam incompletos. O pacote mantém os checkouts fechados e os controles de prontidão. Nenhuma cobrança foi efetuada.

Preencha as informações verdadeiras no painel, configure o domínio e revise a operação real para concluir a ativação. O nome da conta Stripe fornecida é “Multi Crypto”, Brasil, com moeda padrão BRL; o site deve deixar clara a relação desse recebedor com o canil beneficiado.
