-- Allow decimal amounts (e.g. 52.75) for invoice line items used by GoCardless collection.
ALTER TABLE public."CustomerInvoiceJobs"
  ALTER COLUMN "Price" TYPE numeric(12,2)
  USING ("Price"::numeric);
