# TODO

## Construction animation: new district unlock (0–15s)
- [ ] Inspect existing render loop + how to overlay construction animation on specific district.
- [ ] Create `lib/renderer/construction.ts` implementing Phase1-4 rendering (grid, crane, scaffolding + sparks, background fade, window flicker, animated border stroke, typewriter label, fireworks, and agent-facing overlay).
- [x] Update `lib/renderer.ts` to add `drawScaffolding(ctx, district, progress)` export used by `construction.ts`.
- [ ] Update `components/pixel-city.tsx` to listen for SSE `district.unlocked`, start animation for matching district, and implement skip-on-click to jump to Phase4.
- [ ] Update `components/open-stellar/open-stellar-hub.tsx` so the SSE listener includes `district.unlocked` and pauses agent simulation + sets agent directions toward the constructed district during animation.
- [ ] Run TypeScript typecheck / lint (as available) to ensure changes compile.

