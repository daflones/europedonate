-- Execute in the Supabase SQL editor or Management API. All fixtures roll back.
begin;
do $$
declare
  v_id uuid := '955e2e94-2222-4ef7-8ca8-8bb7e996be51';
  v_monthly uuid := '955e2e94-2222-4ef7-8ca8-8bb7e996be52';
  v_data jsonb;
  v_count integer;
  v_status text;
  v_allowed boolean;
begin
  if exists(select 1 from information_schema.role_table_grants where grantee='anon' and table_name in ('donations','donation_payments','stripe_events','campaign_settings','admin_members','stripe_refund_totals')) then raise exception 'Unexpected anonymous grant'; end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('donations','donation_payments','stripe_events','campaign_settings','admin_members','stripe_refund_totals') and not c.relrowsecurity) then raise exception 'RLS missing'; end if;
  begin
    update public.campaign_settings set donations_enabled=true where id=true;
    raise exception 'Incomplete campaign was enabled';
  exception when check_violation then null;
  end;
  insert into public.donations(id,request_id,receipt_token_hash,amount_cents,frequency,terms_version)
    values(v_id,'955e2e94-3333-4ef7-8ca8-8bb7e996be51',repeat('0',64),2500,'once','2026-10-13-v1');
  v_data:=jsonb_build_object('kind','checkout','donation_id',v_id,'session_id','cs_test_sqlfixture','payment_intent_id','pi_sqlfixture','currency','eur','amount_cents',2501,'frequency','once','status','paid');
  begin
    perform public.apply_stripe_event('evt_sql_invalid','checkout.session.completed',1000,false,v_data);
    raise exception 'Mismatched amount accepted';
  exception when raise_exception then
    if sqlerrm='Mismatched amount accepted' then raise; end if;
  end;
  if exists(select 1 from public.stripe_events where event_id='evt_sql_invalid') then raise exception 'Failed event was not rolled back'; end if;
  v_data:=jsonb_set(v_data,'{amount_cents}','2500');
  perform public.apply_stripe_event('evt_sql_paid','checkout.session.completed',1001,false,v_data);
  perform public.apply_stripe_event('evt_sql_paid','checkout.session.completed',1001,false,v_data);
  select count(*) into v_count from public.donation_payments where donation_id=v_id;
  if v_count<>1 then raise exception 'Duplicate one-time payment'; end if;
  v_data:=jsonb_set(v_data,'{status}','"processing"');
  perform public.apply_stripe_event('evt_sql_old','checkout.session.completed',999,false,v_data);
  select status into v_status from public.donations where id=v_id;
  if v_status<>'paid' then raise exception 'Paid state regressed'; end if;
  insert into public.donations(id,request_id,receipt_token_hash,amount_cents,frequency,terms_version)
    values(v_monthly,'955e2e94-3333-4ef7-8ca8-8bb7e996be52',repeat('1',64),5000,'monthly','2026-10-13-v1');
  perform public.apply_stripe_event('evt_sql_refund_first','charge.refunded',1100,false,jsonb_build_object('kind','refund','payment_intent_id','pi_sql_monthly','refunded_cents',1000));
  perform public.apply_stripe_event('evt_sql_invoice','invoice.paid',1101,false,jsonb_build_object('kind','payment','donation_id',v_monthly,'payment_key','in_sqlfixture','payment_intent_id','pi_sql_monthly','amount_cents',5000,'currency','eur','paid_at',1101,'subscription_id','sub_sqlfixture'));
  select status into v_status from public.donations where id=v_monthly;
  if v_status<>'partially_refunded' then raise exception 'Out-of-order refund was lost'; end if;
  perform public.apply_stripe_event('evt_sql_invoice_duplicate_event','invoice.paid',1102,false,jsonb_build_object('kind','payment','donation_id',v_monthly,'payment_key','in_sqlfixture','payment_intent_id','pi_sql_monthly','amount_cents',5000,'currency','eur','paid_at',1101,'subscription_id','sub_sqlfixture'));
  select count(*) into v_count from public.donation_payments where donation_id=v_monthly;
  if v_count<>1 then raise exception 'Duplicate recurring invoice'; end if;
  perform public.apply_stripe_event('evt_sql_full_refund','charge.refunded',1103,false,jsonb_build_object('kind','refund','payment_intent_id','pi_sql_monthly','refunded_cents',5000));
  select status into v_status from public.donations where id=v_monthly;
  if v_status<>'refunded' then raise exception 'Full refund failed'; end if;
  perform public.apply_stripe_event('evt_sql_subscription_new','customer.subscription.deleted',1200,false,jsonb_build_object('kind','subscription','donation_id',v_monthly,'subscription_id','sub_sqlfixture','subscription_status','canceled'));
  perform public.apply_stripe_event('evt_sql_subscription_old','customer.subscription.updated',1190,false,jsonb_build_object('kind','subscription','donation_id',v_monthly,'subscription_id','sub_sqlfixture','subscription_status','active'));
  if (select subscription_status from public.donations where id=v_monthly)<>'canceled' then raise exception 'Old subscription event regressed state'; end if;
  for i in 1..12 loop v_allowed:=public.allow_checkout_attempt('sql-fixture-bucket'); if not v_allowed then raise exception 'Rate limit too early';end if;end loop;
  if public.allow_checkout_attempt('sql-fixture-bucket') then raise exception 'Rate limit not enforced'; end if;
end;
$$;
rollback;
select 'passed: constraints, RLS, amount matching, event rollback, duplicates, recurring payments, refunds, event ordering and rate limit' as result;
