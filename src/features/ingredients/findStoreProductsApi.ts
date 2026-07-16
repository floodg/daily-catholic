import { supabase } from '../../lib/supabase';
import type { StoreProduct } from '../../domain/types';

interface ApiProduct {
  id: string;
  name: string;
  brand?: string;
  sizeLabel?: string;
  store: string;
  productUrl: string | null;
  imageUrl?: string;
}

function mapProduct(p: ApiProduct): StoreProduct {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    sizeLabel: p.sizeLabel,
    store: p.store,
    productUrl: p.productUrl,
    imageUrl: p.imageUrl,
    createdAt: new Date().toISOString(),
  };
}

async function getAccessToken(): Promise<string> {
  // Validate against the auth server (also refreshes if needed).
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error('Session expired. Sign out and sign back in, then try again.');
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  const token =
    refreshed.session?.access_token ??
    (await supabase.auth.getSession()).data.session?.access_token;

  if (!token) {
    throw new Error('Session expired. Sign out and sign back in, then try again.');
  }
  return token;
}

/** Ask AI (+ catalog cache) for store product matches for an ingredient. */
export async function findStoreProducts(
  ingredientName: string,
  store: string,
): Promise<StoreProduct[]> {
  const accessToken = await getAccessToken();
  const baseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  // Use fetch directly so Authorization is always the user JWT.
  // supabase.functions.invoke can fall back to the anon key (no `sub` claim)
  // when the session isn't attached to the Functions client's fetch layer.
  const response = await fetch(`${baseUrl}/functions/v1/find-store-products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ ingredientName, store }),
  });

  let payload: { products?: ApiProduct[]; error?: string } | null = null;
  try {
    payload = await response.json() as { products?: ApiProduct[]; error?: string };
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message = payload?.error || `Failed to find products (${response.status})`;
    if (response.status === 401 || /unauthorized|jwt|sign in/i.test(message)) {
      throw new Error('Session expired. Sign out and sign back in, then try again.');
    }
    if (response.status === 502 || response.status === 503) {
      throw new Error(
        'Product search is unavailable right now. Make sure local edge functions are running (`supabase functions serve`), then try again.',
      );
    }
    throw new Error(message);
  }

  if (payload?.error) {
    throw new Error(payload.error);
  }

  return (payload?.products ?? []).map(mapProduct);
}
