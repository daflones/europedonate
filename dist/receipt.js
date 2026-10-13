import { config } from './config.js';
import { safeStorage, initialiseConsent, trackConfirmedDonation } from './tracking.js';
import {loadRuntime,safeAsset}from'./site-runtime.js';
const isOrder=document.body.dataset.order==='true';
const texts = {
 en:{home:'Back to home',checking:'Checking your donation…',pending:'Your payment is being confirmed.',pendingBody:'Some payment methods take longer. This page will update after confirmation from the payment provider.',thanks:'Thank you for your kindness.',thanksBody:'Your donation has been confirmed. Your support helps make everyday care possible.',invalid:'Confirmation link unavailable.',invalidBody:'This link is incomplete or could not be verified. Please use the original confirmation link or contact the organisation. No payment is made by this page.',failed:'Your payment did not complete.',failedBody:'You can return to the website to try again or choose another payment method.',refunded:'Your donation has been refunded.',partial:'A partial refund has been recorded.',amount:'Amount',frequency:'Frequency',reference:'Reference',status:'Status',once:'One-time',monthly:'Monthly',paid:'Confirmed',processing:'Awaiting confirmation',retry:'Check again',manage:'Manage monthly donation',private:'Keep this confirmation link private. It gives access to the management of your donation.',error:'The payment service is unavailable. Please try again.',test:'Test payment confirmed. No live donation was received.'},
 de:{home:'Zur Startseite',checking:'Spende wird geprüft…',pending:'Ihre Zahlung wird bestätigt.',pendingBody:'Einige Methoden brauchen länger. Die Seite aktualisiert sich nach Bestätigung des Zahlungsanbieters.',thanks:'Danke für Ihre Freundlichkeit.',thanksBody:'Ihre Spende wurde bestätigt. Sie unterstützen damit die tägliche Versorgung.',invalid:'Bestätigungslink nicht verfügbar.',invalidBody:'Dieser Link ist unvollständig oder konnte nicht geprüft werden. Nutzen Sie den ursprünglichen Link oder kontaktieren Sie die Organisation. Diese Seite löst keine Zahlung aus.',failed:'Zahlung nicht abgeschlossen.',failedBody:'Sie können zur Website zurückkehren und es erneut versuchen.',refunded:'Ihre Spende wurde erstattet.',partial:'Eine Teilerstattung wurde erfasst.',amount:'Betrag',frequency:'Häufigkeit',reference:'Referenz',status:'Status',once:'Einmalig',monthly:'Monatlich',paid:'Bestätigt',processing:'Bestätigung ausstehend',retry:'Erneut prüfen',manage:'Monatliche Spende verwalten',private:'Halten Sie den Link privat. Er ermöglicht die Verwaltung Ihrer Spende.',error:'Zahlungsdienst nicht verfügbar. Bitte erneut versuchen.',test:'Testzahlung bestätigt. Es wurde keine echte Spende empfangen.'},
 fr:{home:'Retour à l’accueil',checking:'Vérification de votre don…',pending:'Votre paiement est en cours de confirmation.',pendingBody:'Certains moyens prennent plus de temps. La page sera mise à jour après confirmation du prestataire.',thanks:'Merci pour votre générosité.',thanksBody:'Votre don est confirmé. Votre soutien contribue aux soins du quotidien.',invalid:'Lien de confirmation indisponible.',invalidBody:'Ce lien est incomplet ou ne peut être vérifié. Utilisez le lien original ou contactez l’organisation. Cette page n’effectue aucun paiement.',failed:'Le paiement n’a pas abouti.',failedBody:'Vous pouvez revenir au site et réessayer avec un autre moyen de paiement.',refunded:'Votre don a été remboursé.',partial:'Un remboursement partiel est enregistré.',amount:'Montant',frequency:'Fréquence',reference:'Référence',status:'Statut',once:'Ponctuel',monthly:'Mensuel',paid:'Confirmé',processing:'Confirmation en attente',retry:'Vérifier à nouveau',manage:'Gérer le don mensuel',private:'Gardez ce lien privé. Il permet de gérer votre don.',error:'Le service de paiement est indisponible. Réessayez.',test:'Paiement test confirmé. Aucun don réel n’a été reçu.'},
 es:{home:'Volver al inicio',checking:'Comprobando tu donación…',pending:'Estamos confirmando tu pago.',pendingBody:'Algunos métodos tardan más. La página se actualizará tras la confirmación del proveedor.',thanks:'Gracias por tu bondad.',thanksBody:'Tu donación está confirmada. Tu apoyo ayuda a hacer posibles los cuidados diarios.',invalid:'Enlace de confirmación no disponible.',invalidBody:'El enlace está incompleto o no se puede verificar. Usa el enlace original o contacta con la organización. Esta página no realiza pagos.',failed:'El pago no se completó.',failedBody:'Puedes volver al sitio e intentarlo con otro método.',refunded:'Tu donación ha sido reembolsada.',partial:'Se ha registrado un reembolso parcial.',amount:'Cantidad',frequency:'Frecuencia',reference:'Referencia',status:'Estado',once:'Puntual',monthly:'Mensual',paid:'Confirmado',processing:'Pendiente de confirmación',retry:'Comprobar de nuevo',manage:'Gestionar donación mensual',private:'Mantén este enlace privado. Permite gestionar tu donación.',error:'El servicio de pago no está disponible. Inténtalo de nuevo.',test:'Pago de prueba confirmado. No se recibió ninguna donación real.'},
 pt:{home:'Voltar ao início',checking:'A verificar o seu donativo…',pending:'O pagamento está a ser confirmado.',pendingBody:'Alguns métodos demoram mais. Esta página será atualizada após a confirmação do prestador.',thanks:'Obrigado pelo seu carinho.',thanksBody:'O donativo foi confirmado. O seu apoio ajuda a tornar possíveis os cuidados diários.',invalid:'Ligação de confirmação indisponível.',invalidBody:'A ligação está incompleta ou não pôde ser verificada. Use a ligação original ou contacte a organização. Esta página não efetua pagamentos.',failed:'O pagamento não foi concluído.',failedBody:'Pode voltar ao site e tentar outro método de pagamento.',refunded:'O seu donativo foi reembolsado.',partial:'Foi registado um reembolso parcial.',amount:'Valor',frequency:'Frequência',reference:'Referência',status:'Estado',once:'Único',monthly:'Mensal',paid:'Confirmado',processing:'A aguardar confirmação',retry:'Verificar novamente',manage:'Gerir donativo mensal',private:'Mantenha esta ligação privada. Ela permite gerir o seu donativo.',error:'O serviço de pagamento está indisponível. Tente novamente.',test:'Pagamento de teste confirmado. Nenhum donativo real foi recebido.'}
};
const params = new URLSearchParams(location.search);
const language = [params.get('lang'), safeStorage.get('kindora-language')].find(x => texts[x]) || 'en';
const t = key => texts[language][key];
document.documentElement.lang = language;
const $ = id => document.getElementById(id);
let credentials;
try {
  const input = { session_id: params.get('session_id'), receipt: params.get('receipt') };
  if (input.session_id && input.receipt) { credentials = input; sessionStorage.setItem('kindora-last-receipt', JSON.stringify(input)); }
  else credentials = JSON.parse(sessionStorage.getItem('kindora-last-receipt') || 'null');
} catch { credentials = { session_id: params.get('session_id'), receipt: params.get('receipt') }; }
// Remove the private token before optional marketing code is loaded.
history.replaceState({}, '', `${location.pathname}?lang=${language}`);
for (const [id,key] of [['receipt-home','home'],['back-home','home'],['receipt-title','checking'],['amount-label','amount'],['frequency-label','frequency'],['reference-label','reference'],['status-label','status'],['retry-status','retry'],['manage-donation','manage'],['receipt-private','private']]) $(id).textContent=t(key);
let attempts = 0;
let polling;
let busy = false;
async function api(route) {
  const response = await fetch(`${config.apiBase}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(response.status === 404 ? 'invalid' : 'error');
  return response.json();
}
async function check() {
  if (busy) return;
  clearTimeout(polling);
  if (!credentials?.session_id || !credentials?.receipt) { $('receipt-title').textContent=t('invalid'); $('receipt-message').textContent=t('invalidBody'); $('retry-status').hidden=true; return; }
  busy=true; $('retry-status').disabled=true; $('receipt-error').hidden=true;
  try {
    const receipt=await api(isOrder?'order-status':'status');
    const pending=['pending','processing'].includes(receipt.status);
    const paid=receipt.status==='paid';
    $('receipt-title').textContent=t(paid ? 'thanks' : receipt.status==='refunded' ? 'refunded' : receipt.status==='partially_refunded' ? 'partial' : pending ? 'pending' : 'failed');
    $('receipt-message').textContent=paid ? (receipt.livemode ? t('thanksBody') : t('test')) : t(pending ? 'pendingBody' : receipt.status.includes('refunded') ? 'thanksBody' : 'failedBody');
    $('receipt-details').hidden=false;
    $('receipt-amount').textContent=new Intl.NumberFormat(language,{style:'currency',currency:'EUR'}).format(receipt.amount_cents/100);
    $('receipt-frequency').textContent=t(receipt.frequency==='monthly'?'monthly':'once');
    $('receipt-reference').textContent=receipt.reference;
    $('receipt-status').textContent=t(paid?'paid':pending?'processing':receipt.status==='refunded'?'refunded':receipt.status==='partially_refunded'?'partial':'failed');
    $('manage-donation').hidden=!receipt.can_manage;
    $('retry-status').hidden=!pending;
    if(isOrder){
      const titles={en:'Your order is confirmed.',de:'Ihre Bestellung ist bestätigt.',fr:'Votre commande est confirmée.',es:'Tu pedido está confirmado.',pt:'O seu pedido está confirmado.'};
      if(paid)$('receipt-title').textContent=titles[language];
      const parent=$('order-products');parent?.replaceChildren();
      for(const item of receipt.items||[]){const p=document.createElement('p');p.textContent=`${item.quantity} × ${item.title}`;parent?.append(p);const url=safeAsset(item.download_url);if(url&&paid){const a=document.createElement('a');a.href=url;a.className='button button-outline button-small';a.target='_blank';a.rel='noopener';a.textContent='Download';parent?.append(a);}}
      if(paid)safeStorage.remove('kindora-cart');
    }
    if (paid) trackConfirmedDonation(receipt,isOrder);
    if (pending && attempts++ < 12) polling=setTimeout(check,5000);
  } catch(error) {
    if(error.message==='invalid'){$('receipt-title').textContent=t('invalid');$('receipt-message').textContent=t('invalidBody');}
    else {$('receipt-error').textContent=t('error');$('receipt-error').hidden=false;}
  } finally {busy=false;$('retry-status').disabled=false;}
}
$('retry-status').addEventListener('click',()=>{attempts=0;check();});
$('manage-donation').addEventListener('click',async()=>{
  $('manage-donation').disabled=true;
  try { const data=await api('portal');const url=new URL(data.url);if(url.hostname!=='billing.stripe.com'||url.protocol!=='https:')throw new Error();location.assign(url.href); }
  catch {$('receipt-error').textContent=t('error');$('receipt-error').hidden=false;}
  finally {$('manage-donation').disabled=false;}
});
initialiseConsent();loadRuntime().catch(()=>{}).finally(check);
