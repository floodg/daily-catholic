# Product search cases

Expected normalizations:

- `Beef mince` → `Beef mince`
- `2kg beef mince` → `beef mince`
- `500 g beef mince` → `beef mince`
- `2 x 500g beef mince` → `beef mince`
- `1L milk` → `milk`

Expected variants:

- `beef mince` → `beef mince`, `minced beef`
- `minced beef` → `minced beef`, `beef mince`
