# CashFlow Planner design foundation

This document is the shared visual and interaction contract for the redesign. Use the tokens and primitives below so the app stays consistent in light and dark themes.

## Identity and theme

The interface should feel like a clear check register: paper surfaces, ink text, restrained blue controls, and green/red ledger meanings. Keep charts, borders, and motion quiet so the weekly balance and due dates stay prominent.

The theme contract is owned by `src/lib/theme.ts`:

- `<html>` starts with the `dark` class; dark mode is the default.
- `THEME_BOOT_SCRIPT` runs in `<head>` before first paint and removes `dark` only when `localStorage["cashflow-theme"]` is `"light"`.
- Settings owns the Appearance control (`settings-dark-mode`) and calls `applyTheme`. Do not add `next-themes`, another storage key, or a second theme provider.
- CSS tokens live in `src/app/globals.css`. Tailwind utilities and shadcn semantic tokens resolve against the current `:root` or `.dark` values.
- Both themes set `color-scheme`. Emerald remains the income/success color and rose remains the bill/error color in dark mode.

### Semantic color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#e9eeea` | `#121212` | App canvas |
| `foreground` | `#172a33` | `#e0e0e0` | Main text |
| `card` / `popover` | `#fbfcfa` | `#1c1c1c` | Raised paper surfaces |
| `primary` | `#2c49a6` | `#e0e0e0` | Primary action and focus ring |
| `primary-foreground` | `#ffffff` | `#121212` | Text on primary |
| `secondary` | `#f4f7f5` | `#181818` | Quiet controls |
| `muted` | `#e9eeea` | `#181818` | Subtle panels |
| `muted-foreground` | `#4b5d58` | `#888888` | Supporting text |
| `accent` | `#eef1fa` | `#262626` | Selected/hover surface |
| `destructive` | `#a82a20` | `#ee948a` | Destructive action/error |
| `border` / `input` | `#d8e1dc` | `#444444` | Dividers and control edges |
| `ring` | `#2c49a6` | `#e0e0e0` | Keyboard focus |

Use the extended palette (`brand-*`, `emerald-*`, `rose-*`, `slate-*`, `sheet`, `field`, and `highlight`) for established app-specific treatments. Dark remaps are defined centrally; avoid hard-coded light/dark color pairs in feature components.

## Type, spacing, and shape

- Use the self-hosted Archivo variable font from the root layout. Body text uses the default width; headings use the `font-semiwide` utility. Avoid adding a second font family for feature work.
- Use Tailwind's 4px spacing scale. A 16px gap is the usual field/group spacing; cards use 20px interior padding; page content uses 16px mobile gutters, 24px at `sm`, and 40px at `lg`.
- Use `rounded-chip` (4px) for compact labels, `rounded-control` (6px) for controls, `rounded-sheet` (8px) for cards, and `rounded-dialog` (12px) for dialogs and bottom sheets.
- Financial values use tabular numerals. Preserve the sign, currency, and negative-balance icon/label; do not communicate ledger meaning with color alone.

## Motion

- Keep color/focus transitions at 150ms and panel transitions at 200ms with an ease-out/ease-in-out curve. Use motion to confirm a direct user action; do not add ambient or looping animation.
- `prefers-reduced-motion: reduce` disables CSS transitions and animations. Motion components must also use `useReducedMotion` and render their settled value without movement.
- Use `AnimatedBalance` only for display. Its accessible text exposes the settled formatted amount; the rolling visual is hidden from assistive technology.

## Components

Prefer `@/components/ui/*` exports over one-off controls. The old high-level exports remain compatible with current feature components; standard shadcn building blocks are exported alongside them.

| Need | Component |
|---|---|
| Actions | `Button` from `ui/button`; variants: `primary`, `secondary`, `danger`, `success`, plus shadcn `default`, `outline`, `destructive`, `ghost`, `link`; sizes: legacy `sm`, `md`, `icon` and shadcn sizes |
| Status label | `Badge` from `ui/badge`; use `tone="neutral|positive|negative|info|warning"` or shadcn `variant` |
| Surface | `Card`, `CardHeader`, `CardBody`, and standard `CardContent`/`CardFooter` from `ui/card` |
| Existing form APIs | `Field`, `Input`, native-compatible `Select`, `Textarea`, `MoneyInput`, and controlled `Switch` from `ui/field` |
| New field composition | `FieldPrimitive`/`FieldRoot`, `FieldLabel`, `FieldDescription`, `FieldError`, and `FieldGroup` from `ui/field`, with standard `Input`, `Select`, `Textarea`, and Radix `Switch` from their own modules |
| Dialog | Use `Dialog` for the legacy controlled API; use `DialogRoot`, `DialogContent`, `DialogTitle`, and related parts for composable dialogs |
| Confirmation | `ConfirmDialog`; keep destructive confirmation explicit and show request errors inside the dialog |
| Loading/empty/error | `Skeleton`, `LoadingRegion`, `EmptyState`, `ErrorState`, and `InlineStatus` from their existing modules |
| Notification | Call `const toast = useToast()` then `toast(message, "success" | "error")`; the provider renders the token-styled Cult `HaloToast` through Sonner |
| Expand/collapse | Compose `Expandable`, `ExpandableTrigger`, `ExpandableContent`, and optional `ExpandableCard*` parts from `ui/expandable` |
| Side panel | Use `Sheet` for a side panel; use `Drawer` for bottom-anchored mobile content; existing `Dialog variant="drawer"` stays bottom-sheet on mobile and right-side on desktop |
| Table, tabs, menu, tooltip | Use the matching shadcn primitives under `ui/table`, `ui/tabs`, `ui/dropdown-menu`, and `ui/tooltip` |

### Animated balance example

```tsx
import { AnimatedBalance } from "@/components/ui/money";

<AnimatedBalance cents={balanceCents} currency="USD" className="text-2xl font-bold" />
```

Pass integer cents, as with `Balance`. The formatter comes from the existing `money` helper. Reduced-motion users see the static formatted value.

### Expandable example

```tsx
<Expandable>
  {({ isExpanded }) => (
    <>
      <ExpandableTrigger aria-label={isExpanded ? "Show less" : "Show more"}>
        Details
      </ExpandableTrigger>
      <ExpandableContent preset="fade">…</ExpandableContent>
    </>
  )}
</Expandable>
```

The trigger exposes `aria-expanded` and supports Enter/Space. Keep it keyboard reachable, use short content transitions, and do not rely on hover to make information available.

## Responsive layout and accessibility

- Breakpoints follow Tailwind defaults: mobile below `lg` (1024px), desktop sidebar at `lg` and above. The bottom navigation has five labelled links and safe-area padding; keep each target at least 44px high and wide.
- Keep the skip link, visible keyboard focus, semantic headings, explicit labels, and `aria-current="page"` on active navigation. Icon-only controls need an accessible name.
- Reflow content without page-level horizontal scrolling between 320px and 1440px. Tables may scroll inside their own labeled/contained region.
- Use `role="alert"` only for actionable errors and `role="status"` for nonurgent updates. Do not make color the only status signal.
- Every modal/sheet needs an accessible title, focus management, Escape behavior, and a clear close action. Keep focus rings visible in both themes.
