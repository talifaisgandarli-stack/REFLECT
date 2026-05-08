# Designer Reference

Principal Designer mindset: you've led design at companies where design was a competitive advantage. You know that most software fails its users before a single pixel is drawn — because the information architecture was wrong, the mental model was wrong, or the team confused "what users asked for" with "what users need."

Design is thinking made visible.

---

## Table of contents
1. Design philosophy
2. Information architecture
3. Visual design system
4. Interaction design
5. Accessibility (a11y)
6. Component design
7. Dark mode & theming
8. Design–engineering handoff
9. User research & testing
10. Anti-patterns
11. Critique framework

---

## 1. Design philosophy

**Clarity over cleverness.** If a user has to think, you've already failed the first test. Cognitive load is finite and precious.

**Design for the worst-case user, not the ideal one.** The stressed, distracted, low-battery, one-hand, first-time user. Not the person who reads your onboarding carefully and uses the app in daylight with both hands.

**Every interaction should feel inevitable in hindsight.** When a design is right, users don't notice it. When it's wrong, they feel confused and blame themselves.

**Copy IS design.** Every label, button text, error message, tooltip, and placeholder is a design decision. Bad copy makes good UI feel broken. Good copy makes mediocre UI usable.

**Defaults are opinions.** The default state of every control, form, and flow communicates what you think most users want. Make that communication intentional.

---

## 2. Information architecture

IA is the skeleton of your product. Bad IA can't be fixed with good visual design.

**The 3 questions for every IA decision:**
1. Where am I? (orientation)
2. What can I do here? (affordance)
3. Where can I go? (navigation)

**Navigation patterns — choose based on depth and frequency:**
- Tab bar: 3–5 top-level destinations, all equally frequent, mobile-first
- Side nav: 5–15 destinations, hierarchical, desktop or complex apps
- Top nav: 3–7 destinations, content-heavy, web
- Breadcrumbs: deep hierarchies where context of current location matters
- Command palette: power users, frequent actions, keyboard-first

**Card sorting before building.** If you haven't validated your IA with real users, you've made it up. Run a card sort (moderated or unmoderated) before committing to a navigation structure.

**Search is not a substitute for bad navigation.** If users rely on search to find things they should navigate to, the IA is broken.

**Progressive disclosure.** Show the information needed to take the next step. Not all information about all topics. Reveal detail on demand.

---

## 3. Visual design system

**8pt grid.** Every spacing, size, and position is a multiple of 8px. Use 4px for micro-adjustments (icon padding, badge insets). The grid creates visual rhythm that users feel even if they can't name it.

**Type scale:**
- Use a modular scale (e.g. 1.25 ratio)
- 5 sizes maximum: xs (12), sm (14), base (16), lg (20), xl (24/32)
- 2 weights only: regular (400) and medium (500). Bold (700) for display only
- Line height: 1.5 for body, 1.2 for headings, 1.0 for single-line UI labels
- Never set line-height below 1.0 — ascenders and descenders collide

**Color system:**
- 1 primary (brand action), 1 secondary (supporting actions)
- Semantic colors: success (green), warning (amber), error (red), info (blue)
- Neutrals: 9-step grayscale from near-white to near-black
- Never more than 3 non-neutral colors in a single view
- Colors must pass WCAG AA contrast (4.5:1 for text, 3:1 for UI elements)

**Spacing tokens — use these names, not raw values:**
```
space-1:  4px   (micro: icon padding, tight insets)
space-2:  8px   (tight: related elements)
space-3:  12px  (compact: form field internals)
space-4:  16px  (base: default component padding)
space-6:  24px  (comfortable: card padding)
space-8:  32px  (loose: section separation)
space-12: 48px  (section: major layout gaps)
space-16: 64px  (page: hero padding, major sections)
```

**Elevation / shadow:** Use sparingly to communicate layering, not decoration. Modals above sheets above cards above page. Never purely aesthetic.

---

## 4. Interaction design

**Touch targets: minimum 44×44px.** Prefer 48×48px. The smallest targets in your UI determine your error rate on mobile.

**Loading states — three types, three patterns:**
- Skeleton screens for content that has a predictable shape (lists, cards, profiles)
- Spinner for indeterminate waits or actions with no predictable shape
- Progress bar for operations with a known duration (uploads, multi-step processes)
Never use spinners for page-level loads that take > 1s. Skeleton screens reduce perceived wait time.

**Empty states are opportunities, not afterthoughts.** Every empty state needs:
- An illustration or icon (optional but helpful)
- A clear explanation of why it's empty
- A primary action to fill it
"You have no projects" is a dead end. "You have no projects yet — create your first one" is an invitation.

**Error messages — two parts, always both:**
1. What happened (human language, never error codes)
2. What to do next (specific, actionable)
"Something went wrong" fails on both counts. "We couldn't save your changes — check your connection and try again" succeeds.

**Confirmation dialogs — minimize them.** The best confirmation is an undo, not a dialog. Reserve confirmation dialogs for:
- Irreversible destructive actions (permanent delete, not soft delete)
- Actions with significant real-world consequences (send email to 10k users)
For everything else: do the thing, offer undo.

**Feedback timing:**
- 0–100ms: user perceives as instantaneous (button press, toggle)
- 100–300ms: minor delay, show no indicator
- 300ms–1s: show a subtle spinner
- 1s+: show a progress indicator with expectation setting
- 10s+: allow the user to do something else; notify on completion

**Motion principles:**
- Animate layout changes, not arbitrary elements
- Easing: ease-out for elements entering, ease-in for elements leaving
- Duration: 150–300ms for UI transitions, never exceed 500ms for anything interactive
- Respect `prefers-reduced-motion` — always

---

## 5. Accessibility (a11y)

WCAG AA is the floor, not the ceiling. Accessibility is not a feature — it's a quality attribute.

**The 4 POUR principles:**
1. **Perceivable** — all content available to all senses (alt text, captions, color ≠ only signal)
2. **Operable** — all functionality available via keyboard; no seizure-inducing content
3. **Understandable** — language is clear; errors are identified and described
4. **Robust** — works with assistive technology (screen readers, switch access)

**Keyboard navigation — every interactive element must be:**
- Reachable via Tab key
- Activatable via Enter (links, buttons) and Space (checkboxes, toggles)
- Escapable via Escape (modals, dropdowns, popovers)
- Arrow-key navigable within composite widgets (menus, tabs, listboxes)

**Focus management rules:**
- Visible focus ring always (never `outline: none` without a replacement)
- When a modal opens: move focus to the first interactive element inside
- When a modal closes: return focus to the element that triggered it
- Trap focus inside modals — Tab should not reach the content underneath

**Semantic HTML first.** A `<button>` is better than a `<div role="button">`. Semantic elements carry behavior and accessibility for free. Use ARIA only when native semantics are insufficient.

**Key ARIA patterns:**
- `aria-label` for elements with no visible text (icon-only buttons)
- `aria-describedby` for additional context (password requirements, field hints)
- `aria-live` regions for dynamic content (toast notifications, search results updating)
- `aria-expanded` for accordions, dropdowns, and disclosure patterns
- `role="alert"` for error messages that need immediate announcement

**Color contrast requirements:**
- Body text: 4.5:1 minimum (AA), 7:1 preferred (AAA)
- Large text (18px+ or 14px+ bold): 3:1 minimum
- UI elements (icons, borders, inputs): 3:1 minimum
- Never use color as the only means of conveying information (add an icon, pattern, or label)

**Screen reader testing:** Test with VoiceOver (Mac/iOS) and NVDA or JAWS (Windows). Don't assume automated tools catch everything — they find ~30–40% of real a11y issues.

**Images:**
- Decorative images: `alt=""`
- Informative images: `alt` describes the content and purpose
- Complex images (charts, diagrams): `alt` provides a summary; long description elsewhere
- Never use images of text

---

## 6. Component design

**Components should be composable, not monolithic.** A `<Button>` should not also handle modals. Build small, combine large.

**Props API design — treat it like a public API:**
- Use the most specific types possible (not `string` for `variant`, use `'primary' | 'secondary' | 'ghost'`)
- Required props should be the minimum needed; optional props should have sensible defaults
- Event handlers named `onX` (React convention): `onClick`, `onChange`, `onSubmit`
- Avoid boolean props when an enum is more expressive (`isLarge` → `size="lg"`)

**Component states to design for every interactive component:**
- Default
- Hover
- Focus (keyboard)
- Active (pressed)
- Disabled
- Loading (where applicable)
- Error (where applicable)

**The component hasn't shipped until all states exist.** A button without a disabled state is an unfinished component.

**Responsive design — breakpoints:**
```
sm:  640px   (large phones, landscape)
md:  768px   (tablets)
lg:  1024px  (small desktops, landscape tablets)
xl:  1280px  (standard desktop)
2xl: 1536px  (large desktop)
```
Design mobile-first. Ask "how does this work at 375px?" before asking "how does this look at 1440px?"

---

## 7. Dark mode & theming

**Never hardcode colors.** Every color is a token. Tokens adapt to themes; hardcoded hex values don't.

**Semantic token naming:**
```
color.text.primary        → primary body text
color.text.secondary      → muted/supporting text
color.text.disabled       → inactive labels
color.surface.default     → page background
color.surface.raised      → cards, modals
color.surface.overlay     → toast, tooltip backgrounds
color.border.default      → standard borders
color.border.focus        → focus rings
color.action.primary      → primary button fill
color.action.primary.text → text on primary button
```

**Dark mode is not just inverted.** Dark backgrounds with vibrant accent colors create eye strain. In dark mode: desaturate brand colors slightly, reduce contrast in non-critical elements, use elevation (lighter surface = higher layer) instead of shadows.

**Test both modes.** A component only fully reviewed in light mode is not done.

---

## 8. Design–engineering handoff

**Figma annotations are documentation.** Every spec should include:
- Spacing values (use token names, not px)
- Color tokens (not hex)
- Typography tokens
- Interactive states (hover, focus, error)
- Edge cases (what does this look like with 200 characters? with 0 items? with an error?)
- Responsive behavior notes

**Redlines reduce ambiguity.** Annotate distances between elements, not just within components. The space between components is as important as the space within them.

**Name layers properly.** Layer names in Figma become developer questions. `Frame 47` is a question. `Card / Product / Default` is an answer.

**Developer handoff checklist:**
- [ ] All interactive states designed
- [ ] Empty, loading, error states designed
- [ ] Mobile and desktop layouts specified
- [ ] Animation specs (duration, easing, delay)
- [ ] Token names for all colors, spacing, typography
- [ ] Edge cases documented (long text, missing images, 0 items)
- [ ] Accessibility annotations (tab order, ARIA labels for icon buttons)

---

## 9. User research & testing

**5 users find 85% of usability problems.** You don't need a large study to uncover critical issues. But you do need the study.

**Usability test protocol:**
1. Define 3–5 tasks representing real user goals
2. Recruit from your actual target audience (not colleagues)
3. Ask participants to think aloud as they work
4. Never guide; never explain; observe and note where they struggle
5. Measure: task completion rate, time on task, error rate, satisfaction score

**Interview vs survey:** Interviews surface unknown unknowns ("I didn't even know I could do that"). Surveys measure known dimensions at scale. Use both; don't substitute one for the other.

**Tree testing for IA validation.** Before building navigation, test whether users can find things in your proposed structure using text-only tree tests (Optimal Workshop, Maze).

**First-click testing.** Where users click first when given a task predicts 87% of task completion. If the first click is wrong, they rarely recover.

---

## 10. Anti-patterns

**Dark patterns.** Never use design to deceive: hidden unsubscribe links, pre-checked opt-ins, misleading button labeling, confirm-shaming. They erode trust permanently.

**Designing for the demo, not daily use.** Onboarding animations and hero illustrations look great in demos. After the 50th use, they're noise. Design for the person who uses this every day.

**Adding features to solve discoverability problems.** If users can't find a feature, the answer is better IA and better empty states — not more features.

**Form anti-patterns:**
- Splitting inputs that belong together (phone number in 3 boxes)
- Requiring format without accepting it (birthday must be MM/DD/YYYY but showing no hint)
- Validating only on submit (validate on blur, not on submit)
- Clearing inputs on error (never clear the input; show the error next to it)

**Ignoring the mobile case.** "We'll do mobile later" is how you get a broken mobile experience that 60%+ of users encounter.

**Placeholder text as labels.** Placeholder text disappears when the user types. Use floating labels or persistent labels above the input.

---

## 11. Critique framework

When reviewing any design, evaluate in this order:

**1. Clarity** — Can a new user understand this in 5 seconds?
Look for: unclear labels, ambiguous actions, information overload, missing context.

**2. Hierarchy** — Is the most important thing the most prominent?
Look for: visual weight inconsistencies, competing calls to action, buried primary actions.

**3. Completeness** — Are all states designed?
Look for: missing empty state, no loading state, error states that just say "error", edge cases with long content.

**4. Consistency** — Does this feel like the same product?
Look for: one-off patterns that don't exist elsewhere in the system, custom components that duplicate existing ones, spacing that breaks the grid.

**5. Accessibility** — Would this pass WCAG AA?
Look for: low contrast, keyboard traps, missing focus states, icon-only buttons with no labels, form fields without labels.

**6. Delight** — Is there a moment of craft that earns trust?
Look for: transitions that communicate state, micro-interactions that confirm actions, copy that sounds human, illustrations that reflect the user's context.

Critique example:
> "The hierarchy is working — the primary CTA reads immediately. The empty state needs work: there's no explanation of why it's empty and no action to fill it. The form validation is only on submit — move to on-blur. Contrast on the secondary button text is 2.8:1; it needs to be 4.5:1 minimum."
