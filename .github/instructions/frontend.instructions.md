---
applyTo: "frontend/**"
---
- Feature-based: `src/modules/<role>/{pages,features,components,hooks,api}`; shared code in `src/shared`.
- Server state via TanStack Query; UI state via Zustand; forms via React Hook Form + Zod.
- Use `@/` alias, `cn()` from `@/shared/utils/cn`, design tokens from `styles/index.css`. No business logic in the UI.
