---
name: prd-guard
description: Use BEFORE writing code, designing schema, choosing libraries, or making any architectural decision. Ensures every change is grounded in docs/PRD.md (the canonical product spec) and prevents drift, scope creep, or invented "defaults". Trigger when the user says "build", "implement", "add", "create a page/route/table/migration", "use library X", "design Y", "set up Z", or whenever you're about to propose technology, schema, or UX choices.
---

# PRD Guard

You are working on the Reflect Architects OS project. The single source of truth is `docs/PRD.md`. Your job is to keep every code change, library choice, and architectural decision provably aligned with it.

## Hard rules

1. **PRD is canonical.** If PRD says X, do X. Do not "improve" silently. Do not substitute "better" defaults from training data.
2. **Quote before you act.** Before writing code or recommending an approach, find the relevant requirement in PRD (search by keyword or REQ-* code) and quote the exact line(s) you're implementing against.
3. **No invented requirements.** If the user asks for something the PRD does not cover, say so explicitly and ASK before proceeding. Never extrapolate "what they probably want."
4. **No silent stack changes.** PRD §3.1 fixes the tech stack (React 18, Vite, Tailwind, Supabase, React Query, Zustand, Anthropic SDK Claude Haiku 4.5, recharts). Don't propose Next.js, Drizzle, Prisma, OpenAI, etc. without first noting that this would deviate from PRD §3.1 and asking.
5. **No silent schema changes.** PRD §3.2 enumerates tables and columns. New tables / new columns require an explicit PRD update first, or an explicit user decision logged in the commit message.
6. **No silent design changes.** `docs/designstyle4.md` defines tokens, fonts, mascot, and component primitives. Don't introduce new colors, fonts, or radii ad-hoc — extend the token system.

## Workflow you MUST follow

When the user asks for any implementation work:

1. **Locate** the relevant PRD section. Use grep / Read for keywords (e.g. "task status", "MIRAI", "Telegram", "RLS", "presence").
2. **Quote** the exact lines (with file:line citation) that govern the work.
3. **Confirm** the proposed implementation matches. If it does, proceed.
4. **Flag mismatches.** If you find PRD ambiguity, contradiction, or a gap, surface it to the user before coding. Use AskUserQuestion if a real choice exists.
5. **In commits**, reference the REQ-* code or PRD section in the commit message body, e.g. `feat: 7-status kanban (PRD §10.2 / REQ-TASK-STATUS-001)`.

## Anti-patterns (refuse to do these)

- Picking "Sonnet 4.6" because it's "more capable" when PRD §3.1 specifies Haiku 4.5.
- Adding a "users" table when PRD §3.2 calls it `profiles`.
- Using React Context when PRD §3.1 specifies Zustand.
- Inventing a column like `phase` (singular) when PRD says `phases[]` (array).
- Choosing a font, color, or border-radius that isn't in `designstyle4.md`.
- Bypassing RLS "for now" — PRD §9.1 mandates RLS on every table from day one.

## When the PRD is wrong or outdated

Don't silently work around it. Two valid moves:
- **Propose a PRD edit** to the user, with a diff. Wait for approval.
- **Note the gap in the commit + open a TODO** referencing the section number, so it's visible.

## Conversation hygiene

- Don't say "I recommend X" without anchoring it in PRD or user-stated constraints.
- Don't write action plans, roadmaps, or "default" choices unless the user asked for them. The PRD already contains the plan.
- Match scope: a question gets an answer; an instruction gets an action — not a 12-week timeline.

## Self-check before every code change

Ask yourself:
1. Which REQ-* / §X.Y am I implementing?
2. Does my code match the field names, types, and constraints listed there?
3. Am I introducing any library, file, table, or token that isn't already approved?
4. If yes — have I asked the user, or am I about to invent?

If any answer is "no" or "I'm inventing" — STOP and ask.
