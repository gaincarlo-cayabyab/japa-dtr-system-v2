# JAPA DTR Enterprise System

![Next.js](https://img.shields.io/badge/Next.js-14.2.5-black?logo=next.js)
![Supabase](https://img.shields.io/badge/Supabase-2.x-3ECF8E?logo=supabase)
![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)

Production-ready **Daily Time Record (DTR)** portal connected to a **FingerTec TA500** biometric attendance machine (IP: `192.168.68.146`, Port: `4370`). Employees can view their attendance logs in real time; HR can export reports — all synced automatically from the physical device via a local Python bridge.

---

## Architecture

```
┌─────────────────────┐        ┌──────────────┐        ┌────────────────────┐        ┌──────────────┐
│  Next.js (Vercel)   │ ◄────► │   Supabase   │ ◄────► │  Python Bridge     │ ◄────► │  TA500       │
│  Web Portal / API   │        │  PostgreSQL   │        │  (local network)   │        │  192.168.68. │
│  Routes             │        │  Auth + RLS   │        │  sync-bridge/      │        │  146:4370    │
└─────────────────────┘        └──────────────┘        └────────────────────┘        └──────────────┘
```

| Layer | Technology | Role |
|---|---|---|
| Frontend & API | Next.js 14 (App Router) | UI, server actions, REST endpoints |
| Database & Auth | Supabase (PostgreSQL + RLS) | Attendance records, user auth, row-level security |
| Sync Bridge | Python 3.10+ | Pulls logs from TA500 via ZKLib, pushes to Supabase |
| Biometric Device | FingerTec TA500 | Fingerprint / RFID clock-in/out source |
| Hosting | Vercel | Zero-config Next.js deployment |

---

## Quick Start

### Prerequisites
- Node.js 18+
- A Supabase project
- Python 3.10+ (for the sync bridge)
- Local network access to the TA500 device

### 1. Clone & install
```bash
git clone https://github.com/your-org/japa-dtr-system.git
cd japa-dtr-system
npm install
```

### 2. Configure environment
```bash
cp .env.local.example .env.local
# Fill in your Supabase URL and keys
```

### 3. Run development server
```bash
npm run dev
# Open http://localhost:3000
```

---

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Run the SQL migrations in `supabase/migrations/` via the Supabase SQL editor or the CLI.
3. Enable **Row Level Security (RLS)** on all tables (migrations handle this).
4. Copy your project URL and anon key into `.env.local`.
5. For server-side operations (sync bridge), copy the **Service Role Key** — keep it secret and never expose it on the client.

---

## Sync Bridge Setup

The Python bridge polls the TA500 device and upserts attendance records into Supabase.

See **[sync-bridge/README.md](./sync-bridge/README.md)** for full installation and configuration instructions.

Quick overview:
```bash
cd sync-bridge
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
cp .env.example .env        # configure device IP, Supabase keys
python main.py              # run once, or schedule as a service
```

---

## Vercel Deployment

1. Push this repository to GitHub.
2. Import the repository in the [Vercel Dashboard](https://vercel.com/new).
3. Add the following **Environment Variables** in the Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Deploy — Vercel auto-detects Next.js and builds it.

> **Note:** The Python sync bridge runs **locally** on the same LAN as the TA500 device. It cannot run on Vercel serverless functions.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| [Next.js](https://nextjs.org) | 14.2.5 | Full-stack React framework |
| [React](https://react.dev) | 18 | UI library |
| [TypeScript](https://typescriptlang.org) | 5 | Type safety |
| [Tailwind CSS](https://tailwindcss.com) | 3.4 | Utility-first styling |
| [Supabase JS](https://supabase.com/docs/reference/javascript) | 2.x | Database & auth client |
| [date-fns](https://date-fns.org) | 3.x | Date formatting & manipulation |
| [lucide-react](https://lucide.dev) | 0.400 | Icon set |
| [Python](https://python.org) | 3.10+ | Sync bridge runtime |

---

## License

Private — JAPA internal use only.
