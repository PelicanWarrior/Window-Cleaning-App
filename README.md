# Window Cleaning App

A React application for managing window cleaning customers and workloads, integrated with Supabase.

## Features

- **Customer Management**: Add, view, and delete customers with contact information
- **Workload Management**: Schedule jobs, track status (pending, in-progress, completed)
- **Real-time Database**: Powered by Supabase for reliable data storage

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Supabase

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. In your project dashboard, go to Settings > API
4. Copy your project URL and anon/public key

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   copy .env.example .env
   ```

2. Update `.env` with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

### 4. Set Up Database Tables

Run these SQL commands in your Supabase SQL Editor:

```sql
-- Add Stripe fields for subscriptions
ALTER TABLE "Users"
  ADD COLUMN IF NOT EXISTS "StripeCustomerId" text,
  ADD COLUMN IF NOT EXISTS "StripeSubscriptionId" text,
  ADD COLUMN IF NOT EXISTS "StripeSubscriptionStatus" text;

ALTER TABLE "UserLevel"
  ADD COLUMN IF NOT EXISTS "StripeProductId" text,
  ADD COLUMN IF NOT EXISTS "StripePriceId" text,
  ADD COLUMN IF NOT EXISTS "StripePriceAmount" numeric;

-- Create customers table
CREATE TABLE customers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create jobs table
CREATE TABLE jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  scheduled_date DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

-- Create policies (allow all operations for now - adjust based on your auth needs)
CREATE POLICY "Allow all operations on customers" ON customers FOR ALL USING (true);
CREATE POLICY "Allow all operations on jobs" ON jobs FOR ALL USING (true);
```

### 5. Stripe Subscription Setup (Monthly Plans)

This app uses Stripe Checkout for subscriptions and a Supabase Edge Function webhook to keep `Users.AccountLevel` in sync.

**Account Level Mapping:**
- `AccountLevel = 1`: Bronze/Free (no payment required)
- `AccountLevel = 2`: Silver (monthly subscription)
- `AccountLevel = 3`: Gold (monthly subscription)

**Setup Steps:**

1. **Create a Stripe account** and get your:
   - Secret Key (from https://dashboard.stripe.com/apikeys)
   - Webhook Secret (to be generated after webhook endpoint setup)

2. **Create UserLevel records** in your Supabase database:
   ```sql
   -- Insert plans (adjust MonthlyAmount as needed)
   INSERT INTO "UserLevel" (id, "LevelName", "MonthlyAmount", "Customers", "RoundAmount") VALUES
   (1, 'Bronze', 0, 999, 999999),
   (2, 'Silver', 29.99, 50, 5000),
   (3, 'Gold', 79.99, 999, 999999);
   ```

3. **Deploy the Supabase Edge Functions**:
   - `create_checkout_session`
   - `create_portal_session`
   - `stripe_webhook`
   - `sync_checkout_session`
   - `health_check`
   
   Each function has a `config.json` with `"verify_jwt": false` to allow browser CORS requests.
   
   Deploy using: `supabase functions deploy function_name`

4. **Set Supabase Edge Function secrets**:
   ```
   STRIPE_SECRET_KEY=sk_live_xxxx (or sk_test_xxxx for testing)
   STRIPE_WEBHOOK_SECRET=whsec_xxxx (set this after creating webhook endpoint)
   STRIPE_CURRENCY=gbp (or usd, eur, etc.)
   FUNCTION_SUPABASE_URL=https://xxxx.supabase.co
   FUNCTION_SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```
   
   Set these in your Supabase project: Settings â†’ Edge Functions â†’ Secrets

5. **Create a Stripe Webhook Endpoint**:
   - Go to https://dashboard.stripe.com/webhooks
   - Create endpoint pointing to your deployed `stripe_webhook` function
   - Endpoint URL: `https://xxxx.supabase.co/functions/v1/stripe_webhook`
   - Select events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy the Webhook Secret and set it as `STRIPE_WEBHOOK_SECRET` above

**How it works:**
- Users select a paid plan (Silver or Gold) in Settings > Account Level
- They're redirected to Stripe Checkout
- After payment, the webhook updates `Users.AccountLevel` (2 for Silver, 3 for Gold)
- The app automatically refreshes and shows the updated plan

### 6. GoCardless Live Setup (Supabase)

This app already supports both GoCardless sandbox and live modes via Supabase Edge Function secrets.

1. **Deploy GoCardless functions**:
   - `gocardless_connect_start`
   - `gocardless_oauth_callback`
   - `gocardless_create_flow`
   - `gocardless_sync_billing_request`
   - `gocardless_sync_mandate_status`
   - `gocardless_collect_payment`
   - `gocardless_sync_payments`
   - `gocardless_create_subscription`
   - `gocardless_update_subscription`
   - `gocardless_cancel_subscription`
   - `gocardless_refund_payment`
   - `gocardless_webhook`

2. **Set Supabase Edge Function secrets for live mode**:
   ```bash
   supabase secrets set GOCARDLESS_ENV=live
   supabase secrets set GOCARDLESS_CLIENT_ID=<your_live_client_id>
   supabase secrets set GOCARDLESS_CLIENT_SECRET=<your_live_client_secret>
   supabase secrets set GOCARDLESS_WEBHOOK_ENDPOINT_SECRET=<your_live_webhook_secret>
   supabase secrets set GOCARDLESS_STATE_SECRET=<a_long_random_secret>
   supabase secrets set FUNCTION_SUPABASE_URL=https://<your-project-ref>.supabase.co
   supabase secrets set FUNCTION_SUPABASE_SERVICE_ROLE_KEY=<your_service_role_key>
   ```

3. **Register GoCardless app URLs (live account)**:
   - Redirect URI:
     `https://<your-project-ref>.supabase.co/functions/v1/gocardless_oauth_callback`
   - Webhook endpoint:
     `https://<your-project-ref>.supabase.co/functions/v1/gocardless_webhook`

4. **Reconnect from the app UI**:
   - Open Settings -> Payments.
   - Click Connect/Reconnect GoCardless.
   - Complete OAuth in your live GoCardless account.

5. **Verify end-to-end in live mode**:
   - Create/refresh a customer mandate from customer details.
   - Create a small real invoice payment request.
   - Confirm webhook events are recorded in `GoCardlessWebhookEvents`.
   - Confirm customer/invoice fields are updated (`GoCardlessMandateStatus`, `GoCardlessPaymentStatus`, etc.).

### 7. Twilio Provisioning Setup (Supabase)

This app provisions a Twilio subaccount and purchases a number automatically when the user clicks Connect Twilio in Settings.

1. **Deploy the Twilio edge functions**:
   - `twilio_connect`
   - `send_sms_twilio`

2. **Set Supabase Edge Function secrets**:
   ```bash
   supabase secrets set TWILIO_MASTER_ACCOUNT_SID=<your_live_twilio_account_sid>
   supabase secrets set TWILIO_MASTER_AUTH_TOKEN=<your_live_twilio_auth_token>
   ```

3. **Optional recommended secrets for local environment docs**:
   - Add the same values to your secure deployment environment, not the browser app.

4. **Test the provisioning flow**:
   - Open Settings > Linked Accounts.
   - Click Connect Twilio.
   - Confirm the app shows a provisioned number.
   - Send a test message from Workload or Customer reminders.
   - Confirm the new Twilio subaccount and number appear in the Twilio Console.

### 7. Run the Development Server

```bash
npm run dev
```

The app will open at http://localhost:5173

## Project Structure

```
src/
â”œâ”€â”€ components/
â”‚   â”œâ”€â”€ CustomerList.jsx       # Customer management component
â”‚   â”œâ”€â”€ CustomerList.css
â”‚   â”œâ”€â”€ WorkloadManager.jsx    # Job scheduling component
â”‚   â””â”€â”€ WorkloadManager.css
â”œâ”€â”€ lib/
â”‚   â””â”€â”€ supabase.js           # Supabase client configuration
â”œâ”€â”€ App.jsx                   # Main app component
â”œâ”€â”€ App.css
â”œâ”€â”€ main.jsx                  # App entry point
â””â”€â”€ index.css
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Technologies Used

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Supabase** - Backend as a Service (Database, Auth, Storage)
- **CSS3** - Styling

## Next Steps

- Add user authentication
- Implement job filtering and search
- Add customer history tracking
- Create invoice generation
- Add mobile responsive design improvements
# Window-Cleaning-App

