-- Backfill ExternalClients from external invoices created before this table existed
INSERT INTO public."ExternalClients" ("UserId", "ClientName", "ClientAddress")
SELECT DISTINCT ON ("UserId", "ExternalClientName")
  "UserId", "ExternalClientName", "ExternalClientAddress"
FROM public."CustomerInvoices"
WHERE "CustomerID" IS NULL
  AND "ExternalClientName" IS NOT NULL
  AND "UserId" IS NOT NULL
ORDER BY "UserId", "ExternalClientName", id DESC
ON CONFLICT ("UserId", "ClientName") DO NOTHING;
