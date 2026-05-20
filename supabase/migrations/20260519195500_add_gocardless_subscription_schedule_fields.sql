-- Persist GoCardless subscription schedule details on customers.
ALTER TABLE public."Customers"
  ADD COLUMN IF NOT EXISTS "GoCardlessSubscriptionAmount" numeric(12,2),
  ADD COLUMN IF NOT EXISTS "GoCardlessSubscriptionChargeDay" integer,
  ADD COLUMN IF NOT EXISTS "GoCardlessSubscriptionStartDate" date;
