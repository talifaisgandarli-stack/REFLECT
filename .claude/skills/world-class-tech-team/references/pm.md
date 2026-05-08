# PM Reference

Senior PM mindset: you've run product at companies where the roadmap was a competitive weapon, not a wish list. You know that the hardest part of building product is deciding what NOT to build — and defending that decision when everyone disagrees.

The job is not to manage a backlog. The job is to find, define, and deliver value.

---

## Table of contents
1. Product thinking foundations
2. Discovery & opportunity identification
3. Dual-track agile
4. Writing requirements
5. OKRs & goal-setting
6. Prioritization frameworks
7. Roadmaps
8. Metrics & analytics
9. A/B testing & experimentation
10. Stakeholder management
11. AI product considerations
12. Anti-patterns

---

## 1. Product thinking foundations

**Features are hypotheses. Ship them like a scientist, not an artist.**
Every feature is a bet: "We believe that [building X] for [these users] will result in [this outcome], because [this evidence]." State the bet explicitly. Measure whether you were right.

**Jobs To Be Done (JTBD).** Users don't want your product — they want to accomplish something in their life. The "job" is the progress they're trying to make. Find the job; build the tool that does it better than the alternative.
> "When I'm [situation], I want to [motivation], so I can [expected outcome]."
This frame reveals what you're really competing with. A milkshake doesn't compete with other milkshakes — it competes with a bagel, a banana, and a boring commute.

**Every feature has four costs:**
1. Build cost (engineering time)
2. Maintenance cost (ongoing complexity)
3. Cognitive load cost (every feature users must understand before ignoring)
4. Opportunity cost (what you didn't build instead)

**The best product decisions often delete something.** Before adding, ask: what can we remove? Simpler products win on retention.

**Build for your best users; design for your most confused ones.** Your power users define what "good" looks like. Your most confused users define what "finished" looks like.

---

## 2. Discovery & opportunity identification

Discovery happens continuously, not in a sprint before development.

**The opportunity solution tree (Teresa Torres):**
```
Desired outcome (business goal)
  └── Opportunity 1 (unmet user need)
        ├── Solution A
        └── Solution B
  └── Opportunity 2 (unmet user need)
        └── Solution C
```
Map the tree before proposing solutions. Most teams jump to solutions before fully understanding the opportunity space.

**Customer interviews — how to do them:**
- Talk to 5–10 users per cycle (more for a new problem space)
- Ask about past behavior, not hypothetical future behavior ("Tell me about the last time you..." not "Would you use...")
- Never pitch your solution in a discovery interview
- Listen for: workarounds, frustrations, unmet expectations, surprising use cases
- Synthesize themes across interviews; resist the "one user said" trap

**Problem framing:**
```
Observation: [what we see happening]
Hypothesis:  [what we think is causing it]
Impact:      [who is affected and how]
Evidence:    [data or qualitative signals that support this]
Question:    [what we need to learn to confirm or reject]
```

**Assumption mapping.** Before building, list every assumption your solution depends on. Rate each by: importance (if wrong, the solution fails) × uncertainty (how sure are we?). Test the high-importance, high-uncertainty ones first.

---

## 3. Dual-track agile

Separate discovery work from delivery work. Both run continuously in parallel.

**Discovery track:** Validating problems and solutions before committing to build. Output: decisions (build this, not that), validated prototypes, user research synthesis.

**Delivery track:** Building and shipping validated solutions. Output: working software.

**The rule:** Nothing enters the delivery track without passing through discovery. "Let's just build it and see" is a discovery failure, not a delivery strategy.

**Discovery techniques by fidelity:**
- Lowest: customer interviews, data analysis, competitor analysis
- Low: wireframes, paper prototypes, design mockups
- Medium: clickable prototypes, fake doors (feature announcements that measure interest)
- High: technical spikes, shadow mode (build it, don't expose it, measure backend metrics)
- Highest: limited beta, feature flags with 1% rollout

---

## 4. Writing requirements

A good spec reduces ambiguity between intent and implementation. A bad spec moves the ambiguity to production.

**Feature spec template — ALWAYS use this structure:**

```
# [Feature Name]

## Problem statement
Who has this problem? How do we know? What's the impact if we don't solve it?

## Success metrics
Primary: [one metric that tells us if this worked]
Secondary: [1–2 supporting signals]
Guardrail: [metrics we must not degrade]
How measured: [instrumentation already exists / needs to be added]

## User stories
As a [user type], when I [situation], I want to [action] so that [outcome].

## Acceptance criteria
Given [context]
When [action]
Then [result]
(Repeat for each user story, including edge cases)

## Scope
In scope:
- [explicit list]

Out of scope (explicitly):
- [explicit list — anything obviously related but excluded]

## Edge cases & open questions
- [What happens if...?]
- [What do we do when...?]

## Dependencies
- [Teams, APIs, data, or infrastructure this depends on]
- [What must be true before we can ship]

## Launch plan
- [ ] Feature flag in place
- [ ] Analytics instrumented
- [ ] Rollback plan defined
- [ ] Support team briefed
- [ ] Docs / changelog updated
```

**User story quality bar:**
- Every "I want to" must imply a clear UI behavior
- Every "so that" must be a user outcome, not a feature description
- "So that I can use the new dashboard" is not an outcome. "So that I can see my weekly performance without asking my manager" is.

**Acceptance criteria must be testable.** "The page should load quickly" fails. "95% of page loads complete in < 1s measured by LCP" passes.

---

## 5. OKRs & goal-setting

OKRs work when they create focus and alignment. They fail when they become a performance review ritual.

**Objective:** Qualitative, inspirational direction. "Become the fastest way for small teams to manage projects."

**Key Results:** Quantitative, measurable outcomes. Not tasks or outputs — results.
- ✅ "Increase weekly active teams from 8k to 15k"
- ✅ "Reduce time-to-first-project from 12 minutes to 4 minutes"
- ❌ "Launch mobile app" (output, not outcome)
- ❌ "Improve NPS" (too vague — by how much? for which segment?)

**OKR anti-patterns:**
- Too many KRs (max 3–4 per objective)
- KRs that are tasks disguised as outcomes
- OKRs that are sandbagged to guarantee green
- Setting OKRs without resourcing them
- Evaluating OKRs only at quarter end

**Product OKR example:**
```
Objective: Make onboarding so good that new users achieve their first success in one session

KR1: 70% of new signups complete their first project within 24 hours (up from 40%)
KR2: 7-day retention for new users reaches 55% (up from 38%)
KR3: Onboarding NPS reaches +45 (up from +22)
```

---

## 6. Prioritization frameworks

**RICE scoring** (best for backlog prioritization):
```
Score = (Reach × Impact × Confidence) / Effort

Reach:      How many users affected per quarter?
Impact:     0.25 (minimal) / 0.5 / 1.0 / 2.0 / 3.0 (massive)
Confidence: 50% (low) / 80% (medium) / 100% (high)
Effort:     Person-months
```

**The Kano model** (for feature discovery):
- Basic needs: absence causes dissatisfaction, presence is expected (login, save)
- Performance needs: more = better (speed, reliability)
- Delighters: unexpected, drives loyalty when present (thoughtful empty states, smart defaults)
Focus engineering effort on performance needs; invest in delighters sparingly but intentionally.

**Cut scope horizontally, not vertically.** Reduce the number of features in v1, not the quality of each feature. A half-built feature is worse than no feature — it creates confusion and support burden.

**The NOW / NEXT / LATER / NEVER framework:**
- NOW: committed, resourced, in sprint
- NEXT: validated, queued, will resource next quarter
- LATER: interesting but not yet validated or resourced
- NEVER: explicitly rejected — this clarity prevents repeated conversations

---

## 7. Roadmaps

**A roadmap is a communication tool, not a commitment.**

**What roadmaps communicate:**
- Direction and priority (this is what we think matters most)
- Confidence level (now vs later = high confidence vs low)
- What we're NOT doing (explicit rejections prevent repeated requests)
- How initiatives connect to goals

**Roadmap formats:**
- Now/Next/Later (themes-based): best for early-stage or fast-moving products
- Quarterly outcomes roadmap: shows goals, not features; best for alignment across teams
- Feature-based roadmap: specific delivery dates; only appropriate when you're highly confident in scope and timeline (rare)

**Never put specific dates on low-confidence items.** Stakeholders treat dates as commitments. An estimated date for a LATER item becomes a missed promise.

**Roadmap review cadence:**
- Monthly: internal team and engineering
- Quarterly: stakeholders and leadership
- Never: public-facing roadmaps with specific dates (always ship earlier or later)

---

## 8. Metrics & analytics

**The metric hierarchy:**
```
North Star Metric (1)          ← value delivered to users
  └── Input Metrics (3–5)       ← drivers of the north star
        └── Health Metrics      ← guardrails, must not degrade
              └── Debug Metrics ← diagnostic, used when something breaks
```

**AARRR (pirate metrics) for growth:**
- Acquisition: how do users find you?
- Activation: do they have a good first experience?
- Retention: do they come back?
- Revenue: do they pay?
- Referral: do they tell others?
Most products over-invest in acquisition and under-invest in retention. Retention is the multiplier.

**Retention cohort analysis.** Plot retention curves by signup cohort. A flattening curve (not reaching zero) means you have a retained core. A curve reaching zero means the product is not sticky.

**Avoid vanity metrics:**
- Page views (a slow page inflates page views)
- Registered users (most never return)
- App downloads (most never open the app)
- Features shipped (output, not outcome)

**Instrumentation checklist for every feature:**
- [ ] Feature exposure event (did they see it?)
- [ ] Feature engagement event (did they use it?)
- [ ] Feature completion event (did they succeed?)
- [ ] Error events (did something go wrong?)
- [ ] Time-to-completion (how long did it take?)

---

## 9. A/B testing & experimentation

**Test the thing that matters, not the thing that's easy to test.**
Button color tests are easy. Onboarding flow tests are hard. Do the hard ones.

**Experiment design checklist:**
- [ ] Hypothesis stated: "We believe [change] will [metric movement] because [reason]"
- [ ] Primary metric defined
- [ ] Guardrail metrics defined (what must not degrade)
- [ ] Sample size calculated (use a power calculator — don't guess)
- [ ] Minimum detectable effect defined (what change is meaningful to the business?)
- [ ] Randomization unit chosen (user ID, session, device — must be consistent)
- [ ] Duration set (run for at least 2 full weeks to avoid day-of-week bias)

**Common A/B test mistakes:**
- Stopping early when results look good (p-hacking)
- Running on insufficient sample (underpowered — can't detect real effects)
- Testing multiple changes simultaneously in the same experiment
- Ignoring novelty effects (users behave differently when something is new)
- Not accounting for network effects (users affect each other's experience)

**When not to A/B test:**
- When the change is obviously correct (don't A/B test "fix the broken button")
- When your sample is too small to reach significance in reasonable time
- When the ethical cost of showing users a worse experience is too high

---

## 10. Stakeholder management

**The 4 stakeholder types (RACI):**
- Responsible: does the work
- Accountable: owns the outcome
- Consulted: input before decisions
- Informed: notified after decisions

Match communication depth to role. Consulted ≠ Informed.

**The recommendation memo structure:**
```
Recommendation: [1-sentence answer]
Context: [what's the situation, what decisions have already been made]
Options considered: [2–3 alternatives with trade-offs named]
Recommended option: [your recommendation with rationale]
Risks: [what could go wrong and how you'd mitigate it]
Decision needed: [specific ask, by specific date]
```

Lead with the recommendation, not the background. Decision-makers read top-down and run out of time.

**Handling pushback on prioritization:**
1. Acknowledge: "I understand why this feels urgent."
2. Contextualize: "Here's how it compares to our current priorities on these dimensions."
3. Offer visibility: "I'll put it in NEXT so you can see when it's queued."
4. Escalate explicitly: "If you believe this should preempt X, let's escalate to [DRI] — I want to make sure we're aligned."

Never say "no" without a "not now" or a "here's what would have to be true for this to become yes."

**Disagree and commit.** Once a decision is made by the right DRI, align publicly and fully — regardless of your private opinion. Revisit with data after shipping, not before.

---

## 11. AI product considerations

AI features require a different PM playbook.

**Evals before development.** You can't unit test an LLM output the same way you test a sort function. Define your evals (test cases + expected outputs) before writing a line of code. Evals are your spec.

**Design for failure modes.** LLMs fail in ways that are different from traditional software: confidently wrong, inconsistently right, sensitive to prompt phrasing. Your product must handle these gracefully.

**Trust calibration is a UX problem.** Users must know when to trust AI output and when to verify. Design explicit trust signals: confidence indicators, source citations, "check this" prompts for high-stakes outputs.

**The automation spectrum:**
```
Manual          → AI-assisted     → AI-suggested  → AI-automated
(user does all)   (AI helps)        (AI proposes)   (AI acts autonomously)
```
Every AI feature sits somewhere on this spectrum. Make that position explicit — in the design, in the copy, in the mental model you're setting. Users who expect automation and get suggestion feel the product is broken, and vice versa.

**Latency is a product problem, not just an engineering one.** LLM latency affects UX fundamentally. Use streaming. Set expectations ("generating..." not a blank screen). Break long tasks into visible steps.

**Cost modeling upfront.** LLM costs scale with usage in ways traditional software doesn't. Include cost per user, cost at 10× scale, and cost at edge cases (users who use it 100× per day) in your spec.

**Feedback loops.** AI products improve with data. Design feedback mechanisms early: thumbs up/down, correction flows, explicit ratings. Treat this data as a product asset.

---

## 12. Anti-patterns

**Building what's easy to measure, not what matters.** Optimizing a metric that's easy to instrument (time on site) instead of one that reflects real value (tasks completed successfully).

**Roadmaps as commitments.** A roadmap is a hypothesis about what will create value. Treat missed roadmap items as data, not failures.

**Feature factory thinking.** Measuring PM success by features shipped rather than outcomes improved. Output ≠ outcome.

**Copying competitors without understanding their context.** "Competitor X built this" is not a product strategy. They may have built it for wrong reasons, for a different user, at a different scale.

**Saying yes to every stakeholder.** Saying yes to everyone means saying no to focus. The roadmap is a prioritization tool — if everything is a priority, nothing is.

**Skipping the launch plan.** Features that ship without instrumentation, without a rollback plan, and without the support team briefed will create incidents that take 3× longer to resolve.

**"Users asked for it" as justification.** Users describe solutions, not problems. The PM's job is to understand the underlying problem and evaluate whether the requested solution is actually the best one.
