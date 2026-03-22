# ✝ Daily Catholic

A React app for **integrated Catholic life**: **Fiat** (Divine Will spirituality), **soul** (Scripture, Mass, examen), and **body** (ketogenic meals, training, macros, shopping). The public landing introduces the four pillars — Soul, Divine Will, Body, and Order — and signed-in users use a unified **Daily Catholic** shell with **Fiat Mode** as the home experience.

All meal planning, inventory, shopping, and profile data are stored in **Supabase** (PostgreSQL) with **Row Level Security**.

## Features

### Fiat & planning

- **Fiat Mode** — Morning/evening Fiat offerings and daily rhythm (default route after sign-in). Daily checks and scores persist to **`fiat_daily_entries`** (signed-in) or `localStorage` (signed-out); the weekly bar and table read that history (month/year views can use the same table later).
- **Dashboard** — Today’s overview.
- **Weekly Plan** — Calendar for planned meals.

### Body (keto & training)

- **Meals** — Recipes with structured ingredients and instructions.
- **Shopping List** — Built from your plan; links to store products where configured.
- **Trip History** — Shopping trips and purchases.
- **Workouts** — Templates and sessions (with local persistence where noted in code).
- **My Macros** — Macro tracking.

### Catalog & linking

- **Ingredients** — Pantry / ingredient catalog and flags.
- **Store Products** — Product catalog for stores.
- **Ingredient Products** — Map starter meals / ingredients to store products.

### Account

- **Account** — Profile details (sidebar footer).
- **Settings** — Meal imports and related preferences (sidebar footer).
- **Onboarding** — Import starter meals on first login; then access the full app.

### Other

- **Training** — `/app/training` (programs); **Pantry** / **Inventory** — `/app/pantry`, `/app/inventory` (available in the router; not all appear in the primary sidebar).
- **Public site** — Marketing landing at `/` (Soul · Divine Will · Body · Order).
- **Auth** — Supabase Auth (email/password, magic link); **RLS** on user data.
- **Admin** — `/app/admin` for users with `role = 'admin'` (sidebar **Admin** link).

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`npm install -g supabase`)
- Docker (for local Supabase)

### Installation

```bash
git clone https://github.com/floodg/daily-catholic.git
cd daily-catholic

npm install

cp .env.local.example .env.local
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
```

### Local Supabase

```bash
supabase start
supabase db reset    # migrations + seed (recommended)
# or: supabase migration up && supabase db seed
```

- **Studio:** http://localhost:54323  
- **API:** shown in `supabase status`

### Run the app

```bash
npm run dev
```

Open **http://localhost:5173**. Sign in routes to **`/app/fiat`** by default.

### Production build

```bash
npm run build
npm run preview
```

## Database

Migrations live in **`supabase/migrations/`** (applied in filename order). They cover, among other things:

- Profiles, auth trigger, admin role  
- Meals, starter meals, planned meals, servings, status, `eaten_at`  
- Ingredients catalog, store products, product linking, shopping list & trips  
- Inventory / purchase ledger, pantry preferences, `mark_meal_eaten` and related RPCs  
- Programs / training-related schema where applicable  

For the exact history, browse the migration files (there are many incremental updates).

## Seed data

`supabase/seed.sql` loads starter content (e.g. starter meals such as keto recipes). Seeding is intended to be safe to re-run where idempotent patterns are used.

```bash
supabase db seed
```

## Onboarding

1. New users are sent to **`/app/onboarding`** until `profiles.has_completed_onboarding` is true.  
2. They choose starter meals to import into their library.  
3. After completion they use the main app; the app index redirects to **`/app/fiat`**.

## Tech stack

- **React 19** + **TypeScript**
- **Vite 7**
- **React Router 7**
- **Supabase** (PostgreSQL, Auth, RLS)
- **Tailwind CSS 4** (where configured in the project)

## Project structure (high level)

```
src/
├── app/                 # App shell layout, sidebar nav, styles
├── components/          # e.g. LandingPage (public marketing)
├── context/             # AuthProvider
├── features/
│   ├── fiat/            # Fiat Mode
│   ├── Dashboard.tsx
│   ├── plan/            # Weekly planner
│   ├── meals/
│   ├── shopping/, shopping-trips/
│   ├── workouts/, programs/, macros/
│   ├── pantry/, inventory/
│   ├── ingredients/, store-products/, ingredient-products/
│   ├── onboarding/
│   └── settings/
├── lib/supabase.ts
└── pages/               # Login, Signup, MagicLink, AdminDashboard
```

## Development

```bash
npm run dev
npm run build
npm run lint
```

## Ingredient consumption (`mark_meal_eaten`)

Completing a planned meal can call a Postgres RPC that updates inventory / shopping behavior (see migrations and `mark_meal_eaten` definitions for current behavior).

```ts
const { error } = await supabase.rpc('mark_meal_eaten', {
  p_planned_meal_id: plannedMealId,
  p_user_id: user.id,
})
```

## License

MIT
