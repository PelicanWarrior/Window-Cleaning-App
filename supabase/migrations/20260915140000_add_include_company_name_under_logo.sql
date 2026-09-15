-- Option to show company name text below the invoice logo
ALTER TABLE public."Users"
  ADD COLUMN IF NOT EXISTS "IncludeCompanyNameUnderLogo" boolean DEFAULT false;
