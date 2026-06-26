# Last Minute Pilot

An AI productivity copilot that plans, monitors, and replans toward deadlines — not just a reminder app.

**Core loop:** Goal → Breakdown → Schedule → Execute → Report Progress → Risk Check → Replan → Completion.

Every screen answers one of four questions:

1. What am I trying to achieve?
2. Am I on track?
3. What should I work on right now?
4. What happens if I keep going at this pace?

## Why it's not just "AI-flavored"

The biggest mistake in AI productivity apps is treating the LLM as the source of
truth for things it's bad at (exact time math, consistent priority ranking) and
not using it for what it's good at (breaking down fuzzy goals, writing
explanations).

**Split responsibilities:**

| Responsibility | Who does it |
|---|---|
| Understanding "I have a hackathon in 4 days, haven't started" | LLM |
| Breaking the goal into tasks | LLM |
| Ranking tasks by priority | **Deterministic function** (`lib/scheduler/prioritize.ts`) |
| Fitting tasks into actual free time-blocks | **Constraint-based scheduler** (`lib/scheduler/fit-blocks.ts`) |
| Detecting risk ("you're behind") | **Deterministic comparison** (`lib/risk/assess.ts`) |
| Writing the explanation shown to the user | LLM (`lib/ai/adapter.ts` → `explainRisk`) |

This means: even if the LLM provider goes down, scheduling and risk detection
still work. The app is *AI-assisted*, not *AI-dependent*.

## Quick start

```bash
bun install
echo 'DATABASE_URL="file:./dev.db"' > .env
bun run db:push
bun run dev          # http://localhost:3000

# Seed demo data (idempotent):
curl -X POST http://localhost:3000/api/seed

# Run an initial replan to populate schedule blocks:
curl -X POST http://localhost:3000/api/schedule/replan
```

Then open the app in your browser. Try the **Replan now** button on the
dashboard, create a new goal with the **Speak** button (Web Speech API), and
watch the risk snapshot update as you mark tasks done.

## Design

- **Mobile-first**, then desktop. Sticky footer, safe-area aware.
- **No gradients.** Stone neutrals + emerald primary + amber warning + rose critical.
- **Light + dark mode** both polished (next-themes).
- **No blue/indigo.** Productivity without the SaaS-blue cliché.

## Architecture

See `DEPLOYMENT.md` for the full deployment guide, project structure, and
troubleshooting. See `worklog.md` for the development history and current
status.

## Tech stack

- **Next.js 16** (App Router) + **TypeScript 5**
- **Tailwind CSS 4** + **shadcn/ui** (New York)
- **Prisma ORM** + SQLite (swap to Postgres for production — schema is portable)
- **z-ai-web-dev-sdk** as the LLM adapter (single integration point — swap providers in one file)
- **next-themes** for light/dark mode
- **TanStack Query** for server state, **date-fns**, **sonner** for toasts

## License

Built from the "Last Minute Pilot" architecture spec.
