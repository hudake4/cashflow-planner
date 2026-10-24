# UI/UX and Anti-Slop Conventions

CashFlow Planner is an operate-mode financial tool, not a marketing site. It should feel like a high-craft check register: quiet paper surfaces, crisp ink hierarchy, tabular numerals, restrained ballpoint blue, and semantic ledger colors. These rules apply to new UI and to UI touched during a change.

The stable visual source of truth is [`src/app/globals.css`](../src/app/globals.css). It maps the `Archivo` font variable (`--font-archivo`, registered in [`src/app/layout.tsx`](../src/app/layout.tsx)) and defines the app's semantic colors, shape, typography, and dark-theme tokens.

## 1. Anti-slop catalogue

For every UI change, inspect the source diff and rendered screenshots. The code checks below are search targets, not permission to copy an existing violation. Some existing components are named as positive patterns to reuse when making related changes.

| ID | Don't | Detect in code | Detect in screenshots | Do instead |
|---|---|---|---|---|
| ST-01 | Purple, indigo, neon, or decorative gradients and glows | Search for new `bg-gradient-`, `from-indigo-`, `via-purple-`, and glow-shadow utilities. | Rainbow washes, neon borders, or glowing halos behind cards and text. | Use `bg-background`, `bg-card`, `bg-sheet`, `bg-muted`, `text-foreground`, `text-muted-foreground`, and `border-border`. Reserve `highlight` for the today marker in [`WeekRow`](../src/components/calendar/week-row.tsx) and intentional chart rendering. [`HaloToast`](../src/components/ui/halo-toast.tsx) uses a flat semantic top border for its status accent. |
| ST-02 | Thick colored accent borders on cards, chips, or rows | Search for new `border-l-[3px]`, `border-t-[3px]`, or similar rules. | Heavy vertical or top stripes that dominate a card or event. | Use a uniform `border border-border`, a domain icon or `+`/`−` sign, and a restrained semantic tint. [`EventChip`](../src/components/calendar/week-row.tsx) uses a uniform border with semantic income/bill tints. **D-18 narrow exception:** the dashboard forecast register may use one neutral double horizontal rule to separate its final accounting total from the running-total lines above it, only on the `RegisterLine` total row in [`DashboardView`](../src/components/dashboard/dashboard-view.tsx). The calendar [`WeekSummaryStrip`](../src/components/calendar/week-row.tsx) may use the same neutral treatment only on its `Closing` total because it is the final weekly accounting result after opening, income, bills, and net. These separators must not become decorative stripes or be reused on cards, chips, events, or ordinary rows. |
| ST-03 | Tracked-out all-caps eyebrow labels above headings | Search for `uppercase` paired with `tracking-wide` or `tracking-widest` on labels above headings. | Tiny spaced capitals floating above a title or dialog heading. | Use a sentence-case heading, subtext, or an inline [`Badge`](../src/components/ui/badge.tsx) for metadata. |
| ST-04 | Hero metric followed by three equal SaaS stat tiles | Search for new `clamp(` display sizes and `grid-cols-3` rows that create separate stat tiles. | An oversized number above three identical, airy boxes with weak connection to the register. | Keep related figures in a compact ledger summary or cohesive table with a clear reading order. The dashboard's [`SummaryMetric`](../src/components/dashboard/dashboard-view.tsx) rows form a divider-separated `<dl>`. |
| ST-05 | Card-in-card nesting and excessive boxing | Search for nested `<Card>` elements, repeated `rounded-sheet border`, or bordered boxes inside dialogs. | Concentric boxes with double borders and matching radii. | Use one [`Card`](../src/components/ui/card.tsx), `CardBody`, `space-y-*`, `divide-y`, `border-t`, or a flat `bg-muted` band. |
| ST-06 | Competing primary actions or decorative “AI magic” icons | Count visible `variant="primary"` and `bg-brand-600` actions. Search ordinary data actions for sparkle/wand icon imports or icon components. | Two or more solid primary buttons, or sparkle/wand icons in a financial workflow. | Use one primary action per view. Make `Refresh`, `Find recurring`, and `Load demo data` secondary or ghost actions with domain icons. |
| ST-07 | Glassmorphism on content surfaces | Search for new `backdrop-blur` or translucent content backgrounds. | Ledger text visibly bleeds through a header, card, or toolbar. | Use solid paper/ink surfaces and `border-border`. [`AppShell`](../src/components/app-shell.tsx) uses solid `bg-background` and `bg-sheet` chrome; limit blur to modal/backdrop behavior. |
| ST-08 | Mixed or decorative font stacks and monospace labels | Search for new font imports and `font-mono`; the SimpleFIN setup token in [`InstitutionsView`](../src/components/institutions/institutions-view.tsx) is the existing technical-text exception. | Generic mixed typography or fake terminal labels for dates and badges. | Use the self-hosted `Archivo` family, `font-semiwide` for headings and totals, and `font-narrow` only when dense calendar chips genuinely need it. |
| ST-09 | Uniform large radii and soft shadows on resting cards | Flag new `rounded-xl`/larger radii or `shadow-md`/`shadow-lg` on resting cards. The [`Card`](../src/components/ui/card.tsx) wrapper uses `rounded-sheet` and `shadow-none`; floating overlays may use shadows. | Puffy cards floating on gray clouds instead of flat register pages. | Use `rounded-chip` for compact metadata, `rounded-control` for controls, `rounded-sheet` for cards, and `rounded-dialog` for dialogs. Keep nested radii concentric. |
| ST-10 | Emoji icons or mismatched icon strokes | Search JSX for Unicode emoji and use of icon sets other than `lucide-react`. | Platform-dependent colored emoji or inconsistent icon weights. | Use one `lucide-react` outline icon set, normally with `aria-hidden="true"` when text already names the action. |
| ST-11 | Centered-everything and marketing copy in workspace screens | Flag `text-center` on multi-line workspace prose and hype words such as `Seamless`, `Supercharge`, or `AI-powered`. Centered [`EmptyState`](../src/components/ui/states.tsx) content is an intentional exception. | Centered paragraphs, slogans, or apologetic “Oops!” errors. | Left-align headings and prose, right-align numeric columns, and write plain factual check-register copy. |
| ST-12 | Ad-hoc control styles and token drift | Search for raw control markup outside shared primitives and hand-rolled button-like link classes. | Adjacent controls have different heights, padding, radii, or focus rings. | Use shared `Button`, `Field`, `Card`, `Dialog`, `Badge`, and `Table` primitives. Use [`Button asChild`](../src/components/dashboard/dashboard-view.tsx) for navigation styled as a button. |
| ST-13 | Micro-text and cramped mobile targets | Search for new `text-[10px]`, `text-[11px]`, or interactive controls without `min-h-11`/`min-w-11` where touch sizing is required. Review compact labels in [`WeekRow`](../src/components/calendar/week-row.tsx) and the dashboard date badge in [`DashboardView`](../src/components/dashboard/dashboard-view.tsx) when touched. | Labels require squinting, mobile actions are hard to tap, or text is truncated without disclosure. | Use `text-sm`/`text-base` for body and controls, `text-xs` for secondary metadata (including [`AppShell`](../src/components/app-shell.tsx) mobile navigation), `text-base sm:text-sm` for mobile inputs, and at least `44×44px` mobile targets (`min-h-11`/`min-w-11`). Compact controls—including switches, icon buttons, and dialog close buttons—must keep that full mobile hit area while their visual geometry may return to compact sizing at `sm+`. |
| ST-14 | Gratuitous motion, bounce, and catch-all transitions | Search for new `transition-all`, page-load entrance sequences, bounce springs, or `animate-pulse` outside [`Skeleton`](../src/components/ui/skeleton.tsx). | Pages slide or bounce into place, or hover/press causes layout jitter. | Use `transition-colors` around `150ms`, `150–200ms` ease-out for panels and disclosure, and honor reduced motion through [`AnimatedBalance`](../src/components/ui/money.tsx) and the global reduced-motion rule. |

## 2. Behavioral and accessibility deltas

Use [`DESIGN.md`](../DESIGN.md) for the base theme, tokens, typography, spacing, motion, responsive layout, and shared component exports. This section records finance-specific behavior and accessibility requirements for touched UI.

### Financial behavior and states

- Keep amounts in integer cents and use the existing money formatting path. Show signs and labels alongside color; skipped events use muted text, strikethrough, and explicit `Skipped` copy.
- Never imply that projections are live bank balances. Distinguish entered projections from read-only SimpleFIN snapshots. State errors plainly with a recovery path.
- Data views and async controls need loading, empty, error, partial/out-of-window, and success states where applicable. Calendar views must explain `Before projection start`, `Beyond 12-month forecast limit`, and partial weeks when those states occur.
- Keep one primary action per view, including empty states. Name actions for their result and use sentence case and active voice.

### Accessibility deltas

- Meet WCAG 2.2 AA contrast: normal and placeholder text at least `4.5:1`; large text, unfocused field/control boundaries, and focus indicators at least `3:1` in both themes.
- Mobile controls need a `44×44px` hit area; compact switches, icon buttons, and dialog close buttons retain it even when their visual geometry is smaller. Desktop pointer targets need at least `24×24px` with adequate spacing. Sticky bars and dialog footers must not obscure focus.
- Keep `aria-invalid` and `aria-describedby` connected for field errors. Controlled dialogs restore focus to their opener or a connected fallback when the opener is unmounted.
- **D-19 inline-link exception:** inline text links may use the WCAG 2.5.8 inline-text-link exception when they remain within a sentence or text block and are not standalone controls; standalone action links still need the target-size rule.
- Charts need a readable summary and an expandable table alternative. Never rely on color alone for money direction, negative balances, or status.

## 3. Screenshot grading rubric

Code-only review does not satisfy a UI acceptance criterion. For every changed route, dialog, or state, capture and view real Playwright screenshots at both required viewports and both themes:

- Desktop Light: `1440×900`
- Desktop Dark: `1440×900`
- Mobile Light: `390×844`
- Mobile Dark: `390×844`

Dark is the default theme. Set `localStorage["cashflow-theme"] = "light"` for light screenshots; the storage key is defined in [`src/lib/theme.ts`](../src/lib/theme.ts). Cover the affected state, including loading, empty, error, negative, partial, or expanded states when applicable. For a full UI audit, cover `/`, `/calendar`, `/spending`, `/bills`, `/income`, `/institutions`, `/institutions/[id]`, and `/settings`.

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
