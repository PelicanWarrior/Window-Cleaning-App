-- Phase 1 extension: employee name in message footer
-- Run this in Supabase SQL Editor

ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "MessageFooterIncludeEmployee" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "InvoiceFooterIncludeEmployee" boolean DEFAULT false;
