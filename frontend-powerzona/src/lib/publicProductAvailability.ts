type PublicProductRecord = Record<string, any>;
type PublicVariationRecord = Record<string, any>;

function variationPublicPrice(variation: PublicVariationRecord) {
  const price = Number(variation?.price_usd ?? variation?.precio_usd ?? 0);
  const regularPrice = Number.isFinite(price) ? Math.max(0, price) : 0;
  const offerPrice = Number(variation?.offer_price_usd ?? 0);
  const validOffer = Boolean(variation?.is_offer) && offerPrice > 0 && offerPrice < regularPrice;
  return validOffer ? offerPrice : regularPrice;
}

export function addVariationPriceSummary(
  products: PublicProductRecord[],
  variations: PublicVariationRecord[],
) {
  const activePricesByProduct = new Map<string, number[]>();
  const availablePricesByProduct = new Map<string, number[]>();
  const activeCountByProduct = new Map<string, number>();
  const availableCountByProduct = new Map<string, number>();
  const availableStockByProduct = new Map<string, number>();
  const availablePreorderByProduct = new Map<string, boolean>();
  const publicLabelsByProduct = new Map<string, string[]>();
  const productsById = new Map(products.map((product) => [product.id, product]));

  variations.forEach((variation) => {
    if (!variation?.product || variation.active === false) return;
    activeCountByProduct.set(variation.product, (activeCountByProduct.get(variation.product) || 0) + 1);

    const price = variationPublicPrice(variation);
    if (price <= 0) return;
    const activePrices = activePricesByProduct.get(variation.product) || [];
    activePrices.push(price);
    activePricesByProduct.set(variation.product, activePrices);

    const label = [variation.variation_type, variation.value]
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(': ');
    if (label) {
      const labels = publicLabelsByProduct.get(variation.product) || [];
      if (!labels.includes(label)) labels.push(label);
      publicLabelsByProduct.set(variation.product, labels);
    }

    const product = productsById.get(variation.product);
    const tracksStock = product?.track_stock !== false;
    if (tracksStock && Number(variation.stock || 0) <= 0 && !variation.allow_preorder) return;

    availableCountByProduct.set(variation.product, (availableCountByProduct.get(variation.product) || 0) + 1);
    availableStockByProduct.set(
      variation.product,
      (availableStockByProduct.get(variation.product) || 0) + Math.max(0, Number(variation.stock || 0)),
    );
    if (variation.allow_preorder) availablePreorderByProduct.set(variation.product, true);
    const availablePrices = availablePricesByProduct.get(variation.product) || [];
    availablePrices.push(price);
    availablePricesByProduct.set(variation.product, availablePrices);
  });

  return products.flatMap((product) => {
    if (!product?.has_variations) return [product];

    const activeVariationCount = activeCountByProduct.get(product.id) || 0;
    const activePrices = activePricesByProduct.get(product.id) || [];
    if (activeVariationCount < 1 || activePrices.length < 1) return [];

    const availableVariationCount = availableCountByProduct.get(product.id) || 0;
    const availablePrices = availablePricesByProduct.get(product.id) || [];
    const variationPublicAvailable = availableVariationCount > 0 && availablePrices.length > 0;
    const displayedPrices = variationPublicAvailable ? availablePrices : activePrices;
    const variationPublicStock = availableStockByProduct.get(product.id) || 0;
    const variationPublicAllowPreorder = availablePreorderByProduct.get(product.id) === true;
    const minPrice = Math.min(...displayedPrices);
    const maxPrice = Math.max(...displayedPrices);
    const hasDifferentPrices = displayedPrices.some((price) => price !== minPrice);

    return [{
      ...product,
      variation_price_min_usd: minPrice,
      variation_price_max_usd: maxPrice,
      variation_price_count: displayedPrices.length,
      variation_active_count: activeVariationCount,
      variation_available_count: availableVariationCount,
      variation_public_available: variationPublicAvailable,
      variation_public_stock: variationPublicStock,
      variation_public_allow_preorder: variationPublicAllowPreorder,
      variation_public_labels: publicLabelsByProduct.get(product.id) || [],
      variation_has_different_prices: hasDifferentPrices,
      public_price_usd: minPrice,
      public_price_prefix: 'DESDE:',
    }];
  });
}
