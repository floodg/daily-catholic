## generate-meal

User-triggered Edge Function that:

1. Accepts a free-text `prompt` and `store` (Coles / Woolworths / Aldi / IGA / Other)
2. Calls Gemini to generate a keto-friendly meal (name, tags, times, ingredients, instructions)
3. For each ingredient, looks up or AI-enriches a `store_products` row for the chosen store
4. Returns a draft meal with linked `primaryProduct` data for preview → confirm in the app

### Request

```http
POST /functions/v1/generate-meal
Authorization: Bearer <user-jwt>
Content-Type: application/json

{ "prompt": "keto chicken dinner for 2", "store": "Coles" }
```

### Response

```json
{
  "meal": {
    "name": "...",
    "tags": ["keto"],
    "prepTimeMins": 15,
    "cookTimeMins": 25,
    "instructions": ["..."],
    "ingredients": [
      {
        "name": "chicken thigh",
        "quantityNum": 500,
        "unit": "g",
        "quantity": "500g",
        "store": "Coles",
        "primaryProduct": {
          "id": "uuid",
          "name": "...",
          "brand": "...",
          "sizeLabel": "500g",
          "store": "Coles",
          "productUrl": "https://...",
          "imageUrl": "https://..."
        }
      }
    ]
  }
}
```

### Required secrets

```
GEMINI_API_KEY=...
ANTHROPIC_API_KEY=...   # meal + product fallback when Gemini quota/429
# optional
GEMINI_MODEL=gemini-2.0-flash
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided by the platform.

### Local serve

Put keys in project-root `.env`, then:

```
supabase functions serve --env-file .env
```

### Deploy

```
supabase functions deploy generate-meal --project-ref <your-project-ref>
```

### Client invoke

```ts
await supabase.functions.invoke('generate-meal', {
  body: { prompt, store },
})
```
