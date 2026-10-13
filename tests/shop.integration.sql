-- All data below is an uncommitted test fixture. No Stripe call or charge is made.
begin;
do $$
declare
  v_product uuid:='5019e0e8-2222-4f05-8d77-f2d4786df853';
  v_request uuid:='5019e0e8-3333-4f05-8d77-f2d4786df853';
  v_order jsonb;v_second jsonb;v_third jsonb;v_stock integer;
begin
  update public.campaign_settings set shop_enabled=true,policies_reviewed=true,legal_name='UNCOMMITTED TEST FIXTURE',address='Test address not published',contact_email='fixture@example.invalid',shipping_cents=200 where id=true;
  insert into public.catalog_products(id,kind,title,price_cents,stock,published) values(v_product,'physical','{"en":"UNCOMMITTED TEST ITEM"}',750,2,true);
  v_order:=public.reserve_shop_order(v_request,repeat('a',64),'fixture-hash','en',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',2)),false);
  if(v_order->>'amount_cents')::integer<>1700 then raise exception 'Invalid server total';end if;
  select stock into v_stock from public.catalog_products where id=v_product;
  if v_stock<>0 then raise exception 'Stock was not reserved';end if;
  perform public.reserve_shop_order(v_request,repeat('a',64),'fixture-hash','en',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',2)),false);
  if(select stock from public.catalog_products where id=v_product)<>0 then raise exception 'Duplicate reservation';end if;
  begin
    perform public.reserve_shop_order('5019e0e8-4444-4f05-8d77-f2d4786df853',repeat('b',64),'fixture-other','en',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',1)),false);
    raise exception 'Overselling accepted';
  exception when raise_exception then if sqlerrm='Overselling accepted' then raise;end if;end;
  perform public.apply_shop_event('evt_shop_expiry','checkout.session.expired',1000,false,jsonb_build_object('kind','shop_checkout','order_id',v_order->>'id','session_id','cs_test_shopfixture','currency','eur','amount_cents',1700,'status','expired'));
  perform public.apply_shop_event('evt_shop_expiry_again','checkout.session.expired',1001,false,jsonb_build_object('kind','shop_checkout','order_id',v_order->>'id','session_id','cs_test_shopfixture','currency','eur','amount_cents',1700,'status','expired'));
  if(select stock from public.catalog_products where id=v_product)<>2 then raise exception 'Stock release duplicated';end if;
  v_second:=public.reserve_shop_order('5019e0e8-5555-4f05-8d77-f2d4786df853',repeat('c',64),'fixture-second','en',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',1)),false);
  perform public.apply_shop_event('evt_shop_paid','checkout.session.completed',1002,false,jsonb_build_object('kind','shop_checkout','order_id',v_second->>'id','session_id','cs_test_shopfixture2','payment_intent_id','pi_shopfixture','currency','eur','amount_cents',950,'status','paid'));
  perform public.apply_shop_event('evt_shop_paid','checkout.session.completed',1002,false,jsonb_build_object('kind','shop_checkout','order_id',v_second->>'id','session_id','cs_test_shopfixture2','payment_intent_id','pi_shopfixture','currency','eur','amount_cents',950,'status','paid'));
  if(select stock from public.catalog_products where id=v_product)<>1 then raise exception 'Paid order stock wrong';end if;
  perform public.apply_shop_event('evt_shop_refund','charge.refunded',1003,false,jsonb_build_object('kind','shop_refund','payment_intent_id','pi_shopfixture','refunded_cents',950));
  if(select status from public.shop_orders where id=(v_second->>'id')::uuid)<>'refunded' then raise exception 'Order refund not recorded';end if;
  if has_column_privilege('authenticated','public.shop_orders','amount_cents','UPDATE') then raise exception 'Admin client can alter financial total';end if;
  if not has_column_privilege('authenticated','public.shop_orders','fulfillment_status','UPDATE') then raise exception 'Fulfillment update unavailable';end if;
  v_third:=public.reserve_shop_order('5019e0e8-6666-4f05-8d77-f2d4786df853',repeat('d',64),'fixture-third','en',jsonb_build_array(jsonb_build_object('product_id',v_product,'quantity',1)),false);
  update public.shop_orders set created_at=now()-interval '80 minutes' where id=(v_third->>'id')::uuid;
  perform public.release_stale_shop_reservations();
  if(select stock from public.catalog_products where id=v_product)<>1 then raise exception 'Stale stock not released';end if;
end;$$;
rollback;
select 'passed: uncommitted shop fixtures, server prices, stock reservation, idempotence, expiry release, overselling prevention, refunds, fulfillment permissions and stale cleanup' as result;
