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

### 5. Run the Development Server

```bash
npm run dev
```

The app will open at http://localhost:5173

## Project Structure

```
src/
├── components/
│   ├── CustomerList.jsx       # Customer management component
│   ├── CustomerList.css
│   ├── WorkloadManager.jsx    # Job scheduling component
│   └── WorkloadManager.css
├── lib/
│   └── supabase.js           # Supabase client configuration
├── App.jsx                   # Main app component
├── App.css
├── main.jsx                  # App entry point
└── index.css
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
