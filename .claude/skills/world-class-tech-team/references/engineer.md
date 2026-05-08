# Engineer Reference

Staff Engineer mindset: you've been paged at 3am, you've inherited other people's disasters, and you've shipped at both Google scale and zero-to-one speed. You know that "good enough" is a context-dependent judgment, not laziness.

---

## Table of contents
1. Code quality
2. Architecture principles
3. TypeScript & type systems
4. API design
5. Database & data modeling
6. Observability
7. Security
8. CI/CD & DevOps
9. Performance
10. AI/LLM systems
11. Red flags to always call out

---

## 1. Code quality

Write code your team will maintain for 3 years, not just run today.

**Naming:** Name things what they ARE, not what they DO. `userProfile` not `getUserData`. `isLoading` not `loadingState`. Names should make the comment unnecessary.

**Functions:** One function, one responsibility. If you need "and" to describe what it does, split it. Functions longer than ~30 lines are a signal, not a rule — but investigate.

**Error handling is not optional.** Happy path code is half-finished code. Errors should be:
- Expected: handle gracefully with user-friendly feedback
- Unexpected: fail fast, log with full context, never swallow silently

**Fail loudly.** A silent failure is worse than a crash because it corrupts state invisibly.

**Comments explain WHY, not WHAT.** If the code doesn't explain what it does, rewrite it. Comments explain decisions: "Using polling instead of websockets here because the client firewall blocks ws on port 443."

---

## 2. Architecture principles

**Start boring.** Choose the proven technology over the exciting one unless there's a documented, specific reason. Postgres over a custom event store. REST over GraphQL unless you have a real N+1 or multi-client problem.

**Design for the delete.** Can this feature be removed in one PR? If not, why not? Tight coupling is debt.

**Prefer composition over inheritance.** Interfaces over implementations. Dependency injection over hard-coded dependencies.

**The 3 questions before starting:**
1. Is this the right problem to solve?
2. Is this the right time to solve it?
3. Is this the right level of complexity for the problem?

**Horizontal scalability beats premature vertical optimization.** Stateless services that can scale out beat clever in-memory tricks that can't.

**Async by default for I/O.** Synchronous I/O in hot paths is a performance debt that compounds.

**Data flows in one direction.** If your data can be modified from 8 different places, you will have a bug within 6 months.

---

## 3. TypeScript & type systems

**Strict mode always.** `"strict": true` in tsconfig. No exceptions. The short-term pain of fixing strict errors is always less than the long-term pain of runtime surprises.

**Types are documentation that the compiler checks.** A well-typed function signature is worth a paragraph of comments.

**Prefer `unknown` over `any`.** `any` turns off the type checker. `unknown` forces you to narrow. If you're tempted to use `any`, that's a signal to investigate the actual type.

**Discriminated unions over nullable.** Instead of `user: User | null`, model state explicitly:
```typescript
type UserState =
  | { status: 'loading' }
  | { status: 'loaded'; user: User }
  | { status: 'error'; error: Error }
```

**Zod for runtime validation at boundaries.** TypeScript types disappear at runtime. Validate API responses, env vars, and form inputs with Zod. Never trust external data.

**Avoid type assertion (`as`).** Every `as` is a promise to the compiler you might not keep. Prefer type guards and narrowing.

---

## 4. API design

**REST defaults, GraphQL when justified.** GraphQL is justified when: multiple clients need different shapes of the same data, or N+1 is a real measured problem, not a theoretical one.

**REST conventions that matter:**
- Nouns for resources, verbs for actions: `/users` not `/getUsers`
- HTTP methods carry meaning: GET (safe, idempotent), POST (create), PUT (replace), PATCH (partial update), DELETE
- Return 200 with body, not 204 No Content, for mutations that return data
- 4xx for client errors, 5xx for server errors — never return 200 with an error body

**Versioning:** URI versioning (`/v1/`) is blunt but visible. Header versioning is elegant but invisible. Pick one, document it, stick to it.

**Pagination:** Cursor-based over offset for anything that changes. Offset pagination on live data produces skipped and duplicated results.

**Error responses — always structured:**
```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Email is required",
    "field": "email",
    "requestId": "abc123"
  }
}
```
Include `requestId` always. It's the difference between a support ticket that gets resolved and one that doesn't.

**Idempotency keys for mutations.** Any POST that creates money movement, sends email, or has real-world effects should accept an idempotency key.

---

## 5. Database & data modeling

**Schema is your most important decision.** Migrations are painful, deletes are painful, renaming columns is painful. Think before you create.

**Normalization is default; denormalize with evidence.** Start normalized. Denormalize only when you have a measured query performance problem, not a theoretical one.

**Index strategy:**
- Index every foreign key
- Index columns that appear in WHERE, ORDER BY, and JOIN conditions on hot queries
- Partial indexes for sparse conditions (`WHERE deleted_at IS NULL`)
- Composite index column order matters: most selective column first
- Every index has a write cost — don't over-index

**Never store what you can compute (at reasonable cost).** But cache what you compute repeatedly.

**Soft deletes with caution.** `deleted_at` timestamps are a common pattern but they pollute every query. Evaluate: do you actually need recovery, or just audit logging? Sometimes an audit table is cleaner.

**Transactions for multi-step mutations.** If two writes must succeed together, wrap them in a transaction. No exceptions.

**Connection pooling.** Every serverless function opening its own DB connection is a production incident waiting to happen. Use PgBouncer or equivalent.

**Migrations:**
- Always additive first, then cleanup in a second migration after code deploys
- Never rename a column in one step — add new, migrate data, remove old
- Test rollback before merging

---

## 6. Observability

A system without observability is a black box. When it breaks at 2am, you need three things: logs, metrics, traces.

**Structured logging.** JSON logs, always. Free-text logs can't be queried.
```typescript
logger.info('payment_processed', {
  userId: user.id,
  amount: payment.amount,
  currency: payment.currency,
  durationMs: Date.now() - startTime,
  requestId: ctx.requestId,
})
```
Always include: timestamp, level, event name, requestId, userId when available, duration for operations.

**The four golden signals (Google SRE):**
1. Latency — how long requests take (p50, p95, p99 — not averages)
2. Traffic — requests per second
3. Errors — error rate by type
4. Saturation — how full the system is (CPU, memory, queue depth)

**Distributed tracing.** In a service mesh, a trace ID must propagate across every hop. Without it, a latency spike is unfindable.

**Alerting on symptoms, not causes.** Alert on "error rate > 1%" not "CPU > 80%". Users don't feel CPU.

**SLOs before incidents.** Define what "working" means before something breaks. "99.9% of requests complete in < 500ms" is an SLO. Without SLOs, every incident is a debate.

---

## 7. Security

Security is not a feature — it's a property. It must be built in, not bolted on.

**OWASP Top 10 — know them:**
1. Injection (SQL, command, LDAP) → parameterized queries always, never string concat
2. Broken authentication → short-lived JWTs, secure httpOnly cookies, MFA support
3. Sensitive data exposure → encrypt at rest and in transit, never log PII
4. XXE → disable external entity processing
5. Broken access control → check authorization on every request, not just login
6. Security misconfiguration → env vars for secrets, never committed to git
7. XSS → CSP headers, escape output, sanitize HTML input
8. Insecure deserialization → validate and type-check all external data
9. Known vulnerabilities → automated dependency scanning (Dependabot, Snyk)
10. Insufficient logging → log auth events, failed attempts, sensitive operations

**Auth principles:**
- Authenticate (who are you?) and authorize (can you do this?) are separate concerns
- Check authorization at the data layer, not just the route layer
- Principle of least privilege: request only the permissions you need
- Never roll your own crypto or auth flow — use established libraries

**Secrets management:**
- Never hardcode secrets; never commit them; never log them
- Use a secrets manager (AWS Secrets Manager, Vault, Doppler)
- Rotate secrets on a schedule and immediately on suspected exposure
- Audit who has access to production secrets

**Input validation:** Validate at every trust boundary. Your API receives data from the internet. Treat it as hostile.

---

## 8. CI/CD & DevOps

**Trunk-based development over long-lived branches.** Feature flags enable safe shipping of incomplete features. Long-lived branches are merge conflict factories.

**Pipeline stages (in order):**
1. Lint + type check (fast, < 1 min)
2. Unit tests (< 5 min target)
3. Integration tests
4. Security scan (SAST, dependency audit)
5. Build + artifact creation
6. Deploy to staging
7. Smoke tests on staging
8. Deploy to production (with rollback ready)

**Deploy frequency is a health metric.** Teams that deploy daily have fewer incidents than teams that deploy monthly. Small changes are easier to reason about and revert.

**Feature flags over long-lived branches.** Ship the code, control the rollout. Enables: gradual rollouts, A/B tests, instant kill switches.

**Rollback must be one command.** If rolling back requires a migration rollback, a cache flush, and three deploys — your deployment process has a problem.

**Containerize everything that needs to run consistently.** Docker for dev parity. Never "works on my machine."

---

## 9. Performance

**Profile before optimizing.** Gut feeling about bottlenecks is wrong ~70% of the time. Measure first.

**The hierarchy of optimization (cheapest to most expensive):**
1. Cache the result
2. Do less work
3. Do the work more efficiently
4. Add more hardware

**Database is almost always the bottleneck.** Check query plans (EXPLAIN ANALYZE) before adding indices or caching layers.

**Caching strategy:**
- Cache at the right level: CDN (static assets), application (computed results), database (query results)
- Cache invalidation is hard — design for it upfront
- Set explicit TTLs; never rely on manual cache busting in production
- Cache stampede protection for high-traffic keys

**Bundle size matters on web.** Every KB is a user waiting. Use code splitting, tree shaking, and lazy loading for routes and heavy dependencies.

**Core Web Vitals as a proxy for user experience:**
- LCP (Largest Contentful Paint) < 2.5s
- FID / INP (Interaction to Next Paint) < 200ms
- CLS (Cumulative Layout Shift) < 0.1

---

## 10. AI/LLM systems

**Treat LLMs as probabilistic, not deterministic.** Every output is a distribution, not a fact. Design your system assuming some % of outputs will be wrong.

**Evals first.** Before building any LLM feature, define how you'll know if it's working. Evals are to AI features what tests are to regular code.

**Prompt engineering principles:**
- Be explicit about format and length
- Use examples (few-shot) for complex tasks
- Chain of thought for reasoning tasks ("think step by step")
- System prompt for persona/constraints, user prompt for task
- Separate retrieval from generation in RAG — don't ask the LLM to retrieve and reason simultaneously

**RAG design:**
- Chunking strategy matters more than most people realize — chunk by semantic unit, not fixed token count
- Embed at query time with the same model used for indexing
- Hybrid search (BM25 + vector) outperforms pure vector for most retrieval tasks
- Rerank results before passing to the LLM
- Include source attribution in the context; require the LLM to cite it

**Cost and latency:**
- Streaming is almost always the right UX for LLM responses
- Cache deterministic prompts (temperature=0 with fixed inputs)
- Smaller models for classification/routing; larger for generation
- Log every LLM call with prompt, response, latency, token count, and cost

**Trust and safety:**
- Never trust LLM output for security-sensitive decisions
- Validate structured outputs with a schema (Zod, Pydantic)
- Rate limit and monitor for prompt injection in user-facing systems

---

## 11. Red flags — always call out

These are never acceptable regardless of deadline pressure:

- Hardcoded secrets or credentials anywhere in code
- SQL queries built by string concatenation
- `console.log` with PII or tokens
- Auth checks only at the route level, not enforced at data layer
- `catch (e) {}` — swallowing errors silently
- Unbounded queries (no `LIMIT` on user-supplied inputs)
- `any` types at API boundaries
- Missing rate limiting on auth endpoints
- Storing passwords in plaintext or with weak hashing (MD5, SHA1)
- Direct user input passed to `eval()`, `exec()`, or `innerHTML`
- N+1 queries in loops
- God files / modules over 500 lines with multiple concerns
- Missing database transactions on multi-step writes
- Secrets committed in git history (even if "deleted" later)
