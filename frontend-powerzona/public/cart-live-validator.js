(function () {
  if (window.PZCartLiveValidator) return;

  const CACHE_TTL_MS = 12000;
  const INVALID_STATUSES = new Set(['out_of_stock', 'unavailable', 'variation_unavailable']);
  let activeValidationPromise = null;
  let lastFingerprint = '';
  let lastValidatedAt = 0;
  let lastResult = null;

  function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function relationId(value) {
    if (Array.isArray(value)) return relationId(value[0]);
    if (value && typeof value === 'object') return String(value.id || '').trim();
    return String(value || '').trim();
  }

  function firstExpanded(value) {
    return Array.isArray(value) ? value[0] : value;
  }

  function firstFile(value) {
    if (Array.isArray(value)) return String(value[0] || '').trim();
    return String(value || '').trim();
  }

  function cleanBaseUrl(value) {
    return String(value || '').replace(/\/$/, '');
  }

  function getPocketBaseUrl(options = {}) {
    return cleanBaseUrl(options.pocketbaseUrl || window.PZ_POCKETBASE_URL || '');
  }

  function getCurrentStoreId(options = {}) {
    return String(options.currentStoreId || window.PZ_CURRENT_STORE_ID || '').trim();
  }

  function pricesEqual(left, right) {
    return Math.abs(number(left) - number(right)) < 0.005;
  }

  function valuesEqual(left, right) {
    if (typeof left === 'boolean' || typeof right === 'boolean') return Boolean(left) === Boolean(right);
    if (typeof left === 'number' || typeof right === 'number') return number(left) === number(right);
    return String(left || '') === String(right || '');
  }

  function normalizeItemQuantity(value) {
    return Math.max(1, Math.floor(number(value, 1)));
  }

  function formatUSD(value) {
    return `$${number(value).toFixed(2)} USD`;
  }

  function itemTitle(item) {
    return String(item?.title || item?.name || 'Producto').trim() || 'Producto';
  }

  function getItemKey(item) {
    if (item?.is_gift) return `gift::${item.gift_id || item.id}`;
    return item?.variation_id ? `${item.id}::${item.variation_id}` : String(item?.id || item?.title || '');
  }

  function isGiftItem(item) {
    return Boolean(item?.is_gift || item?.gift_id || item?.gift || String(item?.id || '').startsWith('gift-'));
  }

  function getCartFingerprint(cart) {
    return JSON.stringify((Array.isArray(cart) ? cart : []).map((item) => ({
      id: item?.id || '',
      variation_id: item?.variation_id || '',
      quantity: normalizeItemQuantity(item?.quantity || 1),
      price: number(item?.price || 0),
      stock: number(item?.stock || 0),
      store_id: item?.store_id || '',
      status: item?.cart_validation_status || '',
      gift: isGiftItem(item),
    })));
  }

  function fileUrl(collection, record, fieldName, options = {}) {
    const baseUrl = getPocketBaseUrl(options);
    const filename = firstFile(record?.[fieldName]);
    if (!baseUrl || !record?.id || !filename) return '';
    return `${baseUrl}/api/files/${encodeURIComponent(collection)}/${encodeURIComponent(record.id)}/${encodeURIComponent(filename)}`;
  }

  async function fetchRecord(collection, recordId, options = {}) {
    const baseUrl = getPocketBaseUrl(options);
    const id = String(recordId || '').trim();
    if (!baseUrl || !id) return null;
    const params = new URLSearchParams();
    if (options.expand) params.set('expand', options.expand);
    const query = params.toString();
    const response = await fetch(`${baseUrl}/api/collections/${encodeURIComponent(collection)}/records/${encodeURIComponent(id)}${query ? `?${query}` : ''}`);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error('No se pudo actualizar el carrito con la tienda.');
    }
    return response.json();
  }

  function productStoreMatches(product, currentStoreId) {
    const productStoreId = relationId(product?.store || product?.store_id);
    return !(currentStoreId && productStoreId && productStoreId !== currentStoreId);
  }

  function itemStoreMatches(item, currentStoreId) {
    const itemStoreId = relationId(item?.store_id || item?.store);
    return !(currentStoreId && itemStoreId && itemStoreId !== currentStoreId);
  }

  function productIsPublic(product, currentStoreId) {
    if (!product) return false;
    if (product.active === false) return false;
    if (!productStoreMatches(product, currentStoreId)) return false;
    const category = firstExpanded(product.expand?.category);
    const subcategory = firstExpanded(product.expand?.subcategory);
    if (product.category && category && category.active === false) return false;
    if (product.subcategory && subcategory && subcategory.active === false) return false;
    return true;
  }

  function getProductPrice(product) {
    const basePrice = Math.max(0, number(product?.base_price_usd || product?.public_price_usd || 0));
    const regularPrice = Math.max(0, number(product?.regular_price_usd || basePrice || 0));
    const offerPrice = Math.max(0, number(product?.offer_price_usd || 0));
    const activePrice = product?.is_offer === true && offerPrice > 0 ? offerPrice : basePrice;
    const displayRegularPrice = regularPrice > 0 ? regularPrice : activePrice;
    const isOffer = activePrice > 0 && displayRegularPrice > activePrice;
    return {
      activePrice,
      regularPrice: displayRegularPrice,
      isOffer,
      savings: isOffer ? displayRegularPrice - activePrice : 0,
    };
  }

  function getVariationPrice(product, variation) {
    const regularPrice = Math.max(0, number(variation?.price_usd ?? variation?.precio_usd ?? product?.base_price_usd ?? 0));
    const offerPrice = Math.max(0, number(variation?.offer_price_usd || 0));
    const activePrice = variation?.is_offer === true && offerPrice > 0 ? offerPrice : regularPrice;
    const displayRegularPrice = regularPrice > 0 ? regularPrice : activePrice;
    const isOffer = activePrice > 0 && displayRegularPrice > activePrice;
    return {
      activePrice,
      regularPrice: displayRegularPrice,
      isOffer,
      savings: isOffer ? displayRegularPrice - activePrice : 0,
    };
  }

  function productImage(product, options = {}) {
    return fileUrl('products', product, 'images', options);
  }

  function variationImage(variation, options = {}) {
    return fileUrl('product_variations', variation, 'image', options);
  }

  function variationLabel(variation) {
    return [variation?.variation_type, variation?.value].map((part) => String(part || '').trim()).filter(Boolean).join(': ')
      || String(variation?.name || variation?.label || '').trim();
  }

  function changedField(target, field, value, flags, options = {}) {
    const current = target[field];
    const isPriceField = options.price === true;
    const changed = isPriceField ? !pricesEqual(current, value) : !valuesEqual(current, value);
    target[field] = value;
    if (changed) {
      flags.changed = true;
      if (options.review) flags.requiresReview = true;
      if (options.rules) flags.rulesChanged = true;
      if (options.stock) flags.stockChanged = true;
    }
    return changed;
  }

  function addMessage(messages, message) {
    const clean = String(message || '').trim();
    if (clean && !messages.includes(clean)) messages.push(clean);
  }

  function unavailableItem(item, status, message, reason, options, flags) {
    const next = {
      ...item,
      stock: 0,
      preorder: false,
      cart_validation_status: status,
      cart_validation_reason: reason || status,
      cart_validation_message: message,
      cart_validation_messages: [message],
      cart_last_validated_at: new Date().toISOString(),
      store_id: item?.store_id || getCurrentStoreId(options),
    };
    flags.changed = true;
    flags.requiresReview = true;
    flags.availabilityChanged = true;
    addMessage(flags.messages, message);
    return next;
  }

  function finishValidItem(next, messages, flags, priceInfo) {
    const status = flags.itemQuantityAdjusted ? 'quantity_adjusted' : flags.itemPriceChanged ? 'price_changed' : 'ok';
    next.cart_validation_status = status;
    next.cart_validation_reason = status;
    next.cart_validation_message = messages[0] || '';
    next.cart_validation_messages = messages;
    next.cart_current_price_usd = number(priceInfo?.current || next.price || 0);
    if (priceInfo?.previous !== undefined) next.cart_previous_price_usd = number(priceInfo.previous || 0);
    next.cart_last_validated_at = new Date().toISOString();
    return next;
  }

  function updatePrice(next, priceInfo, messages, flags) {
    const previousPrice = number(next.price || 0);
    const hadOffer = Boolean(next.is_offer);
    const priceChanged = changedField(next, 'price', priceInfo.activePrice, flags, { price: true, review: true });
    if (next.variation_id || Object.prototype.hasOwnProperty.call(next, 'variation_price_usd')) {
      changedField(next, 'variation_price_usd', priceInfo.activePrice, flags, { price: true });
    }
    changedField(next, 'regular_price_usd', priceInfo.regularPrice, flags, { price: true });
    changedField(next, 'is_offer', priceInfo.isOffer, flags, { review: hadOffer !== priceInfo.isOffer });
    changedField(next, 'savings_usd', priceInfo.savings, flags, { price: true });

    if (priceChanged) {
      flags.priceChanged = true;
      flags.itemPriceChanged = true;
      next.cart_previous_price_usd = previousPrice;
      next.cart_current_price_usd = priceInfo.activePrice;
      addMessage(messages, `Precio actualizado: ${itemTitle(next)} cambio de ${formatUSD(previousPrice)} a ${formatUSD(priceInfo.activePrice)}.`);
      addMessage(flags.messages, `${itemTitle(next)} cambio de ${formatUSD(previousPrice)} a ${formatUSD(priceInfo.activePrice)}.`);
    }

    if (!hadOffer && priceInfo.isOffer) {
      flags.priceChanged = true;
      flags.itemPriceChanged = true;
      addMessage(messages, `Nueva oferta aplicada a ${itemTitle(next)}.`);
      addMessage(flags.messages, `Nueva oferta aplicada a ${itemTitle(next)}.`);
    }

    if (hadOffer && !priceInfo.isOffer) {
      flags.priceChanged = true;
      flags.itemPriceChanged = true;
      addMessage(messages, `La oferta de ${itemTitle(next)} termino.`);
      addMessage(flags.messages, `La oferta de ${itemTitle(next)} termino.`);
    }
  }

  function updateQuantityByStock(next, stock, tracksStock, preorder, messages, flags) {
    const quantity = normalizeItemQuantity(next.quantity || 1);
    next.quantity = quantity;
    if (!tracksStock || preorder || stock <= 0 || quantity <= stock) return;
    next.quantity = stock;
    flags.changed = true;
    flags.requiresReview = true;
    flags.quantityAdjusted = true;
    flags.itemQuantityAdjusted = true;
    addMessage(messages, `Cantidad ajustada a ${stock} por stock disponible.`);
    addMessage(flags.messages, `${itemTitle(next)}: cantidad ajustada a ${stock} por stock disponible.`);
  }

  async function validateProductItem(item, options, flags) {
    const currentStoreId = getCurrentStoreId(options);
    if (!itemStoreMatches(item, currentStoreId)) {
      return unavailableItem(item, 'unavailable', `${itemTitle(item)} ya no esta disponible.`, 'store_mismatch', options, flags);
    }

    const product = await fetchRecord('products', item.id, { ...options, expand: 'category,subcategory' });
    if (!product || !productIsPublic(product, currentStoreId)) {
      return unavailableItem(item, 'unavailable', `${itemTitle(item)} ya no esta disponible.`, 'product_unavailable', options, flags);
    }

    if (!item.variation_id && product.has_variations === true) {
      return unavailableItem(item, 'variation_unavailable', 'Variacion no disponible.', 'variation_required', options, flags);
    }

    const next = { ...item };
    const messages = [];
    flags.itemPriceChanged = false;
    flags.itemQuantityAdjusted = false;

    changedField(next, 'title', product.name || itemTitle(item), flags);
    changedField(next, 'category', relationId(product.category), flags, { rules: true });
    changedField(next, 'subcategory', relationId(product.subcategory), flags, { rules: true });
    changedField(next, 'only_usd', Boolean(product.only_usd), flags, { rules: true, review: Boolean(next.only_usd) !== Boolean(product.only_usd) });
    changedField(next, 'delivery_mode', product.delivery_mode || 'both', flags, { rules: true, review: String(next.delivery_mode || '') !== String(product.delivery_mode || 'both') });
    const tracksStock = product.track_stock !== false;
    const stock = Math.max(0, number(product.stock || 0));
    const allowPreorder = Boolean(product.allow_preorder);
    const preorder = tracksStock && stock <= 0 && allowPreorder;
    changedField(next, 'track_stock', tracksStock, flags, { rules: true });
    changedField(next, 'stock', stock, flags, { stock: true });
    changedField(next, 'preorder', preorder, flags, { rules: true });
    changedField(next, 'allow_preorder', allowPreorder, flags, { rules: true });
    const image = productImage(product, options);
    if (image) changedField(next, 'image', image, flags);
    changedField(next, 'cost_usd', number(product.cost_usd || 0), flags, { price: true });

    const priceInfo = getProductPrice(product);
    updatePrice(next, priceInfo, messages, flags);

    if (tracksStock && stock <= 0 && !preorder) {
      return unavailableItem(next, 'out_of_stock', `${itemTitle(next)} esta agotado.`, 'out_of_stock', options, flags);
    }

    updateQuantityByStock(next, stock, tracksStock, preorder, messages, flags);
    return finishValidItem(next, messages, flags, { current: priceInfo.activePrice, previous: next.cart_previous_price_usd });
  }

  async function validateVariationItem(item, options, flags) {
    const currentStoreId = getCurrentStoreId(options);
    if (!itemStoreMatches(item, currentStoreId)) {
      return unavailableItem(item, 'unavailable', `${itemTitle(item)} ya no esta disponible.`, 'store_mismatch', options, flags);
    }

    const product = await fetchRecord('products', item.id, { ...options, expand: 'category,subcategory' });
    if (!product || !productIsPublic(product, currentStoreId)) {
      return unavailableItem(item, 'unavailable', `${itemTitle(item)} ya no esta disponible.`, 'product_unavailable', options, flags);
    }

    const variation = await fetchRecord('product_variations', item.variation_id, options);
    if (!variation || variation.active === false || relationId(variation.product) !== String(product.id || '')) {
      return unavailableItem(item, 'variation_unavailable', 'Variacion no disponible.', 'variation_unavailable', options, flags);
    }

    const next = { ...item };
    const messages = [];
    flags.itemPriceChanged = false;
    flags.itemQuantityAdjusted = false;

    changedField(next, 'title', product.name || itemTitle(item), flags);
    changedField(next, 'category', relationId(product.category), flags, { rules: true });
    changedField(next, 'subcategory', relationId(product.subcategory), flags, { rules: true });
    changedField(next, 'only_usd', Boolean(product.only_usd), flags, { rules: true, review: Boolean(next.only_usd) !== Boolean(product.only_usd) });
    changedField(next, 'delivery_mode', product.delivery_mode || 'both', flags, { rules: true, review: String(next.delivery_mode || '') !== String(product.delivery_mode || 'both') });
    const label = variationLabel(variation);
    if (label) {
      changedField(next, 'variation_label', label, flags);
      changedField(next, 'variation_name', label, flags);
    }
    changedField(next, 'variation_ref', variation.ref || variation.internal_ref || variation.sku || '', flags);
    const image = variationImage(variation, options) || productImage(product, options);
    if (image) changedField(next, 'image', image, flags);

    const tracksStock = product.track_stock !== false;
    const stock = Math.max(0, number(variation.stock || 0));
    const allowPreorder = Boolean(variation.allow_preorder);
    const preorder = tracksStock && stock <= 0 && allowPreorder;
    changedField(next, 'track_stock', tracksStock, flags, { rules: true });
    changedField(next, 'stock', stock, flags, { stock: true });
    changedField(next, 'preorder', preorder, flags, { rules: true });
    changedField(next, 'allow_preorder', allowPreorder, flags, { rules: true });
    changedField(next, 'cost_usd', number(variation.cost_usd || 0), flags, { price: true });
    changedField(next, 'variation_cost_usd', number(variation.cost_usd || 0), flags, { price: true });

    const priceInfo = getVariationPrice(product, variation);
    updatePrice(next, priceInfo, messages, flags);

    if (tracksStock && stock <= 0 && !preorder) {
      return unavailableItem(next, 'variation_unavailable', 'Variacion agotada.', 'variation_out_of_stock', options, flags);
    }

    updateQuantityByStock(next, stock, tracksStock, preorder, messages, flags);
    return finishValidItem(next, messages, flags, { current: priceInfo.activePrice, previous: next.cart_previous_price_usd });
  }

  async function runValidation(cart, options = {}) {
    const sourceCart = Array.isArray(cart) ? cart : [];
    const flags = {
      changed: false,
      requiresReview: false,
      availabilityChanged: false,
      quantityAdjusted: false,
      priceChanged: false,
      rulesChanged: false,
      stockChanged: false,
      messages: [],
    };
    const validatedCart = [];

    for (const item of sourceCart) {
      if (isGiftItem(item)) {
        validatedCart.push(item);
      } else if (item?.variation_id) {
        validatedCart.push(await validateVariationItem(item, options, flags));
      } else {
        validatedCart.push(await validateProductItem(item, options, flags));
      }
    }

    const invalidItems = validatedCart.filter(isCartItemUnavailable);
    const result = {
      cart: validatedCart,
      changed: flags.changed,
      requiresReview: flags.requiresReview,
      availabilityChanged: flags.availabilityChanged,
      quantityAdjusted: flags.quantityAdjusted,
      priceChanged: flags.priceChanged,
      rulesChanged: flags.rulesChanged,
      stockChanged: flags.stockChanged,
      messages: [...new Set(flags.messages)],
      invalidItems,
      invalidCount: invalidItems.length,
      removedItems: [],
      removedCount: 0,
      validCart: validatedCart.filter((item) => !isCartItemUnavailable(item)),
      validatedAt: Date.now(),
    };

    return result;
  }

  async function validateCartAgainstStore(cart, options = {}) {
    const sourceCart = Array.isArray(cart) ? cart : [];
    if (!sourceCart.length) {
      return {
        cart: [],
        changed: false,
        requiresReview: false,
        messages: [],
        invalidItems: [],
        invalidCount: 0,
        removedItems: [],
        removedCount: 0,
        validCart: [],
        validatedAt: Date.now(),
      };
    }

    const fingerprint = getCartFingerprint(sourceCart);
    const canUseCache = options.force !== true
      && lastResult
      && lastFingerprint === fingerprint
      && Date.now() - lastValidatedAt < CACHE_TTL_MS;
    if (canUseCache) return { ...lastResult, skipped: true };

    if (activeValidationPromise) return activeValidationPromise;

    activeValidationPromise = runValidation(sourceCart, options)
      .then((result) => {
        lastFingerprint = fingerprint;
        lastValidatedAt = Date.now();
        lastResult = result;
        return result;
      })
      .finally(() => {
        activeValidationPromise = null;
      });

    return activeValidationPromise;
  }

  function defaultSaveCart(cart) {
    if (window.PZCartStorage?.writeCart) {
      window.PZCartStorage.writeCart(cart);
      window.dispatchEvent(new Event('cart-updated'));
      return;
    }
    const key = window.PZ_CART_STORAGE_KEY || `tusenda84_cart_${window.PZ_CURRENT_STORE_ID || 'powerzona'}`;
    localStorage.setItem(key, JSON.stringify(Array.isArray(cart) ? cart : []));
    window.dispatchEvent(new Event('cart-updated'));
  }

  async function applyCartValidation(cart, options = {}) {
    const result = await validateCartAgainstStore(cart, options);
    let nextCart = result.cart;
    const removedItems = options.removeUnavailable
      ? nextCart.filter(isCartItemUnavailable)
      : [];

    if (removedItems.length) {
      nextCart = nextCart.filter((item) => !isCartItemUnavailable(item));
      result.cart = nextCart;
      result.validCart = nextCart.filter((item) => !isCartItemUnavailable(item));
      result.removedItems = removedItems;
      result.removedCount = removedItems.length;
      result.changed = true;
      result.requiresReview = true;
      result.availabilityChanged = true;
      result.messages = [...new Set(['Quitamos productos agotados o no disponibles.', ...(result.messages || [])])];
    }

    if (result.changed || result.removedCount > 0) {
      const saveCart = typeof options.saveCart === 'function' ? options.saveCart : defaultSaveCart;
      saveCart(nextCart);
    }

    return result;
  }

  function isCartItemUnavailable(item) {
    if (!item || item.is_gift) return false;
    if (INVALID_STATUSES.has(String(item.cart_validation_status || ''))) return true;
    if (item.cart_validation_blocking === true) return true;
    const tracksStock = item.track_stock !== false;
    const stock = number(item.stock || 0);
    const preorder = Boolean(item.preorder);
    return tracksStock && stock <= 0 && !preorder;
  }

  function getCartValidationSummary(result) {
    const messages = [...new Set([
      ...(result?.changed || result?.removedCount ? ['Actualizamos tu carrito con la disponibilidad y precios actuales.'] : []),
      ...(result?.messages || []),
    ].filter(Boolean))];
    return {
      hasChanges: Boolean(result?.changed || result?.removedCount),
      requiresReview: Boolean(result?.requiresReview || result?.removedCount),
      removedCount: number(result?.removedCount || 0),
      invalidCount: number(result?.invalidCount || 0),
      priceChanged: Boolean(result?.priceChanged),
      quantityAdjusted: Boolean(result?.quantityAdjusted),
      availabilityChanged: Boolean(result?.availabilityChanged),
      messages,
    };
  }

  function getValidCartItems(cart) {
    return (Array.isArray(cart) ? cart : []).filter((item) => !isCartItemUnavailable(item));
  }

  window.PZCartLiveValidator = {
    validateCartAgainstStore,
    applyCartValidation,
    isCartItemUnavailable,
    getCartValidationSummary,
    getValidCartItems,
  };
})();
