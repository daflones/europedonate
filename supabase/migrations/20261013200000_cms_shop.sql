begin;
alter table public.campaign_settings
  add column responsible_name text,
  add column tagline text not null default 'A kinder tomorrow. One paw at a time.',
  add column content_overrides jsonb not null default '{}'::jsonb,
  add column visual_settings jsonb not null default '{}'::jsonb,
  add column media_settings jsonb not null default '{}'::jsonb,
  add column tracking_settings jsonb not null default '{}'::jsonb,
  add column section_settings jsonb not null default '{}'::jsonb,
  add column donation_min_cents integer not null default 500 check(donation_min_cents between 50 and 1000000),
  add column donation_max_cents integer not null default 1000000 check(donation_max_cents between 50 and 1000000),
  add column quick_amounts_cents jsonb not null default '[1000,2500,5000,10000,15000]'::jsonb,
  add column terms_version text not null default '2026-10-13-v1',
  add column canonical_url text,
  add column shop_enabled boolean not null default false,
  add column shipping_cents integer not null default 990 check(shipping_cents between 0 and 100000),
  add column shipping_countries jsonb not null default '["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","GB","NO","CH"]'::jsonb,
  add column automatic_tax_enabled boolean not null default false,
  add column shop_policy text;
alter table public.campaign_settings add constraint valid_donation_range check(donation_max_cents>=donation_min_cents);
alter table public.donations drop constraint donations_amount_cents_check;
alter table public.donations add constraint donations_amount_cents_check check(amount_cents between 50 and 1000000);

create table public.catalog_products (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('support_once','support_monthly','physical','digital')),
  title jsonb not null default '{}'::jsonb check(length(coalesce(title->>'en',''))>0),
  description jsonb not null default '{}'::jsonb,
  price_cents integer not null check(price_cents between 50 and 1000000),
  image_url text,
  category text,
  stock integer check(stock>=0),
  download_url text,
  published boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.catalog_products(kind,title,description,price_cents,image_url,published,sort_order) values
 ('support_monthly','{"en":"Everyday care","pt":"Cuidados diários","de":"Tägliche Fürsorge","fr":"Les soins du quotidien","es":"Cuidados diarios"}','{"en":"Monthly support for the shared food, medicine and daily-care programme.","pt":"Apoio mensal ao programa comum de alimentação, medicamentos e cuidados diários."}',1000,'/assets/food.webp',true,1),
 ('support_monthly','{"en":"A little more comfort","pt":"Um pouco mais de conforto","de":"Mehr Geborgenheit","fr":"Un peu plus de confort","es":"Un poco más de confort"}','{"en":"A monthly contribution to the programme’s overall needs. No specific treatment or quantity of meals is promised.","pt":"Contribuição mensal para as necessidades gerais do programa, sem prometer tratamentos ou quantidades específicas de refeições."}',2500,'/assets/care.webp',true,2),
 ('support_once','{"en":"A gift of kindness","pt":"Um gesto de carinho","de":"Ein freundlicher Beitrag","fr":"Un geste de bonté","es":"Un gesto de bondad"}','{"en":"One-time support for shared shelter care.","pt":"Apoio único aos cuidados gerais do abrigo."}',2500,'/assets/vet.webp',true,3);
alter table public.donations add column support_product_id uuid references public.catalog_products(id);

create table public.site_pages (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title jsonb not null default '{}'::jsonb,
  blocks jsonb not null default '[]'::jsonb,
  published boolean not null default false,
  show_in_navigation boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique not null,
  receipt_token_hash text not null,
  cart_fingerprint text not null,
  locale text not null default 'en',
  currency text not null default 'eur' check(currency='eur'),
  subtotal_cents integer not null,
  shipping_cents integer not null default 0,
  amount_cents integer not null,
  refunded_cents integer not null default 0,
  status text not null default 'pending' check(status in ('pending','processing','paid','failed','expired','partially_refunded','refunded')),
  fulfillment_status text not null default 'new' check(fulfillment_status in ('new','packing','shipped','completed','cancelled')),
  checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  donor_name text,
  donor_email text,
  shipping_details jsonb,
  tracking_number text,
  admin_notes text,
  inventory_released boolean not null default false,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index shop_orders_created_idx on public.shop_orders(created_at desc);
create table public.shop_order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.shop_orders(id),
  product_id uuid not null references public.catalog_products(id),
  kind text not null,
  title text not null,
  unit_price_cents integer not null,
  quantity integer not null check(quantity between 1 and 99),
  download_url text,
  unique(order_id,product_id)
);

create function public.reserve_shop_order(p_request_id uuid,p_receipt_hash text,p_cart_fingerprint text,p_locale text,p_items jsonb,p_livemode boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_settings public.campaign_settings%rowtype;
  v_order public.shop_orders%rowtype;
  v_product public.catalog_products%rowtype;
  v_item jsonb;
  v_subtotal integer:=0;
  v_shipping integer:=0;
  v_physical boolean:=false;
  v_qty integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
  select * into v_order from public.shop_orders where request_id=p_request_id;
  if found then
    if v_order.cart_fingerprint<>p_cart_fingerprint or v_order.receipt_token_hash<>p_receipt_hash then raise exception 'Request conflict';end if;
    return to_jsonb(v_order);
  end if;
  select * into v_settings from public.campaign_settings where id=true;
  if not v_settings.shop_enabled then raise exception 'Shop closed';end if;
  if jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>20 then raise exception 'Invalid cart';end if;
  for v_item in select value from jsonb_array_elements(p_items) order by value->>'product_id' loop
    v_qty:=(v_item->>'quantity')::integer;
    if v_qty<1 or v_qty>99 then raise exception 'Invalid quantity';end if;
    select * into v_product from public.catalog_products where id=(v_item->>'product_id')::uuid for update;
    if not found or not v_product.published or v_product.kind not in ('physical','digital') then raise exception 'Product unavailable';end if;
    if v_product.stock is not null and v_product.stock<v_qty then raise exception 'Insufficient stock';end if;
    if v_product.kind='digital' and coalesce(v_product.download_url,'')='' then raise exception 'Digital delivery not configured';end if;
    if v_product.stock is not null then update public.catalog_products set stock=stock-v_qty where id=v_product.id;end if;
    v_subtotal:=v_subtotal+v_product.price_cents*v_qty;
    v_physical:=v_physical or v_product.kind='physical';
  end loop;
  if v_physical then v_shipping:=v_settings.shipping_cents;end if;
  if v_subtotal+v_shipping>1000000 then raise exception 'Cart total too high';end if;
  insert into public.shop_orders(request_id,receipt_token_hash,cart_fingerprint,locale,subtotal_cents,shipping_cents,amount_cents,livemode)
    values(p_request_id,p_receipt_hash,p_cart_fingerprint,p_locale,v_subtotal,v_shipping,v_subtotal+v_shipping,p_livemode) returning * into v_order;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.catalog_products where id=(v_item->>'product_id')::uuid;
    insert into public.shop_order_items(order_id,product_id,kind,title,unit_price_cents,quantity,download_url)
      values(v_order.id,v_product.id,v_product.kind,coalesce(v_product.title->>p_locale,v_product.title->>'en'),v_product.price_cents,(v_item->>'quantity')::integer,v_product.download_url);
  end loop;
  return to_jsonb(v_order);
end;
$$;

create function public.apply_shop_event(p_event_id text,p_event_type text,p_event_created bigint,p_livemode boolean,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_order public.shop_orders%rowtype;v_count integer;v_status text;v_item record;
begin
  insert into public.stripe_events(event_id,event_type,event_created,livemode) values(p_event_id,p_event_type,p_event_created,p_livemode) on conflict do nothing;
  get diagnostics v_count=row_count;
  if v_count=0 then return jsonb_build_object('duplicate',true);end if;
  if p_data->>'kind'='shop_refund' then
    select * into v_order from public.shop_orders where stripe_payment_intent_id=p_data->>'payment_intent_id' for update;
    if not found then return jsonb_build_object('ignored',true);end if;
    if v_order.livemode<>p_livemode then raise exception 'Order mode mismatch';end if;
    update public.shop_orders set refunded_cents=greatest(refunded_cents,least(amount_cents,(p_data->>'refunded_cents')::integer)),status=case when (p_data->>'refunded_cents')::integer>=amount_cents then 'refunded' else 'partially_refunded' end,updated_at=now() where id=v_order.id;
    return jsonb_build_object('processed',true);
  end if;
  select * into v_order from public.shop_orders where id=(p_data->>'order_id')::uuid for update;
  if not found or v_order.livemode<>p_livemode then raise exception 'Order mismatch';end if;
  if v_order.checkout_session_id is not null and v_order.checkout_session_id<>p_data->>'session_id' then raise exception 'Session mismatch';end if;
  if p_data->>'currency'<>'eur' then raise exception 'Currency mismatch';end if;
  -- Stripe Tax can add tax after Checkout. Never accept a total below the reserved subtotal+shipping.
  if (p_data->>'amount_cents')::integer<v_order.amount_cents then raise exception 'Amount mismatch';end if;
  v_status:=p_data->>'status';
  if v_order.status in ('paid','partially_refunded','refunded') then v_status:=v_order.status;end if;
  if v_status in ('failed','expired') and not v_order.inventory_released then
    for v_item in select product_id,quantity from public.shop_order_items where order_id=v_order.id loop
      update public.catalog_products set stock=stock+v_item.quantity where id=v_item.product_id and stock is not null;
    end loop;
  end if;
  if v_order.inventory_released and v_status='paid' then raise exception 'Paid order inventory previously released';end if;
  update public.shop_orders set status=v_status,checkout_session_id=p_data->>'session_id',
    stripe_payment_intent_id=coalesce(p_data->>'payment_intent_id',stripe_payment_intent_id),
    amount_cents=(p_data->>'amount_cents')::integer,
    donor_name=coalesce(p_data->>'name',donor_name),donor_email=coalesce(p_data->>'email',donor_email),
    shipping_details=coalesce(nullif(p_data->'shipping_details','null'::jsonb),shipping_details),
    inventory_released=inventory_released or v_status in ('failed','expired'),
    paid_at=case when v_status='paid' then coalesce(paid_at,to_timestamp(p_event_created)) else paid_at end,updated_at=now()
    where id=v_order.id;
  update public.shop_orders o set refunded_cents=least(o.amount_cents,r.refunded_cents),status=case when r.refunded_cents>=o.amount_cents then 'refunded' else 'partially_refunded' end
    from public.stripe_refund_totals r where o.id=v_order.id and o.stripe_payment_intent_id=r.payment_intent_id and o.livemode=r.livemode and r.refunded_cents>0;
  return jsonb_build_object('processed',true);
end;
$$;

create function public.admin_order_summary() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_campaign_admin() then raise exception 'Forbidden';end if;
  return jsonb_build_object('paid_orders',(select count(*) from public.shop_orders where livemode and status in ('paid','partially_refunded','refunded')),
    'net_sales_cents',(select coalesce(sum(amount_cents-refunded_cents),0) from public.shop_orders where livemode and status in ('paid','partially_refunded','refunded')));
end;$$;
revoke all on function public.reserve_shop_order(uuid,text,text,text,jsonb,boolean),public.apply_shop_event(text,text,bigint,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_shop_order(uuid,text,text,text,jsonb,boolean),public.apply_shop_event(text,text,bigint,boolean,jsonb) to service_role;
revoke all on function public.admin_order_summary() from public,anon;
grant execute on function public.admin_order_summary() to authenticated;

alter table public.catalog_products enable row level security;
alter table public.site_pages enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_order_items enable row level security;
revoke all on public.catalog_products,public.site_pages,public.shop_orders,public.shop_order_items from anon,authenticated;
grant select,insert,update,delete on public.catalog_products,public.site_pages to authenticated;
grant select,update on public.shop_orders to authenticated;
grant select on public.shop_order_items to authenticated;
grant all on public.catalog_products,public.site_pages,public.shop_orders,public.shop_order_items to service_role;
grant usage,select on sequence public.shop_order_items_id_seq to service_role;
create policy admin_catalog_all on public.catalog_products for all to authenticated using(public.is_campaign_admin()) with check(public.is_campaign_admin());
create policy admin_pages_all on public.site_pages for all to authenticated using(public.is_campaign_admin()) with check(public.is_campaign_admin());
create policy admin_orders_read on public.shop_orders for select to authenticated using(public.is_campaign_admin());
create policy admin_orders_update on public.shop_orders for update to authenticated using(public.is_campaign_admin()) with check(public.is_campaign_admin());
create policy admin_items_read on public.shop_order_items for select to authenticated using(public.is_campaign_admin());

commit;
