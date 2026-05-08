# Examples & Output Templates

Real examples of what world-class output looks like. Use these as the quality bar — not as templates to fill in mechanically, but as demonstrations of the standard.

---

## 1. Code review comment

**Mediocre review:**
> "This doesn't look right. You should use a different approach."

**World-class review:**
> **N+1 query — will hurt at scale**
>
> This loop calls `getUserById()` once per order, so 100 orders = 100 DB round trips. At your current volume it's invisible; at 10k orders/day it'll show up in p95 latency.
>
> Suggest: fetch all user IDs upfront, do one batch query, then map:
> ```typescript
> const userIds = orders.map(o => o.userId)
> const users = await getUsersByIds(userIds)           // 1 query
> const userMap = new Map(users.map(u => [u.id, u]))
> const ordersWithUsers = orders.map(o => ({
>   ...o,
>   user: userMap.get(o.userId)
> }))
> ```
> This is a O(n) → O(1) lookup improvement after the batch query.

---

## 2. Architecture decision record (ADR)

```
# ADR-042: Use Postgres for event store instead of EventStoreDB

## Status
Accepted — 2025-03-14

## Context
We need to store and replay domain events for the order service. Two options evaluated: EventStoreDB (purpose-built) vs Postgres with an events table.

## Decision
Use Postgres with an append-only events table.

## Rationale
- Our team has deep Postgres expertise; EventStoreDB has a learning curve and limited internal knowledge
- Our event volume (est. 50k events/day) is well within Postgres's sweet spot
- Postgres gives us transactions, joins with other tables, and familiar tooling
- EventStoreDB's advantages (projections, subscription model) are not needed for our use case yet
- We can migrate to a dedicated event store later if volume demands it — the event table schema is portable

## Trade-offs accepted
- We forgo native EventStoreDB features (competing consumers, built-in projections)
- We must implement our own optimistic concurrency check
- Postgres is not optimized for high-cardinality event streams (>1M events/aggregate) — acceptable at current scale

## Consequences
- Add events table migration in PR #441
- Implement append-only constraint at the application layer (no UPDATE/DELETE on events)
- Review again at 10M events/month
```

---

## 3. Design critique

**Mediocre critique:**
> "The button should be bigger. The colors don't look right. The form is confusing."

**World-class critique:**
> **What's working:**
> The visual hierarchy is solid — the primary CTA reads immediately and the secondary action is clearly subordinate. The card layout handles variable content length gracefully.
>
> **Issues to address:**
>
> 1. **Empty state is a dead end.** When the user has no saved items, the page just shows an empty grid. There's no explanation of what this section is for and no invitation to add the first item. Add: illustration + 1-sentence explanation + primary CTA ("Save your first item →").
>
> 2. **Form validation only on submit.** Users complete the full form, hit submit, then get 3 errors they could have caught earlier. Move validation to on-blur. For email, validate format; for password, show requirements inline as the user types.
>
> 3. **Contrast failure on secondary button.** The ghost button text (#767676 on white) is 4.48:1 — just below WCAG AA (4.5:1). Darken to #737373 minimum, or use #6B6B6B to have clear headroom.
>
> 4. **No loading state for the async search.** When the user types in the search field, results update after a 400ms debounce — but there's no indicator that a search is happening. Add a spinner inside the search input, or subtle skeleton placeholders in the results area.
>
> 5. **Mobile: touch targets on the filter chips are 32px tall.** The minimum is 44px. Add vertical padding or increase chip height.

---

## 4. Full feature spec (abbreviated example)

```
# Saved Searches

## Problem statement
Power users run the same complex search 5–20 times per day. Each time, they re-enter 4–7 filter parameters manually, taking 45–90 seconds. We've seen this pattern in 8/10 recent user interviews with analysts, and usage data shows the top 15% of users perform identical searches on consecutive days 60% of the time.

## Success metrics
Primary:   Average searches per daily active user increases from 6.2 to 9.0 (indicates reduced friction)
Secondary: Analyst segment 7-day retention increases from 62% to 70%
Guardrail: Search latency p95 does not increase
Instrumentation: Search events already tracked; save/load events need to be added (1 day eng effort)

## User stories
As an analyst, when I run a complex filtered search I use daily, I want to save it with a name so that I can rerun it in one click instead of re-entering all parameters.

As an analyst, when I open the search page, I want to see my saved searches so that I can quickly access my frequent queries without rebuilding them.

## Acceptance criteria
Given I have run a search with at least one filter applied
When I click "Save search"
Then a modal appears prompting me for a name, with my current search parameters shown as a preview

Given I have saved at least one search
When I open the search page
Then my saved searches appear in a "Saved" section above the results, sorted by most recently used

Given I click a saved search
When the page loads
Then all filters are applied and results are shown, matching exactly what I saved

Given I want to delete a saved search
When I hover over a saved search and click the delete icon
Then a confirmation appears and the search is removed from my list

## Scope
In scope:
- Save current search with custom name
- Load saved searches (applies all filters)
- Delete saved searches
- Max 20 saved searches per user (with clear UI indication when limit reached)

Out of scope (explicitly):
- Sharing saved searches with teammates (v2)
- Organizing saved searches into folders (v2)
- Editing a saved search after creation (delete + re-save is acceptable for v1)
- Saved searches on mobile (desktop only for v1)

## Edge cases
- User reaches 20-search limit: show "You've reached the limit" message with option to delete an existing search
- Two searches saved with same name: allowed (user may want "Daily report v1" and "Daily report v2")
- Saved search references a filter option that no longer exists: apply remaining filters, show warning that one filter was removed

## Dependencies
- Search filter state must be serializable to JSON (confirm with eng — 2h spike)
- User settings API for persistence (exists, needs new endpoint)

## Launch plan
- [ ] Feature flag: saved-searches-v1
- [ ] Analytics events: search.saved, search.loaded, search.deleted
- [ ] Rollback: disable feature flag, saved searches remain in DB but UI is hidden
- [ ] Support brief: what users see if they hit the 20-search limit
- [ ] Changelog entry
```

---

## 5. Prioritization recommendation

**Mediocre:**
> "I think we should do the export feature because users keep asking for it."

**World-class:**
> **Recommendation: Deprioritize CSV export in favor of saved searches.**
>
> Both are on the backlog. Here's the case for the swap:
>
> | | CSV Export | Saved Searches |
> |---|---|---|
> | User requests | 47 tickets | 31 tickets |
> | Revenue at risk | $0 confirmed | $180k ARR (3 enterprise accts flagged it in renewal calls) |
> | Usage signal | N/A (not built) | Top 15% users do same search daily (usage data) |
> | Effort | 3 weeks | 2 weeks |
> | RICE score | 2.4 | 6.1 |
>
> CSV export is louder in support volume but the saved searches signal is stronger on both retention impact and revenue risk. The 3 enterprise accounts that flagged it have a combined ARR of $180k and renewals in Q3.
>
> I'd suggest: saved searches in this sprint, CSV export immediately after. If we need to deprioritize one, it's CSV export.
>
> Decision needed from: [stakeholder] by Friday — this affects sprint planning Monday.

---

## 6. Engineering architecture recommendation

**Mediocre:**
> "We could use microservices or a monolith. It depends on your needs."

**World-class:**
> **Start with a modular monolith. Here's why.**
>
> You're pre-PMF with a team of 4 engineers. Microservices would give you:
> - Independent deployability (you don't need this yet — you deploy once a day, together)
> - Independent scalability (your bottleneck is not uneven load across services)
> - Team autonomy (your team is too small for this to matter)
>
> What microservices would cost you right now:
> - Network latency between services (adds 5–20ms per hop)
> - Distributed transaction complexity (you'll hit this within the first month)
> - Operational overhead: 4 services × (deploy pipeline + monitoring + logs + alerts) = 4× infra complexity
> - Debugging is harder: a bug that would take 20 minutes to trace in a monolith takes 2 hours across service boundaries
>
> **Recommendation:** Build a modular monolith with clean domain boundaries (auth, billing, core, notifications as separate modules). When you have a specific scaling problem — a domain that needs to deploy independently or scale differently — extract that domain into a service. Extract based on evidence, not anticipation.
>
> **When to revisit:** When you have > 8 engineers, or when a specific module has measurably different scaling needs. Not before.
