# MAMA Cafe — QR-Based Ordering System

A QR-based restaurant ordering system with customer-facing menu, cart, payment, and an admin dashboard.

## Architecture

```
client/              React 19 SPA (Vite)
  src/
    pages/           Route-level components
    components/      Reusable UI components
      ui/            shadcn/ui primitives
      admin/         Admin panel sections
      marketing/     Landing/marketing pages
    contexts/        AuthContext, CartContext, ThemeContext
    lib/             Supabase client, utilities, constants
    hooks/           Custom hooks
    services/        Payment API calls

server/              Express + tRPC + Drizzle
  _core/
    index.ts         HTTP server entry (port 3000+)
    paymentRoutes.ts Razorpay + UPI payment endpoints
    authRoutes.ts    OTP-based password reset
    printRoutes.ts   Thermal receipt printing
    trpc.ts          tRPC setup (public/protected/admin procedures)
    context.ts       Request context (user auth)
  routers.ts         tRPC routers: customer, staff, admin
  db.ts              Drizzle database functions

supabase-setup.sql   Full schema + RLS + realtime setup
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, shadcn/ui, Framer Motion |
| Routing | wouter (lightweight React router) |
| State | TanStack React Query, React Context |
| Backend | Express, tRPC 11 |
| Database | Supabase (PostgreSQL) via REST API |
| Auth | Supabase Auth (email/password) |
| Payments | Razorpay |
| ORM (server) | Drizzle ORM + MySQL (for optional server-side DB) |

## Setup

### Prerequisites
- Node.js 18+ and pnpm
- A Supabase project (free tier works)

### 1. Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
VITE_SUPABASE_URL=         # Supabase project URL
VITE_SUPABASE_ANON_KEY=    # Supabase anon/public key
SUPABASE_SERVICE_KEY=      # Supabase service_role key (for password reset)
RESEND_API_KEY=            # Resend.com API key (for OTP emails)
FROM_EMAIL=                # Sender email for OTPs
RAZORPAY_KEY_ID=           # Razorpay test/live key ID
RAZORPAY_KEY_SECRET=       # Razorpay test/live key secret
```

### 2. Supabase Setup

1. Go to your Supabase dashboard → SQL Editor
2. Paste and run the entire `supabase-setup.sql` file
3. Go to Authentication → Settings → enable Email + Password sign-in
4. Go to Database → Replication → verify `sessions`, `orders`, `orderItems`, `menuItems`, `feedback` are toggled ON for realtime

### 3. Install & Run

```bash
pnpm install
pnpm run dev        # Starts both client (Vite) and server (Express)
```

Open the URL shown in terminal (default: `http://localhost:5173`).

### 4. Create Admin Account

1. Go to `/login` and sign up with your email
2. In Supabase dashboard → Table Editor → `users` table → set your user's `role` to `admin`

## Routes

| Path | Component | Access |
|------|-----------|--------|
| `/table/:code` | CustomerMenu | Public |
| `/table/:code/cart` | CartPage | Public |
| `/table/:code/payment` | PaymentPage | Public |
| `/table/:code/payment/success` | OrderSuccessPage | Public |
| `/table/:code/payment/failed` | OrderFailedPage | Public |
| `/login` | Login | Public |
| `/` | AdminPanel | Admin (auth required) |

## Key Features

- **QR menu** — customers scan a table QR, browse categories, search items, add to cart
- **Real-time orders** — kitchen/admin see new orders via Supabase WebSocket subscriptions
- **Razorpay payments** — online payments with server-side validation
- **UPI payments** — QR code display (webhook integration needed for verification)
- **Admin dashboard** — table management, menu CRUD, order queue, settle bills, analytics
- **Thermal printing** — print receipts to network thermal printers
- **CSV export** — export settled bills by date
- **Analytics** — popular items, daily revenue, peak hours, table turnover

## Project Structure

```
cafe-qr-ordering/
├── client/              React SPA
│   ├── src/
│   │   ├── pages/       CustomerMenu, CartPage, PaymentPage, AdminPanel
│   │   ├── components/  Reusable components
│   │   ├── contexts/    Auth, Cart, Theme
│   │   ├── lib/         Supabase client, utils, constants
│   │   └── services/    Payment API
├── server/              Express backend
│   ├── _core/           Routes, middleware, tRPC setup
│   ├── routers.ts       tRPC API definitions
│   └── db.ts            Database access layer
├── drizzle/             Drizzle schema (MySQL, for server-side DB)
├── supabase-setup.sql   One-step Supabase setup
└── .env.example         Environment variable template
```

## Security Notes

- **Row Level Security**: All tables have RLS policies (public read/insert, admin-only write). Set up by `supabase-setup.sql`.
- **Rate limiting**: Payment endpoints (20/min Razorpay, 10/min UPI), auth endpoints (3 OTP/5min), order submission (5/min by device + 20/min by IP).
- **Server-side validation**: Payment order creation re-fetches menu prices server-side — client cannot manipulate prices.
- **Idempotency**: `submissionId` prevents duplicate order submissions.
