begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-media','site-media',true,10000000,array['image/png','image/jpeg','image/webp','image/gif']) on conflict(id) do nothing;
create policy admin_media_select on storage.objects for select to authenticated using(bucket_id='site-media' and public.is_campaign_admin());
create policy admin_media_insert on storage.objects for insert to authenticated with check(bucket_id='site-media' and public.is_campaign_admin());
create policy admin_media_update on storage.objects for update to authenticated using(bucket_id='site-media' and public.is_campaign_admin()) with check(bucket_id='site-media' and public.is_campaign_admin());
create policy admin_media_delete on storage.objects for delete to authenticated using(bucket_id='site-media' and public.is_campaign_admin());
revoke update on public.shop_orders from authenticated;
grant update(fulfillment_status,tracking_number,admin_notes) on public.shop_orders to authenticated;
alter table public.campaign_settings add constraint shop_launch_details check(not shop_enabled or (
  policies_reviewed and length(coalesce(legal_name,''))>2 and length(coalesce(address,''))>5
  and coalesce(contact_email,'') ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
));

create function public.claim_first_admin(p_user_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(834520014);
  if exists(select 1 from public.admin_members) then return false;end if;
  insert into public.admin_members(user_id) values(p_user_id);
  return true;
end;$$;
revoke all on function public.claim_first_admin(uuid) from public,anon,authenticated;
grant execute on function public.claim_first_admin(uuid) to service_role;

create function public.release_stale_shop_reservations() returns integer language plpgsql security definer set search_path='' as $$
declare v_order record;v_item record;v_count integer:=0;
begin
  for v_order in select id from public.shop_orders where status='pending' and checkout_session_id is null and not inventory_released and created_at<now()-interval '75 minutes' for update skip locked loop
    for v_item in select product_id,quantity from public.shop_order_items where order_id=v_order.id loop
      update public.catalog_products set stock=stock+v_item.quantity where id=v_item.product_id and stock is not null;
    end loop;
    update public.shop_orders set status='expired',inventory_released=true,updated_at=now() where id=v_order.id;
    v_count:=v_count+1;
  end loop;
  return v_count;
end;$$;
revoke all on function public.release_stale_shop_reservations() from public,anon,authenticated;
grant execute on function public.release_stale_shop_reservations() to service_role;
commit;
