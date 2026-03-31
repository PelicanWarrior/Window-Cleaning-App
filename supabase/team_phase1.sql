-- Phase 1: Team members and job assignment
-- Run this in Supabase SQL editor before using owner/team assignment UI.

alter table if exists public."Users"
  add column if not exists "ParentUserId" integer references public."Users"(id) on delete set null;

alter table if exists public."Users"
  add column if not exists "TeamRole" text;

update public."Users"
set "TeamRole" = 'owner'
where coalesce("TeamRole", '') = '' and "ParentUserId" is null;

alter table if exists public."Users"
  alter column "TeamRole" set default 'owner';

alter table if exists public."Customers"
  add column if not exists "AssignedUserId" integer references public."Users"(id) on delete set null;

create index if not exists idx_users_parent_user_id on public."Users"("ParentUserId");
create index if not exists idx_customers_assigned_user_id on public."Customers"("AssignedUserId");
create index if not exists idx_customers_user_assigned on public."Customers"("UserId", "AssignedUserId");
