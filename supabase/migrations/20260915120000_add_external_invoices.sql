-- Allow invoices that are not tied to a customer/property record
ALTER TABLE public."CustomerInvoices"
  ALTER COLUMN "CustomerID" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "UserId" bigint,
  ADD COLUMN IF NOT EXISTS "ExternalClientName" text,
  ADD COLUMN IF NOT EXISTS "ExternalClientAddress" text;
