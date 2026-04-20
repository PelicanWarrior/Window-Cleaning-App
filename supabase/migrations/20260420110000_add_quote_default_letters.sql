alter table if exists public."Users"
  add column if not exists "QuoteBookedInLetter" bigint,
  add column if not exists "QuoteTurnedIntoJobLetter" bigint;
