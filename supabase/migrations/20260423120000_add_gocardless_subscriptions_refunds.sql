-- Subscriptions on Customers
ALTER TABLE public."Customers"
  ADD COLUMN IF NOT EXISTS "GoCardlessSubscriptionId" text,
  ADD COLUMN IF NOT EXISTS "GoCardlessSubscriptionStatus" text,
  ADD COLUMN IF NOT EXISTS "GoCardlessSubscriptionLastEventAt" timestamptz;

-- Payment confirmation + refunds on CustomerInvoices
ALTER TABLE public."CustomerInvoices"
  ADD COLUMN IF NOT EXISTS "GoCardlessPaymentConfirmedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "GoCardlessRefundId" text,
  ADD COLUMN IF NOT EXISTS "GoCardlessRefundStatus" text,
  ADD COLUMN IF NOT EXISTS "GoCardlessRefundedAt" timestamptz;
