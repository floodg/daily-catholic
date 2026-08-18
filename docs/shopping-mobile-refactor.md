# Shopping List mobile performance refactor

The Shopping List previously waited for multiple sequential ingredient and product preference lookups before clearing its loading state. On slower mobile connections this made trip items appear much later than the trip data itself.

The fast implementation changes the critical path:

- Shopping trips, purchased items and pending items load concurrently with `Promise.all`.
- The initial list uses shopping-trip data directly and renders as soon as those three core requests complete.
- Ingredient/product alternative lookups are removed from initial render.
- Product alternatives are fetched only when the user opens **Swap Product**.
- Purchase, delete and unmark actions update local state immediately rather than forcing a complete expensive list regeneration.
- Realtime planned-meal changes use a lightweight refresh of the three core data sets.

This keeps the existing Shopping List feature set while moving non-critical enrichment out of the mobile first-render path.
