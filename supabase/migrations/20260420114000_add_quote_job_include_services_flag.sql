alter table if exists public."Users"
  add column if not exists "QuoteTurnedIntoJobIncludeBookedServices" boolean default false;
