begin;

create table public.campaign_settings (
  id boolean primary key default true check (id),
  brand text not null default 'Kindora Paws',
  legal_name text,
  registration_number text,
  shelter_name text,
  country text,
  address text,
  contact_email text,
  privacy_contact_email text,
  privacy_retention_text text,
  privacy_transfer_text text,
  fundraising_authorised boolean not null default false,
  policies_reviewed boolean not null default false,
  donations_enabled boolean not null default false,
  monthly_enabled boolean not null default true,
  images_are_illustrative boolean not null default true,
  mission_text jsonb not null default '{}'::jsonb,
  adoption_url text,
  volunteer_url text,
  reports jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint campaign_launch_details check (
    not donations_enabled or (
      fundraising_authorised and policies_reviewed
      and length(coalesce(legal_name,'')) > 2
      and length(coalesce(registration_number,'')) > 2
      and length(coalesce(country,'')) > 1
      and length(coalesce(address,'')) > 5
      and coalesce(contact_email,'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and length(coalesce(privacy_retention_text,'')) > 20
      and length(coalesce(privacy_transfer_text,'')) > 20
    )
  )
);
insert into public.campaign_settings(id) values (true);

create table public.admin_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create function public.is_campaign_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.admin_members where user_id = auth.uid());
$$;
revoke all on function public.is_campaign_admin() from public;
grant execute on function public.is_campaign_admin() to authenticated;

create table public.donations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  receipt_token_hash text not null check (receipt_token_hash ~ '^[a-f0-9]{64}$'),
  amount_cents integer not null check (amount_cents between 500 and 1000000),
  currency text not null default 'eur' check (currency = 'eur'),
  frequency text not null check (frequency in ('once','monthly')),
  locale text not null default 'en' check (locale in ('en','de','fr','es','pt')),
  status text not null default 'pending' check (status in ('pending','processing','paid','failed','expired','partially_refunded','refunded')),
  checkout_session_id text unique,
  checkout_url text,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  subscription_status text,
  subscription_event_created bigint not null default 0,
  donor_email text,
  donor_name text,
  updates_opt_in boolean not null default false,
  updates_opt_in_at timestamptz,
  terms_version text not null,
  terms_accepted_at timestamptz not null default now(),
  attribution jsonb not null default '{}'::jsonb,
  livemode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz
);
create index donations_created_idx on public.donations(created_at desc);
create index donations_status_idx on public.donations(status);

create table public.donation_payments (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id),
  stripe_payment_key text not null unique,
  stripe_payment_intent_id text,
  amount_cents integer not null check (amount_cents > 0),
  refunded_cents integer not null default 0 check (refunded_cents >= 0 and refunded_cents <= amount_cents),
  currency text not null check (currency = 'eur'),
  livemode boolean not null,
  paid_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index donation_payments_intent_idx on public.donation_payments(stripe_payment_intent_id);

-- A refund can arrive before the payment event. Retain its cumulative amount
-- and reconcile when the corresponding donation payment is inserted.
create table public.stripe_refund_totals (
  payment_intent_id text primary key,
  refunded_cents integer not null check (refunded_cents >= 0),
  livemode boolean not null,
  updated_at timestamptz not null default now()
);

create table public.stripe_events (
  event_id text primary key,
  event_type text not null,
  event_created bigint not null,
  livemode boolean not null,
  processed_at timestamptz not null default now()
);

create table public.checkout_rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  attempts integer not null default 1,
  primary key(bucket_key,window_start)
);

create function public.allow_checkout_attempt(p_bucket text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_count integer; v_window timestamptz;
begin
  v_window := date_trunc('hour', now()) + floor(extract(minute from now()) / 10) * interval '10 minutes';
  insert into public.checkout_rate_limits(bucket_key,window_start) values(p_bucket,v_window)
  on conflict(bucket_key,window_start) do update set attempts = public.checkout_rate_limits.attempts + 1
  returning attempts into v_count;
  delete from public.checkout_rate_limits where window_start < now() - interval '2 days';
  return v_count <= 12;
end;
$$;
revoke all on function public.allow_checkout_attempt(text) from public,anon,authenticated;
grant execute on function public.allow_checkout_attempt(text) to service_role;

-- One transaction claims an event AND writes its payment, so failed work retries safely.
create function public.apply_stripe_event(
  p_event_id text, p_event_type text, p_event_created bigint, p_livemode boolean, p_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_inserted integer;
  v_donation public.donations%rowtype;
  v_kind text := p_data->>'kind';
  v_donation_id uuid;
  v_amount integer;
  v_refund integer;
  v_paid_total bigint;
  v_refund_total bigint;
begin
  insert into public.stripe_events(event_id,event_type,event_created,livemode)
  values(p_event_id,p_event_type,p_event_created,p_livemode) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('duplicate',true); end if;
  if v_kind = 'ignored' then return jsonb_build_object('ignored',true); end if;

  if v_kind in ('checkout','payment','subscription') then
    v_donation_id := (p_data->>'donation_id')::uuid;
    select * into v_donation from public.donations where id = v_donation_id for update;
    if not found then raise exception 'Donation not found'; end if;
    if v_donation.livemode <> p_livemode then raise exception 'Mode mismatch'; end if;
  end if;

  if v_kind = 'checkout' then
    if (p_data->>'currency') is distinct from 'eur'
       or (p_data->>'amount_cents')::integer is distinct from v_donation.amount_cents
       or (p_data->>'frequency') is distinct from v_donation.frequency then
      raise exception 'Checkout does not match donation';
    end if;
    if v_donation.checkout_session_id is not null and v_donation.checkout_session_id <> p_data->>'session_id' then
      raise exception 'Checkout session mismatch';
    end if;
    update public.donations set
      checkout_session_id = p_data->>'session_id',
      stripe_customer_id = coalesce(p_data->>'customer_id',stripe_customer_id),
      stripe_subscription_id = coalesce(p_data->>'subscription_id',stripe_subscription_id),
      donor_email = coalesce(p_data->>'email',donor_email),
      donor_name = coalesce(p_data->>'name',donor_name),
      status = case when status in ('paid','partially_refunded','refunded') then status else coalesce(p_data->>'status',status) end,
      paid_at = case when p_data->>'status' = 'paid' then coalesce(paid_at,to_timestamp(p_event_created)) else paid_at end,
      updated_at = now()
    where id = v_donation_id;
    -- Recurring gifts are accounted for by invoice.paid, never counted twice here.
    if v_donation.frequency = 'once' and p_data->>'status' = 'paid' then
      insert into public.donation_payments(donation_id,stripe_payment_key,stripe_payment_intent_id,amount_cents,currency,livemode,paid_at)
      values(v_donation_id,p_data->>'session_id',p_data->>'payment_intent_id',v_donation.amount_cents,'eur',p_livemode,to_timestamp(p_event_created))
      on conflict(stripe_payment_key) do nothing;
    end if;
  elsif v_kind = 'payment' then
    v_amount := (p_data->>'amount_cents')::integer;
    if p_data->>'currency' <> 'eur' or v_amount <= 0 or v_donation.frequency <> 'monthly' then raise exception 'Invalid recurring payment'; end if;
    insert into public.donation_payments(donation_id,stripe_payment_key,stripe_payment_intent_id,amount_cents,currency,livemode,paid_at)
    values(v_donation_id,p_data->>'payment_key',p_data->>'payment_intent_id',v_amount,'eur',p_livemode,to_timestamp((p_data->>'paid_at')::bigint))
    on conflict(stripe_payment_key) do update set stripe_payment_intent_id=coalesce(excluded.stripe_payment_intent_id,public.donation_payments.stripe_payment_intent_id);
    update public.donations set status='paid',paid_at=coalesce(paid_at,to_timestamp(p_event_created)),
      stripe_customer_id=coalesce(p_data->>'customer_id',stripe_customer_id),
      stripe_subscription_id=coalesce(p_data->>'subscription_id',stripe_subscription_id),
      donor_email=coalesce(p_data->>'email',donor_email),donor_name=coalesce(p_data->>'name',donor_name),updated_at=now()
    where id=v_donation_id;
  elsif v_kind = 'subscription' then
    update public.donations set
      stripe_subscription_id=coalesce(p_data->>'subscription_id',stripe_subscription_id),
      stripe_customer_id=coalesce(p_data->>'customer_id',stripe_customer_id),
      subscription_status=p_data->>'subscription_status',subscription_event_created=p_event_created,updated_at=now()
    where id=v_donation_id and subscription_event_created <= p_event_created;
  elsif v_kind = 'refund' then
    v_refund := (p_data->>'refunded_cents')::integer;
    insert into public.stripe_refund_totals(payment_intent_id,refunded_cents,livemode)
      values(p_data->>'payment_intent_id',v_refund,p_livemode)
      on conflict(payment_intent_id) do update set refunded_cents=greatest(public.stripe_refund_totals.refunded_cents,excluded.refunded_cents),updated_at=now();
    select donation_id into v_donation_id from public.donation_payments
      where stripe_payment_intent_id=p_data->>'payment_intent_id' and livemode=p_livemode limit 1;
    if v_donation_id is null then return jsonb_build_object('refund_pending',true); end if;
    perform 1 from public.donations where id=v_donation_id for update;
    update public.donation_payments set refunded_cents=greatest(refunded_cents,least(amount_cents,v_refund))
      where stripe_payment_intent_id=p_data->>'payment_intent_id' and livemode=p_livemode;
    select coalesce(sum(amount_cents),0),coalesce(sum(refunded_cents),0) into v_paid_total,v_refund_total
      from public.donation_payments where donation_id=v_donation_id;
    update public.donations set status=case when v_refund_total>=v_paid_total then 'refunded' when v_refund_total>0 then 'partially_refunded' else status end,updated_at=now()
      where id=v_donation_id;
  else
    raise exception 'Unsupported normalized event';
  end if;
  if v_kind in ('checkout','payment') then
    update public.donation_payments payment set refunded_cents=greatest(payment.refunded_cents,least(payment.amount_cents,refund.refunded_cents))
      from public.stripe_refund_totals refund where payment.donation_id=v_donation_id
      and payment.stripe_payment_intent_id=refund.payment_intent_id and payment.livemode=refund.livemode;
    select coalesce(sum(amount_cents),0),coalesce(sum(refunded_cents),0) into v_paid_total,v_refund_total
      from public.donation_payments where donation_id=v_donation_id;
    if v_refund_total > 0 then
      update public.donations set status=case when v_refund_total>=v_paid_total then 'refunded' else 'partially_refunded' end where id=v_donation_id;
    end if;
  end if;
  return jsonb_build_object('processed',true);
end;
$$;
revoke all on function public.apply_stripe_event(text,text,bigint,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.apply_stripe_event(text,text,bigint,boolean,jsonb) to service_role;

alter table public.campaign_settings enable row level security;
alter table public.admin_members enable row level security;
alter table public.donations enable row level security;
alter table public.donation_payments enable row level security;
alter table public.stripe_events enable row level security;
alter table public.checkout_rate_limits enable row level security;
alter table public.stripe_refund_totals enable row level security;
revoke all on public.campaign_settings,public.admin_members,public.donations,public.donation_payments,public.stripe_events,public.checkout_rate_limits from anon,authenticated;
grant select,update on public.campaign_settings to authenticated;
grant select on public.admin_members,public.donations,public.donation_payments to authenticated;
grant all on public.campaign_settings,public.admin_members,public.donations,public.donation_payments,public.stripe_events,public.checkout_rate_limits to service_role;
revoke all on public.stripe_refund_totals from anon,authenticated;
grant all on public.stripe_refund_totals to service_role;
create policy admin_own_membership on public.admin_members for select to authenticated using(user_id=auth.uid());
create policy admin_settings_read on public.campaign_settings for select to authenticated using(public.is_campaign_admin());
create policy admin_settings_update on public.campaign_settings for update to authenticated using(public.is_campaign_admin()) with check(public.is_campaign_admin());
create policy admin_donations_read on public.donations for select to authenticated using(public.is_campaign_admin());
create policy admin_payments_read on public.donation_payments for select to authenticated using(public.is_campaign_admin());

create function public.admin_donation_summary() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.is_campaign_admin() then raise exception 'Forbidden'; end if;
  return jsonb_build_object(
    'net_received_cents',(select coalesce(sum(amount_cents-refunded_cents),0) from public.donation_payments where livemode),
    'confirmed_gifts',(select count(distinct donation_id) from public.donation_payments where livemode),
    'active_monthly',(select count(*) from public.donations where livemode and frequency='monthly' and subscription_status='active')
  );
end;
$$;
revoke all on function public.admin_donation_summary() from public,anon;
grant execute on function public.admin_donation_summary() to authenticated;

commit;
