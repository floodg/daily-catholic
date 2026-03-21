# Manual test: purchase inventory ingredient name resolution

Goal: Verify that purchases credit inventory against the canonical ingredient name so the shopping list correctly deducts stock.

Preconditions
- You can run the app locally with Supabase and have a test user.
- The migrations have been applied (including `20260316000006_fix_purchase_inventory_ingredient_name.sql`).

Steps
1) Ensure zero stock
   - Open the app Inventory page and confirm no stock for `beef mince`.
   - Or run SQL: `delete from public.inventory_transactions where user_id = <your_user_id> and lower(ingredient_name) = 'beef mince';`

2) Record a shopping trip with a linked product
   - In the app, add a shopping trip.
   - Add item from a meal/store product that links to starter content: select a product that represents Beef Mince (e.g. “Coles Beef Mince 500g”), quantity purchased: 1, pack unit: `g`, pack quantity: `500`.
   - Save.
   - Verify in DB (optional): the new row in `inventory_transactions` for your user should have `ingredient_name = 'beef mince'`, `quantity_delta = 500`, `unit = 'g'`, `transaction_type = 'purchase'`.

3) Consumption reduces stock
   - Plan a meal that uses 250g Beef Mince (e.g. Mince Taco Bowl).
   - Mark the meal as eaten.
   - Verify Inventory page shows `beef mince` with 250g remaining.

4) Shopping list deduction
   - Plan the same meal again (another 250g).
   - Open the Shopping List for next week.
   - Expected: `beef mince` does not appear (stock 250g meets demand 250g).
   - Mark a second taco bowl as eaten.
   - Expected: stock is now 0g and the shopping list shows `beef mince` with `toBuy = 250g`.

Fallback case (no product link)
- Add another shopping trip item manually that does not link a store product (leave product link unset), with product name “Cucumber”.
- Expected: `inventory_transactions.ingredient_name = 'Cucumber'` (fallback to product_name).

Notes
- Historical purchase transactions are not backfilled by this change; consider a one-off backfill if needed.

