## find-store-products

User-triggered Edge Function that finds several store product matches for a single catalog ingredient.

1. Accepts `ingredientName` and `store` (Coles / Woolworths / Aldi / IGA / Other)
2. Looks up existing `store_products` matches for that store
3. Asks Gemini (fallback Claude) for additional real product listings
4. Persists any new products, then returns a selectable list for the UI

### Request

```http
POST /functions/v1/find-store-products
Authorization: Bearer <user-jwt>
Content-Type: application/json

{ "ingredientName": "Sugar-free caramel topping", "store": "Coles" }
```

### Response

```json
{
  "products": [
    {
      "id": "uuid",
      "name": "...",
      "brand": "...",
      "sizeLabel": "375g",
      "store": "Coles",
      "productUrl": "https://...",
      "imageUrl": "https://..."
    }
  ]
}
```

### Required secrets

```
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...
# optional
GEMINI_MODEL=gemini-2.0-flash
```

### Deploy

```
supabase functions deploy find-store-products --project-ref <your-project-ref>
```

### Client invoke

```ts
await supabase.functions.invoke('find-store-products', {
  body: { ingredientName, store },
})
```
