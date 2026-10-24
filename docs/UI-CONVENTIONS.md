# UI/UX and Anti-Slop Conventions

CashFlow Planner is an operate-mode financial tool, not a marketing site. It should feel like a high-craft check register: quiet paper surfaces, crisp ink hierarchy, tabular numerals, restrained ballpoint blue, and semantic ledger colors. These rules apply to new UI and to UI touched during a change.

The stable visual source of truth is [`src/app/globals.css`](../src/app/globals.css). It defines the `Archivo` font variable (`--font-archivo`), `slate`, `brand`, `emerald`, `rose`, `sheet`, `field`, `field-boundary`, `field-placeholder`, and `highlight` colors, plus `rounded-chip`, `rounded-control`, `rounded-sheet`, `rounded-dialog`, `font-wide`, `font-semiwide`, `font-narrow`, and the `dark` theme.

## 1. Anti-slop catalogue

For every UI change, inspect the source diff and rendered screenshots. The code checks below are search targets, not permission to copy an existing violation. Some existing components are named so that an implementer can review them when making related changes.

| ID | Don't | Detect in code | Detect in screenshots | Do instead |
|---|---|---|---|---|
| ST-01 | Purple, indigo, neon, or decorative gradients and glows | Search for `bg-gradient-`, `from-indigo-`, `via-purple-`, and new glow shadows. Review the gradient accent in [`HaloToast`](../src/components/ui/halo-toast.tsx) separately from content surfaces. | Rainbow washes, neon borders, or glowing halos behind cards and text. | Use `bg-background`, `bg-card`, `bg-sheet`, `bg-muted`, `text-foreground`, `text-muted-foreground`, and `border-border`. Reserve `highlight` for the today marker in [`WeekRow`](../src/components/calendar/week-row.tsx) and intentional chart rendering. |
| ST-02 | Thick colored accent borders on cards, chips, or rows | Flag new `border-l-[3px]`, `border-t-[3px]`, or similar rules. [`EventChip`](../src/components/calendar/week-row.tsx) is the existing domain-specific case to review when editing calendar chips. | Heavy vertical or top stripes that dominate a card or event. | Use a uniform `border border-border`, a domain icon or `+`/`−` sign, and a restrained semantic tint such as `bg-emerald-50` or `bg-rose-50`. **D-18 narrow exception:** the dashboard forecast register may use one neutral double horizontal rule to separate its final accounting total from the running-total lines above it, only on the `RegisterLine` total row in [`DashboardView`](../src/components/dashboard/dashboard-view.tsx). This separator must not become a decorative stripe or be reused on cards, chips, events, or ordinary rows. |
| ST-03 | Tracked-out all-caps eyebrow labels above headings | Search for `uppercase` paired with `tracking-wide` or `tracking-widest`; [`RecurringScanButton`](../src/components/recurring/recurring-scan.tsx) contains an existing example. | Tiny spaced capitals floating above a title or dialog heading. | Use a sentence-case heading, subtext, or an inline [`Badge`](../src/components/ui/badge.tsx) for metadata. |
| ST-04 | Hero metric followed by three equal SaaS stat tiles | Search for new `clamp(` display sizes and `grid-cols-3` tile rows. [`DashboardView`](../src/components/dashboard/dashboard-view.tsx) and its local `SummaryMetric` component are the existing summary composition to reassess when changing the dashboard. | An oversized number above three identical, airy boxes with weak connection to the register. | Keep related figures in a compact ledger summary or cohesive table with a clear reading order. |
| ST-05 | Card-in-card nesting and excessive boxing | Search for nested `<Card>` elements, repeated `rounded-sheet border`, or bordered boxes inside dialogs. | Concentric boxes with double borders and matching radii. | Use one [`Card`](../src/components/ui/card.tsx), `CardBody`, `space-y-*`, `divide-y`, `border-t`, or a flat `bg-muted` band. |
| ST-06 | Competing primary actions or decorative “AI magic” icons | Count visible `variant="primary"` and `bg-brand-600` actions. Flag [`Sparkles`](../src/components/settings/settings-view.tsx) on ordinary data actions. | Two or more solid primary buttons, or sparkle/wand icons in a financial workflow. | Use one primary action per view. Make `Refresh`, `Find recurring`, and `Load demo data` secondary or ghost actions with domain icons. |
| ST-07 | Glassmorphism on content surfaces | Search for new `backdrop-blur` or translucent content backgrounds. Existing mobile chrome in [`AppShell`](../src/components/app-shell.tsx) and modal backdrops are separate, intentional cases. | Ledger text visibly bleeds through a header, card, or toolbar. | Use solid paper/ink surfaces and `border-border`. Limit blur to modal/backdrop behavior. |
| ST-08 | Mixed or decorative font stacks and monospace labels | Search for new font imports and `font-mono`; the SimpleFIN setup token in [`InstitutionsView`](../src/components/institutions/institutions-view.tsx) is the existing technical-text exception. | Generic mixed typography or fake terminal labels for dates and badges. | Use the self-hosted `Archivo` family, `font-semiwide` for headings and totals, and `font-narrow` only when dense calendar chips genuinely need it. |
| ST-09 | Uniform large radii and soft shadows on resting cards | Flag new `rounded-xl`/larger radii or `shadow-md`/`shadow-lg` on resting cards. The [`Card`](../src/components/ui/card.tsx) wrapper uses `rounded-sheet` and `shadow-none`; floating overlays may use shadows. | Puffy cards floating on gray clouds instead of flat register pages. | Use `rounded-chip` for compact metadata, `rounded-control` for controls, `rounded-sheet` for cards, and `rounded-dialog` for dialogs. Keep nested radii concentric. |
| ST-10 | Emoji icons or mismatched icon strokes | Search JSX for Unicode emoji and use of icon sets other than `lucide-react`. | Platform-dependent colored emoji or inconsistent icon weights. | Use one `lucide-react` outline icon set, normally with `aria-hidden="true"` when text already names the action. |
| ST-11 | Centered-everything and marketing copy in workspace screens | Flag `text-center` on multi-line workspace prose and hype words such as `Seamless`, `Supercharge`, or `AI-powered`. Centered [`EmptyState`](../src/components/ui/states.tsx) content is an intentional exception. | Centered paragraphs, slogans, or apologetic “Oops!” errors. | Left-align headings and prose, right-align numeric columns, and write plain factual check-register copy. |
| ST-12 | Ad-hoc control styles and token drift | Search for raw control markup outside shared primitives and button-like link classes in [`DashboardView`](../src/components/dashboard/dashboard-view.tsx). | Adjacent controls have different heights, padding, radii, or focus rings. | Use [`Button`](../src/components/ui/button.tsx), [`Field`](../src/components/ui/field.tsx), [`Card`](../src/components/ui/card.tsx), [`Dialog`](../src/components/ui/dialog.tsx), [`Badge`](../src/components/ui/badge.tsx), and [`Table`](../src/components/ui/table.tsx). Use `Button asChild` for navigation styled as a button. |
| ST-13 | Micro-text and cramped mobile targets | Flag new `text-[10px]`, `text-[11px]`, or interactive controls without `min-h-11`/`min-w-11` where touch sizing is required. Existing calendar and navigation metadata should be checked when touched. | Labels require squinting, mobile actions are hard to tap, or text is truncated without disclosure. | Use `text-sm`/`text-base` for body and controls, `text-xs` for secondary metadata, `text-base sm:text-sm` for mobile inputs, and at least `44×44px` mobile targets (`min-h-11`/`min-w-11`). |
| ST-14 | Gratuitous motion, bounce, and catch-all transitions | Search for new `transition-all`, page-load entrance sequences, bounce springs, or `animate-pulse` outside [`Skeleton`](../src/components/ui/skeleton.tsx). | Pages slide or bounce into place, or hover/press causes layout jitter. | Use `transition-colors` around `150ms`, `150–200ms` ease-out for panels and disclosure, and honor reduced motion through [`AnimatedBalance`](../src/components/ui/money.tsx) and the global reduced-motion rule. |

## 2. Positive rules

### Type and spacing

- Use the self-hosted `Archivo` family from [`src/app/layout.tsx`](../src/app/layout.tsx). Use a fixed rem scale: page titles around `1.75rem`, section titles `1rem–1.125rem`, body text `14–16px`, and captions at least `12px`.
- Use `font-semiwide` for headings and key totals, `tabular-nums` for numeric values, and `font-narrow` only for dense calendar chips. Do not add a second UI font or new fluid display sizing with `clamp(`.
- Follow the page rhythm already established in [`AppShell`](../src/components/app-shell.tsx): `px-4 py-6`, `sm:px-6`, `lg:px-10 lg:py-10`, and `max-w-7xl`. Prefer `gap-4`/`gap-6`, `space-y-6`/`space-y-8`, and `p-5` over arbitrary values.
- Keep prose at `max-w-[65ch]`. Align related content to shared page edges; use whitespace and hairline dividers before adding another box.

### Color and theme parity

- Use semantic tokens from [`src/app/globals.css`](../src/app/globals.css): `bg-background`, `bg-card`, `bg-sheet`, `bg-field`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`, `border-field-boundary`, `placeholder:text-field-placeholder`, `bg-brand-600`, `text-emerald-700`, and `text-rose-700`.
- The check-register roles are: light paper `#e9eeea`, light sheet `#fbfcfa`, light ink `#172a33`, light brand `#2c49a6`, light income `#1c6b43`, and light bill/negative `#a82a20`. Dark mode maps them to carbon `#121212`, sheet `#1c1c1c`, ink `#e0e0e0`, brand `#e0e0e0`, income `#7fcf9f`, and bill/negative `#ee948a`.
- Color is semantic, never decorative: emerald means money in or positive state; rose means money out, negative state, or destructive action; `highlight` marks today. Always pair color with text, a sign, an icon, or a state label.
- Test every changed surface in both `.dark` and light mode. Do not introduce raw component-level hex values or unauthorized purple, indigo, red, green, or blue palette ramps.

### Money, dates, and density

- Amounts remain integer cents. Use the existing formatting path and shared [`Balance`, `AnimatedBalance`, and `EventAmount`](../src/components/ui/money.tsx) components instead of recreating display logic.
- Apply `tabular-nums` to balances, amounts, date counts, and version numbers. In tables, use `text-right` for numeric headers and cells and left alignment for names, dates, and status.
- Negative balances use the shared alert icon and screen-reader text. Income and bills use the shared arrow and signed amount cues. Skipped events use muted text, `line-through`, and explicit `Skipped` copy.
- At `1440×900`, the current closing balance, forecast risk, reconciliation math, and upcoming bills should be understandable without excessive scrolling. At `390×844`, reflow tables into the card composition in [`ScheduleListPage`](../src/components/schedule/schedule-list-page.tsx), hide empty non-today month days as [`WeekRow`](../src/components/calendar/week-row.tsx) does, and prevent horizontal page overflow.

### Components, copy, and states

- Prefer shared exports from `src/components/ui/`: [`Button`](../src/components/ui/button.tsx), [`Card`](../src/components/ui/card.tsx), [`Badge`](../src/components/ui/badge.tsx), [`Field`](../src/components/ui/field.tsx), [`Input`](../src/components/ui/input.tsx), [`MoneyInput`](../src/components/ui/field.tsx), [`Select`](../src/components/ui/field.tsx), [`Textarea`](../src/components/ui/field.tsx), [`Switch`](../src/components/ui/field.tsx), [`Dialog`](../src/components/ui/dialog.tsx), [`ConfirmDialog`](../src/components/ui/confirm-dialog.tsx), [`Table`](../src/components/ui/table.tsx), [`ToggleGroup`](../src/components/ui/toggle-group.tsx), [`DropdownMenu`](../src/components/ui/dropdown-menu.tsx), and [`Expandable`](../src/components/ui/expandable.tsx).
- Keep one `variant="primary"` action per view, including empty states. Name actions for their result: `Add bill`, `Add income`, `Connect a bank`, `Save settings`, `Refresh`, `Retry`, and `Load demo data` are repository examples. Use sentence case and active voice.
- Never imply that projections are live bank balances. Distinguish entered projections from read-only SimpleFIN snapshots. An error must say what failed and how to recover; do not use vague or blaming copy.
- Every data view and async control has an explicit loading, empty, error, partial/out-of-window, and success state where applicable. Use [`LoadingRegion`](../src/components/ui/skeleton.tsx) with layout-matched [`Skeleton`](../src/components/ui/skeleton.tsx), [`EmptyState`](../src/components/ui/states.tsx), [`ErrorState`](../src/components/ui/states.tsx), [`InlineStatus`](../src/components/ui/states.tsx), or [`HaloToast`](../src/components/ui/halo-toast.tsx). Calendar views must explain `Before projection start`, `Beyond 12-month forecast limit`, and partial weeks when those states occur.

### Motion

- Motion must explain an interaction. Use `transition-colors` around `150ms`; use `150–200ms` ease-out for drawers, dialogs, and [`Expandable`](../src/components/ui/expandable.tsx) disclosure.
- Do not add page-load entrances, staggered decoration, bounce physics, or `transition-all`. [`AnimatedBalance`](../src/components/ui/money.tsx) may animate the number, but it must render a static value when reduced motion is requested.
- Preserve the reduced-motion behavior in [`src/app/globals.css`](../src/app/globals.css), which collapses animation and transition duration and disables smooth scrolling.

### Accessibility

- Meet WCAG 2.2 AA targets: normal text and placeholder text at least `4.5:1`, large text at least `3:1`, and unfocused input boundaries, control boundaries, and focus indicators at least `3:1` in both themes.
- Make mobile controls at least `44px` high (and at least `44×44px` where a compact touch target is used); provide at least `24×24px` pointer targets on desktop with adequate spacing. Sticky bars and dialog footers must not obscure focus.
- Preserve the skip link to `#main`, `aria-current="page"` navigation state, explicit labels, `aria-invalid` and `aria-describedby` for field errors, and screen-reader status/alert roles.
- Controlled dialogs must restore focus to their opener, or to a sensible connected fallback when the opener was unmounted.
- **D-19 inline-link exception:** inline text links may use the WCAG 2.5.8 inline-text-link exception instead of a `44×44px` box when they remain part of a sentence or text block and are not standalone controls; standalone action links still need the target-size rule.
- Preserve focus restoration in [`ConfirmDialog`](../src/components/ui/confirm-dialog.tsx). Charts must have a readable summary and an expandable table alternative, as [`TrendChart`](../src/components/dashboard/trend-chart.tsx) does. Never rely on color alone for money direction, negative balances, or status.

## 3. Screenshot grading rubric

Code-only review does not satisfy a UI acceptance criterion. For every changed route, dialog, or state, capture and view real Playwright screenshots at both required viewports and both themes:

- Desktop Light: `1440×900`
- Desktop Dark: `1440×900`
- Mobile Light: `390×844`
- Mobile Dark: `390×844`

Dark is the default theme. Set `localStorage["cashflow-theme"] = "light"` for light screenshots; the storage key is defined in [`src/lib/theme.ts`](../src/lib/theme.ts). Cover the affected state, including loading, empty, error, negative, partial, or expanded states when applicable. For a full UI audit, cover `/`, `/calendar`, `/bills`, `/income`, `/institutions`, `/institutions/[id]`, and `/settings`.

Score each screenshot set from 1 to 5 in these eight dimensions:

| Dimension | Passing signal |
|---|---|
| D1 Slop-free authenticity and domain fit | No banned tell; the screen reads as a quiet check register. |
| D2 Hierarchy and first-second scan | One clear focal point and one primary action; risk and next action are obvious. |
| D3 Typography and numeric discipline | Archivo roles, readable sizes, tabular numerals, and aligned currency columns. |
| D4 Color, contrast, and theme parity | Semantic colors and required contrast hold in light and dark. |
| D5 Layout, spacing, and surface economy | Shared edges, intentional gaps, no overflow, and no needless nested boxes. |
| D6 Responsive mobile composition | Clean `390×844` reflow, no clipping or horizontal scroll, touch targets are usable. |
| D7 Component and interaction consistency | Shared controls with coherent default, hover, focus, disabled, loading, and active states. |
| D8 Copy, states, and error clarity | Plain copy and complete loading, empty, error, partial, and success recovery paths. |

Passing requires at least `32/40` and at least `4` in every dimension touched by the change. If a required screenshot was not viewed, the result is incomplete. If a banned tell is visible, D1 cannot exceed `2` and the total is capped at `24/40`. Any contrast failure, undersized target, or page-level overflow fails the affected screen.

Record evidence in this shape:

```markdown
### Visual Grade: <screen or flow> (`<route>`)

**Artifacts inspected:**
- Desktop Light (`1440x900`): `<screenshot path>`
- Desktop Dark (`1440x900`): `<screenshot path>`
- Mobile Light (`390x844`): `<screenshot path>`
- Mobile Dark (`390x844`): `<screenshot path>`

| Dimension | Score (1–5) | Evidence and defect / observation |
|---|---:|---|
| D1–D8 |  |  |
| **Total** | **/ 40** | **PASS / FAIL** |
```

## 4. Pre-merge UI checklist

- [ ] `npm run lint`, `npm run typecheck`, and `npm test` pass.
- [ ] The changed source was checked for new gradients/glows, thick accent borders, all-caps kickers, competing primary actions, blur chrome, mixed fonts, oversized radii/shadows, emoji, centered marketing copy, ad-hoc controls, micro-text, and gratuitous motion.
- [ ] Every affected route/dialog/state was captured and viewed in Playwright at `1440×900` and `390×844`, in both light and dark themes.
- [ ] The screenshot grade is at least `32/40`, with every touched dimension at least `4`; the evidence records all four artifacts.
- [ ] No horizontal overflow, clipped text, overlapping controls, or focus obscured by sticky bars appears at either viewport.
- [ ] Money uses shared display components, `tabular-nums`, right-aligned numeric columns, and non-color sign/icon cues.
- [ ] Keyboard Tab/Escape behavior, focus restoration, labels, status/alert announcements, and light/dark contrast were checked.
- [ ] Placeholder text is at least `4.5:1`, unfocused input boundaries are at least `3:1`, mobile controls are at least `44px` high, and every view (including empty states) has one primary action.
