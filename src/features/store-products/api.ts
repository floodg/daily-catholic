import { supabase } from '../../lib/supabase';
import type { StoreProduct } from '../../domain/types';

// ─── DB row shape ─────────────────────────────────────────────────────────────

interface DbStoreProduct {
  id: string;
  name: string;
  brand: string | null;
  size_label: string | null;
  store: string;
  product_url: string;
  image_url: string | null;
  created_at: string;
}

// ─── Mapper ───────────────────────────────────────────────────────────────────

function dbToDomain(row: DbStoreProduct): StoreProduct {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand ?? undefined,
    sizeLabel: row.size_label ?? undefined,
    store: row.store,
    productUrl: row.product_url,
    imageUrl: row.image_url ?? undefined,
    createdAt: row.created_at,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getStoreProducts(): Promise<StoreProduct[]> {
  const { data, error } = await supabase
    .from('store_products')
    .select('*')
    .not('product_url', 'is', null)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data as DbStoreProduct[]).map(dbToDomain);
}

export async function createStoreProduct(
  product: Omit<StoreProduct, 'id' | 'createdAt'>
): Promise<StoreProduct> {
  const { data, error } = await supabase
    .from('store_products')
    .insert({
      name: product.name,
      brand: product.brand ?? null,
      size_label: product.sizeLabel ?? null,
      store: product.store,
      product_url: product.productUrl,
      image_url: product.imageUrl ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return dbToDomain(data as DbStoreProduct);
}

export async function updateStoreProduct(
  product: StoreProduct
): Promise<StoreProduct> {
  const { data, error } = await supabase
    .from('store_products')
    .update({
      name: product.name,
      brand: product.brand ?? null,
      size_label: product.sizeLabel ?? null,
      store: product.store,
      product_url: product.productUrl,
      image_url: product.imageUrl ?? null,
    })
    .eq('id', product.id)
    .select()
    .single();

  if (error) throw error;
  return dbToDomain(data as DbStoreProduct);
}

export async function deleteStoreProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('store_products')
    .delete()
    .eq('id', id);

  if (error) throw error;
}
