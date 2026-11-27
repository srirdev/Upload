# UpLOAD design system

One brand across four portals: vibrant, confident consumer-tech (quick-commerce energy), never a plain
dashboard template. Tokens live in `frontend/src/styles/index.css`; components in `frontend/src/shared/components/`.

## Brand
- **Colour roles**: electric purple `primary` leads (primary actions, active states); `orange` is the energetic
  accent (secondary CTAs, "in progress"); `sun` yellow highlights (offers, attention); `mint` is success/live;
  `navy` is ink; `canvas` (soft lavender) is the page; `background` (white) is cards and inputs.
- **Text contrast** (checked, WCAG AA): use `text-navy`, `text-ink-2`, `text-muted`, `text-primary`,
  `text-orange-ink`, `text-sun-ink`, `text-success`, `text-danger` for text. Never `text-orange`/`text-sun`/`text-mint`
  on light surfaces. On `bg-orange`, `bg-sun`, `bg-mint` fills, text is **navy**; on `bg-primary`, `bg-brand`,
  `bg-midnight`, `bg-navy` it is **white**.
- **Gradients** (`bg-brand`, `bg-sunrise`, `bg-midnight`, `bg-mintfresh`): one hero surface per screen.
- **Type**: `font-display` (Bricolage Grotesque) for headings and big numbers; Inter for everything else.
- **Shape**: cards `rounded-3xl`, controls `rounded-2xl`, pills `rounded-full`. Shadows: `shadow-soft` (resting),
  `shadow-lift` (raised/hover), `shadow-glow` (primary button).
- **Portal accents**: student = purple `bg-brand`; rider = `bg-midnight` + orange; shop = `bg-sunrise`; admin = `bg-midnight` command centre.

## Components (use these; don't re-invent)
| Need | Component |
|---|---|
| Buttons | `ui/button` variants: `default` (one per screen), `accent`, `success`, `dark`, `soft`, `outline`, `ghost`, `danger`, `danger-soft`, `white`/`glass` (on heroes) |
| Inputs | `ui/input` (`icon`, `trailing`), `ui/fields` (`Select`, `Textarea`, `FormField`, `Segmented`, `Switch`) |
| Surfaces | `ui/card` (`Card tone=…`, `SectionHeader`, `PageHeader`) |
| Status | `ui/badge` (`Badge`, `StatusPill kind=new/progress/waiting/done/problem/cancelled` — always icon + label, `live` pulse), `IconTile`, `Avatar` |
| Navigation | `app/layouts/shells` (`MobileShell` with `fab`/`topRight`; `SidebarShell` with `headerRight`, nav `badge`), `ui/tabs` (`Tabs`, `ChipFilter`) |
| Overlays | `ui/dialog` (`Modal` = bottom sheet on phones; `Drawer` for detail panels) |
| Feedback | `ui/toast` (`toast.success`, `toastError(e)`), `ui/states` (`Skeleton`, `ListSkeleton`, `DashboardSkeleton`, `EmptyState art=…`, `ErrorState onRetry`) |
| Progress | `ui/progress` (`ProgressSteps` horizontal/vertical), `ui/upload` (`Dropzone`, `UploadProgress`) + `apiUpload` (real upload progress) |
| Codes & photos | `ui/otp` (`OtpInput`, `CodeDisplay`), `ui/camera` (`CameraCapture`) |
| Data viz | `ui/charts` (`ChartCard` + `TrendChart`/`BarsChart`/`DonutChart`, `Sparkline`, `byDay`), `ui/stat` (`StatTile`, `Meter`, `compact`) |
| Maps | `map` (`MapView` lazy Leaflet, `coords()` parser) |
| Motion | `ui/motion` (`FadeIn`, `Stagger`/`StaggerItem`); shells animate page changes |
| Illustrations | `illustrations` (hero, category and empty-state art) |

## Rules
- **Real data only.** Every number, chart and list comes from the API. No invented metrics or sample orders;
  when there is no data, show a designed `EmptyState`. Marketing copy may describe real features only.
- **Charts** follow `ui/charts`: fixed validated series order, legend for 2+ series, table view, thin marks, no dual axes.
- **Every state designed**: loading skeleton shaped like the content, empty state with art and a next step, error with retry.
- **Every visible control works**; mutations give feedback (toast or inline) and disable while pending.
- **Motion** is purposeful (entrances, state changes, progress); `MotionConfig reducedMotion="user"` is global.
- **Responsive**: student/rider mobile-first (bottom nav, thumb-reach actions); shop/admin desktop-first (sidebar,
  data-dense tables that collapse to cards on phones).
- **Accessibility**: labelled controls, status never colour-alone, focus rings intact, 44px touch targets.
