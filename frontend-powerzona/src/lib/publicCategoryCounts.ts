type ProductTaxonomy = { id: string; category: string; subcategory: string };
type PublicSubcategory = { id: string; category: string };

// Input products have already passed the public backend filters. Input
// subcategories are the same visible records used by the category navigation.
// A subcategory takes precedence over a product's direct category, as before.
export function buildPublicCategoryCounts(
  products: ProductTaxonomy[],
  subcategories: PublicSubcategory[],
): Map<string, number> {
  const parentsBySubcategory = new Map<string, Set<string>>();
  for (const subcategory of subcategories) {
    const parents = parentsBySubcategory.get(subcategory.id) || new Set<string>();
    parents.add(subcategory.category);
    parentsBySubcategory.set(subcategory.id, parents);
  }
  const idsByCategory = new Map<string, Set<string>>();
  for (const product of products) {
    const parents = product.subcategory
      ? parentsBySubcategory.get(product.subcategory) || []
      : [product.category];
    for (const categoryId of parents) {
      const ids = idsByCategory.get(categoryId) || new Set<string>();
      ids.add(product.id);
      idsByCategory.set(categoryId, ids);
    }
  }
  return new Map([...idsByCategory].map(([id, products]) => [id, products.size]));
}
