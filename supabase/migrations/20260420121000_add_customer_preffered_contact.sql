alter table if exists public."Customers"
  add column if not exists "PrefferedContact" text;
