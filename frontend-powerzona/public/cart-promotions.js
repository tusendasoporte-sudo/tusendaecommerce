(function () {
  const PROMOTION_TYPES = {
    BUY_X_PAY_Y: 'buy_x_pay_y',
    VOLUME: 'volume_discount',
    PRODUCT: 'product_discount',
    CATEGORY: 'category_discount',
    SUBCATEGORY: 'subcategory_discount',
    CART_SUBTOTAL: 'cart_subtotal_discount',
  };

  const COUPON_SCOPES = {
    CART: 'cart',
    PRODUCT: 'product',
    CATEGORY: 'category',
    SUBCATEGORY: 'subcategory',
    FREE_SHIPPING: 'free_shipping',
  };

  const LEVEL_WEIGHT = { product: 3, subcategory: 2, category: 1 };

  function number(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function todayInRange(promotion) {
    const now = Date.now();
    const startsAt = dateBoundaryTime(promotion.starts_at, 'start');
    const endsAt = dateBoundaryTime(promotion.ends_at, 'end');
    if (startsAt && startsAt > now) return false;
    if (endsAt && endsAt < now) return false;
    return true;
  }

  function dateBoundaryTime(value, boundary = 'start') {
    if (!value) return 0;
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const [year, month, day] = text.split('-').map(Number);
      const date = boundary === 'end'
        ? new Date(year, month - 1, day, 23, 59, 59, 999)
        : new Date(year, month - 1, day, 0, 0, 0, 0);
      return date.getTime();
    }
    const time = new Date(text).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function normalizePromotion(promotion) {
    return {
      ...promotion,
      type: String(promotion.type || ''),
      scope: String(promotion.scope || ''),
      discount_type: String(promotion.discount_type || ''),
      discount_value: number(promotion.discount_value),
      buy_qty: number(promotion.buy_qty),
      pay_qty: number(promotion.pay_qty),
      min_qty: number(promotion.min_qty),
      min_subtotal_usd: number(promotion.min_subtotal_usd),
      priority: number(promotion.priority),
      product: Array.isArray(promotion.product) ? promotion.product[0] : promotion.product || '',
      category: Array.isArray(promotion.category) ? promotion.category[0] : promotion.category || '',
      subcategory: Array.isArray(promotion.subcategory) ? promotion.subcategory[0] : promotion.subcategory || '',
    };
  }

  function normalizeCoupon(coupon) {
    return {
      ...coupon,
      code: String(coupon.code || '').trim().toUpperCase(),
      scope: String(coupon.scope || ''),
      discount_type: String(coupon.discount_type || ''),
      discount_value: number(coupon.discount_value),
      min_subtotal_usd: number(coupon.min_subtotal_usd),
      max_uses: number(coupon.max_uses),
      used_count: number(coupon.used_count),
      unlimited_uses: coupon.unlimited_uses !== false,
      product: Array.isArray(coupon.product) ? coupon.product[0] : coupon.product || '',
      category: Array.isArray(coupon.category) ? coupon.category[0] : coupon.category || '',
      subcategory: Array.isArray(coupon.subcategory) ? coupon.subcategory[0] : coupon.subcategory || '',
    };
  }

  function escapeFilterValue(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function activeStoreFilter(storeId) {
    const normalizedStoreId = String(storeId || '').trim();
    return normalizedStoreId
      ? `active = true && store="${escapeFilterValue(normalizedStoreId)}"`
      : 'active = true';
  }

  async function loadActivePromotions(pocketbaseUrl, storeId = '') {
    const baseUrl = String(pocketbaseUrl || '').replace(/\/$/, '');
    if (!baseUrl) return [];

    try {
      const filter = encodeURIComponent(activeStoreFilter(storeId));
      const response = await fetch(`${baseUrl}/api/collections/automatic_promotions/records?filter=${filter}&sort=priority,-updated&perPage=200`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudieron cargar promociones automaticas.');
      return (result?.items || []).map(normalizePromotion).filter(todayInRange);
    } catch (error) {
      console.warn('Promociones automaticas no disponibles todavia.', error);
      return [];
    }
  }

  async function loadActiveCoupons(pocketbaseUrl, storeId = '') {
    const baseUrl = String(pocketbaseUrl || '').replace(/\/$/, '');
    if (!baseUrl) return [];

    try {
      const filter = encodeURIComponent(activeStoreFilter(storeId));
      const response = await fetch(`${baseUrl}/api/collections/manual_coupons/records?filter=${filter}&sort=-updated&perPage=200&expand=product,category,subcategory`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudieron cargar cupones.');
      return (result?.items || []).map(normalizeCoupon);
    } catch (error) {
      console.warn('Cupones manuales no disponibles todavia.', error);
      return [];
    }
  }

  function appliesToItem(promotion, item) {
    if (item?.is_gift) return false;
    if (promotion.type === PROMOTION_TYPES.CART_SUBTOTAL || promotion.scope === 'cart') return false;
    if (promotion.type === PROMOTION_TYPES.PRODUCT || promotion.scope === 'product') return promotion.product && promotion.product === item.id;
    if (promotion.type === PROMOTION_TYPES.SUBCATEGORY || promotion.scope === 'subcategory') return promotion.subcategory && promotion.subcategory === item.subcategory;
    if (promotion.type === PROMOTION_TYPES.CATEGORY || promotion.scope === 'category') return promotion.category && promotion.category === item.category;
    return false;
  }

  function levelForPromotion(promotion) {
    if (promotion.type === PROMOTION_TYPES.PRODUCT || promotion.scope === 'product') return 'product';
    if (promotion.type === PROMOTION_TYPES.SUBCATEGORY || promotion.scope === 'subcategory') return 'subcategory';
    return 'category';
  }

  function discountLabel(promotion) {
    if (!promotion) return '';
    if (promotion.badge_text) return promotion.badge_text;
    if (promotion.type === PROMOTION_TYPES.BUY_X_PAY_Y) return `Compra ${promotion.buy_qty} y paga ${promotion.pay_qty}`;
    if (promotion.type === PROMOTION_TYPES.CART_SUBTOTAL && promotion.min_subtotal_usd > 0 && promotion.discount_type === 'fixed_usd') {
      return `Desde ${promotion.min_subtotal_usd.toFixed(2)} USD ahorras ${promotion.discount_value.toFixed(2)} USD`;
    }
    if (promotion.discount_type === 'percentage') return `${promotion.discount_value}% OFF automatico`;
    if (promotion.discount_type === 'fixed_usd') return `${promotion.discount_value.toFixed(2)} USD de descuento`;
    return promotion.name || 'Promo automatica';
  }

  function lineQuantity(item) {
    return item.is_gift ? 1 : number(item.quantity || 1);
  }

  function calculateLineDiscount(item, promotion) {
    const quantity = lineQuantity(item);
    const unitPrice = number(item.price);
    const originalSubtotal = item.is_gift ? 0 : unitPrice * quantity;
    if (!promotion || originalSubtotal <= 0) return 0;

    if (promotion.type === PROMOTION_TYPES.BUY_X_PAY_Y) {
      if (promotion.buy_qty <= promotion.pay_qty || promotion.pay_qty <= 0 || quantity < promotion.buy_qty) return 0;
      const groups = Math.floor(quantity / promotion.buy_qty);
      const freeUnits = groups * (promotion.buy_qty - promotion.pay_qty);
      return Math.min(originalSubtotal, freeUnits * unitPrice);
    }

    if (promotion.type === PROMOTION_TYPES.VOLUME && quantity < promotion.min_qty) return 0;

    if (promotion.discount_type === 'percentage') {
      if (promotion.discount_value <= 0) return 0;
      return Math.min(originalSubtotal, originalSubtotal * Math.min(100, promotion.discount_value) / 100);
    }

    if (promotion.discount_type === 'fixed_usd') {
      return Math.min(originalSubtotal, Math.max(0, promotion.discount_value));
    }

    return 0;
  }

  function isDirectItemPromotion(promotion) {
    return promotion.type === PROMOTION_TYPES.PRODUCT
      || promotion.type === PROMOTION_TYPES.BUY_X_PAY_Y
      || promotion.type === PROMOTION_TYPES.VOLUME
      || promotion.scope === 'product';
  }

  function isGroupPromotion(promotion, level) {
    if (level === 'subcategory') return promotion.type === PROMOTION_TYPES.SUBCATEGORY || promotion.scope === 'subcategory';
    if (level === 'category') return promotion.type === PROMOTION_TYPES.CATEGORY || promotion.scope === 'category';
    return false;
  }

  function discountForSubtotal(subtotalUSD, promotion) {
    if (!promotion || subtotalUSD <= 0) return 0;
    if (promotion.discount_type === 'percentage') return subtotalUSD * Math.min(100, Math.max(0, promotion.discount_value)) / 100;
    if (promotion.discount_type === 'fixed_usd') return Math.max(0, promotion.discount_value);
    return 0;
  }

  function bestItemPromotion(item, promotions) {
    const candidates = promotions
      .filter((promotion) => isDirectItemPromotion(promotion) && appliesToItem(promotion, item))
      .map((promotion) => {
        const discount = calculateLineDiscount(item, promotion);
        const level = levelForPromotion(promotion);
        return { promotion, discount, level, levelWeight: LEVEL_WEIGHT[level] || 0 };
      })
      .filter((candidate) => candidate.discount > 0);

    if (!candidates.length) return null;
    candidates.sort((a, b) => (b.levelWeight - a.levelWeight) || (b.discount - a.discount) || (b.promotion.priority - a.promotion.priority));
    const highestLevel = candidates[0].levelWeight;
    return candidates.filter((candidate) => candidate.levelWeight === highestLevel).sort((a, b) => b.discount - a.discount)[0];
  }

  function highestValueItem(items) {
    return [...items]
      .filter((item) => !item.is_gift && number(item.line_subtotal_final_usd) > 0)
      .sort((a, b) => number(b.line_subtotal_final_usd) - number(a.line_subtotal_final_usd))[0] || null;
  }

  function applyPromotionDiscountToItem(item, promotion, discountUSD, scope = '') {
    const available = number(item?.line_subtotal_final_usd);
    const applied = Math.min(available, Math.max(0, discountUSD));
    if (!item || applied <= 0) return 0;
    const label = discountLabel(promotion);

    item.line_discount_usd = number(item.line_discount_usd) + applied;
    if (scope === 'cart') item.cart_discount_usd = number(item.cart_discount_usd) + applied;
    item.line_subtotal_final_usd = Math.max(0, available - applied);
    item.unit_price_final_usd = lineQuantity(item) > 0 ? item.line_subtotal_final_usd / lineQuantity(item) : number(item.unit_price_final_usd);
    item.promotion = promotion;
    item.promotion_label = item.promotion_label && !item.promotion_label.includes(label)
      ? `${item.promotion_label} / ${label}`
      : (item.promotion_label || label);
    return applied;
  }

  function applyCouponDiscountToItem(item, coupon, discountUSD) {
    const available = number(item?.line_subtotal_final_usd);
    const applied = Math.min(available, Math.max(0, discountUSD));
    if (!item || applied <= 0) return 0;
    const label = couponLabel(coupon);

    item.line_discount_usd = number(item.line_discount_usd) + applied;
    item.coupon_discount_usd = number(item.coupon_discount_usd) + applied;
    item.line_subtotal_final_usd = Math.max(0, available - applied);
    item.unit_price_final_usd = lineQuantity(item) > 0 ? item.line_subtotal_final_usd / lineQuantity(item) : number(item.unit_price_final_usd);
    item.coupon = coupon;
    item.coupon_label = label;
    return applied;
  }

  function addAppliedPromotion(appliedPromotions, promotion, discountUSD, item, scope = '') {
    if (!promotion || discountUSD <= 0 || !item) return;
    appliedPromotions.push({
      id: promotion.id || '',
      name: promotion.name || discountLabel(promotion),
      label: discountLabel(promotion),
      type: promotion.type,
      discount_usd: discountUSD,
      product_id: item.id || '',
      only_usd: Boolean(item.only_usd),
      scope,
    });
  }

  function recalculateTotals(items) {
    return items.reduce((totals, item) => {
      if (item.is_gift) return totals;
      const lineTotal = number(item.line_subtotal_final_usd);
      const lineDiscount = number(item.line_discount_usd);
      if (item.only_usd) {
        totals.usdOnlyTotal += lineTotal;
        totals.usdOnlyDiscountTotal += lineDiscount;
      } else {
        totals.localCurrencyTotal += lineTotal;
        totals.localCurrencyDiscountTotal += lineDiscount;
      }
      totals.discountTotalUSD += lineDiscount;
      return totals;
    }, {
      localCurrencyTotal: 0,
      usdOnlyTotal: 0,
      usdOnlyDiscountTotal: 0,
      localCurrencyDiscountTotal: 0,
      discountTotalUSD: 0,
    });
  }

  function calculateOriginalTotals(items) {
    return items.reduce((totals, item) => {
      if (item.is_gift) return totals;
      const lineOriginal = number(item.line_subtotal_original_usd);
      if (item.only_usd) totals.usdOnlyOriginalTotal += lineOriginal;
      else totals.localCurrencyOriginalTotal += lineOriginal;
      return totals;
    }, {
      localCurrencyOriginalTotal: 0,
      usdOnlyOriginalTotal: 0,
    });
  }

  function applyGroupPromotions(items, activePromotions, appliedPromotions) {
    ['subcategory', 'category'].forEach((level) => {
      const candidates = activePromotions
        .filter((promotion) => isGroupPromotion(promotion, level))
        .map((promotion) => {
          const eligibleItems = items.filter((item) => !item.is_gift && !item.promotion && appliesToItem(promotion, item) && number(item.line_subtotal_final_usd) > 0);
          const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + number(item.line_subtotal_final_usd), 0);
          const targetItem = highestValueItem(eligibleItems);
          const discount = Math.min(number(targetItem?.line_subtotal_final_usd), discountForSubtotal(eligibleSubtotal, promotion));
          return { promotion, level, targetItem, discount };
        })
        .filter((candidate) => candidate.targetItem && candidate.discount > 0)
        .sort((a, b) => (b.discount - a.discount) || (b.promotion.priority - a.promotion.priority));

      candidates.forEach((candidate) => {
        if (candidate.targetItem.promotion) return;
        const applied = applyPromotionDiscountToItem(candidate.targetItem, candidate.promotion, candidate.discount, candidate.level);
        addAppliedPromotion(appliedPromotions, candidate.promotion, applied, candidate.targetItem, candidate.level);
      });
    });
  }

  function calculateCartPromotions(cart, promotions) {
    const activePromotions = (promotions || []).map(normalizePromotion).filter((promotion) => promotion.active !== false && todayInRange(promotion));
    let subtotalOriginalUSD = 0;
    const appliedPromotions = [];

    const items = (cart || []).map((item) => {
      const quantity = lineQuantity(item);
      const unitPrice = item.is_gift ? 0 : number(item.price);
      const lineSubtotalOriginalUSD = unitPrice * quantity;
      subtotalOriginalUSD += lineSubtotalOriginalUSD;

      const best = bestItemPromotion(item, activePromotions);
      const lineDiscountUSD = best ? Math.min(lineSubtotalOriginalUSD, best.discount) : 0;
      const lineSubtotalFinalUSD = Math.max(0, lineSubtotalOriginalUSD - lineDiscountUSD);

      if (best) addAppliedPromotion(appliedPromotions, best.promotion, lineDiscountUSD, item, best.level);

      return {
        ...item,
        promotion: best?.promotion || null,
        promotion_label: best ? discountLabel(best.promotion) : '',
        line_subtotal_original_usd: lineSubtotalOriginalUSD,
        line_discount_usd: lineDiscountUSD,
        line_subtotal_final_usd: lineSubtotalFinalUSD,
        unit_price_original_usd: unitPrice,
        unit_price_final_usd: quantity > 0 ? lineSubtotalFinalUSD / quantity : unitPrice,
      };
    });

    applyGroupPromotions(items, activePromotions, appliedPromotions);

    let totalsAfterItemPromos = recalculateTotals(items);
    let itemDiscountTotalUSD = totalsAfterItemPromos.discountTotalUSD;
    let subtotalAfterItemDiscountUSD = Math.max(0, subtotalOriginalUSD - itemDiscountTotalUSD);
    let cartDiscountUSD = 0;
    let cartPromotion = null;
    const cartPromotions = activePromotions
      .filter((promotion) => promotion.type === PROMOTION_TYPES.CART_SUBTOTAL || promotion.scope === 'cart')
      .filter((promotion) => subtotalAfterItemDiscountUSD >= promotion.min_subtotal_usd)
      .sort((a, b) => (b.min_subtotal_usd - a.min_subtotal_usd) || (b.priority - a.priority));

    const highestCartPromotion = cartPromotions[0] || null;
    if (highestCartPromotion) {
      cartDiscountUSD = Math.min(subtotalAfterItemDiscountUSD, discountForSubtotal(subtotalAfterItemDiscountUSD, highestCartPromotion));
      cartPromotion = cartDiscountUSD > 0 ? highestCartPromotion : null;
    }

    if (cartDiscountUSD > 0 && cartPromotion) {
      const targetItem = highestValueItem(items);
      const applied = applyPromotionDiscountToItem(targetItem, cartPromotion, cartDiscountUSD, 'cart');
      addAppliedPromotion(appliedPromotions, cartPromotion, applied, targetItem, 'cart');
      cartDiscountUSD = applied;
    }

    const finalTotals = recalculateTotals(items);
    const originalTotals = calculateOriginalTotals(items);
    const discountTotalUSD = finalTotals.discountTotalUSD;
    const subtotalFinalUSD = Math.max(0, subtotalOriginalUSD - discountTotalUSD);

    return {
      items,
      subtotalOriginalUSD,
      localCurrencyOriginalTotal: originalTotals.localCurrencyOriginalTotal,
      usdOnlyOriginalTotal: originalTotals.usdOnlyOriginalTotal,
      itemDiscountTotalUSD,
      cartDiscountUSD,
      discountTotalUSD,
      usdOnlyDiscountTotal: finalTotals.usdOnlyDiscountTotal,
      localCurrencyDiscountTotal: finalTotals.localCurrencyDiscountTotal,
      subtotalFinalUSD,
      subtotalAfterDiscountUSD: subtotalFinalUSD,
      localCurrencyTotal: finalTotals.localCurrencyTotal,
      usdOnlyTotal: finalTotals.usdOnlyTotal,
      visualTotalUSD: finalTotals.localCurrencyTotal,
      appliedPromotions,
      promotionSummary: appliedPromotions.map((promo) => `${promo.label || promo.name}: $${number(promo.discount_usd).toFixed(2)} USD`).join('\n'),
    };
  }

  function couponLabel(coupon) {
    if (!coupon) return '';
    if (coupon.customer_message) return coupon.customer_message;
    if (coupon.scope === COUPON_SCOPES.FREE_SHIPPING) return 'Envio gratis';
    if (coupon.discount_type === 'percentage') return `${coupon.discount_value}% de descuento`;
    if (coupon.discount_type === 'fixed_usd') return `${coupon.discount_value.toFixed(2)} USD de descuento`;
    return coupon.name || coupon.code || 'Cupon manual';
  }

  function couponScopeLabel(coupon) {
    return ({
      cart: 'Carrito',
      product: 'Producto',
      category: 'Categoria',
      subcategory: 'Subcategoria',
      free_shipping: 'Envio gratis',
    })[coupon?.scope] || 'Cupon';
  }

  function couponIsSoldOut(coupon) {
    return coupon.unlimited_uses === false && coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses;
  }

  function couponEligibleItems(coupon, items) {
    if (!coupon) return [];
    return (items || []).filter((item) => {
      if (item?.is_gift) return false;
      if (coupon.scope === COUPON_SCOPES.CART) return true;
      if (coupon.scope === COUPON_SCOPES.PRODUCT) return coupon.product && coupon.product === item.id;
      if (coupon.scope === COUPON_SCOPES.CATEGORY) return coupon.category && coupon.category === item.category;
      if (coupon.scope === COUPON_SCOPES.SUBCATEGORY) return coupon.subcategory && coupon.subcategory === item.subcategory;
      return false;
    });
  }

  function couponStatusForCart(coupon, baseTotals, deliveryMethod = '', shippingUSD = 0) {
    if (!coupon) return { ok: false, code: 'missing', message: 'El cupon no es valido.' };
    if (coupon.active === false) return { ok: false, code: 'inactive', message: 'Este cupon no esta activo.' };
    if (!todayInRange(coupon)) return { ok: false, code: 'expired', message: 'Este cupon ya vencio.' };
    if (couponIsSoldOut(coupon)) return { ok: false, code: 'sold_out', message: 'Este cupon ya alcanzo su limite de uso.' };
    if (coupon.scope === COUPON_SCOPES.FREE_SHIPPING && deliveryMethod && deliveryMethod !== 'delivery') {
      return { ok: false, code: 'delivery_required', message: 'Este cupon aplica solo para pedidos con envio.' };
    }
    if (coupon.scope === COUPON_SCOPES.FREE_SHIPPING && deliveryMethod === 'delivery' && shippingUSD <= 0) {
      return { ok: false, code: 'no_shipping_cost', message: 'Este pedido no tiene costo de envio para descontar.' };
    }
    const subtotal = number(baseTotals?.subtotalOriginalUSD);
    if (coupon.min_subtotal_usd > 0 && subtotal < coupon.min_subtotal_usd) {
      return {
        ok: false,
        code: 'min_subtotal',
        missing_usd: coupon.min_subtotal_usd - subtotal,
        message: `Te faltan ${(coupon.min_subtotal_usd - subtotal).toFixed(2)} USD para usarlo.`,
      };
    }
    return { ok: true, code: 'ok', message: 'Cupon disponible.' };
  }

  function calculateCouponOnBaseline(cart, coupon, deliveryMethod = '', shippingUSD = 0) {
    const baseTotals = calculateCartPromotions(cart, []);
    const normalizedCoupon = normalizeCoupon(coupon || {});
    const status = couponStatusForCart(normalizedCoupon, baseTotals, deliveryMethod, shippingUSD);
    if (!status.ok) {
      return {
        ...baseTotals,
        manualCoupon: normalizedCoupon,
        manualCouponStatus: status,
        couponDiscountUSD: 0,
        shippingDiscountUSD: 0,
        couponApplied: false,
      };
    }

    if (normalizedCoupon.scope === COUPON_SCOPES.FREE_SHIPPING) {
      const shippingDiscountUSD = deliveryMethod === 'delivery' ? Math.max(0, shippingUSD) : 0;
      return {
        ...baseTotals,
        manualCoupon: normalizedCoupon,
        manualCouponStatus: shippingDiscountUSD > 0 ? status : { ok: false, code: 'delivery_required', message: 'Este cupon aplica solo para pedidos con envio.' },
        couponDiscountUSD: 0,
        shippingDiscountUSD,
        couponApplied: shippingDiscountUSD > 0,
        couponSummary: shippingDiscountUSD > 0 ? `${normalizedCoupon.code}: envio gratis` : '',
      };
    }

    const eligibleItems = couponEligibleItems(normalizedCoupon, baseTotals.items);
    const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + number(item.line_subtotal_final_usd), 0);
    if (eligibleSubtotal <= 0) {
      return {
        ...baseTotals,
        manualCoupon: normalizedCoupon,
        manualCouponStatus: { ok: false, code: 'no_match', message: 'Este cupon no aplica a los productos del pedido.' },
        couponDiscountUSD: 0,
        shippingDiscountUSD: 0,
        couponApplied: false,
      };
    }

    let targetDiscount = 0;
    if (normalizedCoupon.discount_type === 'percentage') {
      targetDiscount = eligibleSubtotal * Math.min(100, Math.max(0, normalizedCoupon.discount_value)) / 100;
    } else if (normalizedCoupon.discount_type === 'fixed_usd') {
      targetDiscount = Math.max(0, normalizedCoupon.discount_value);
    }
    targetDiscount = Math.min(eligibleSubtotal, targetDiscount);

    let remaining = targetDiscount;
    const sortedItems = [...eligibleItems].sort((a, b) => number(b.line_subtotal_final_usd) - number(a.line_subtotal_final_usd));
    sortedItems.forEach((item, index) => {
      if (remaining <= 0) return;
      const available = number(item.line_subtotal_final_usd);
      const share = index === sortedItems.length - 1
        ? remaining
        : Math.min(available, targetDiscount * (available / eligibleSubtotal));
      const applied = applyCouponDiscountToItem(item, normalizedCoupon, share);
      remaining = Math.max(0, remaining - applied);
    });

    const finalTotals = recalculateTotals(baseTotals.items);
    const discountTotalUSD = finalTotals.discountTotalUSD;
    const subtotalFinalUSD = Math.max(0, baseTotals.subtotalOriginalUSD - discountTotalUSD);
    return {
      ...baseTotals,
      discountTotalUSD,
      usdOnlyDiscountTotal: finalTotals.usdOnlyDiscountTotal,
      localCurrencyDiscountTotal: finalTotals.localCurrencyDiscountTotal,
      subtotalFinalUSD,
      subtotalAfterDiscountUSD: subtotalFinalUSD,
      localCurrencyTotal: finalTotals.localCurrencyTotal,
      usdOnlyTotal: finalTotals.usdOnlyTotal,
      visualTotalUSD: finalTotals.localCurrencyTotal,
      manualCoupon: normalizedCoupon,
      manualCouponStatus: status,
      couponDiscountUSD: targetDiscount,
      shippingDiscountUSD: 0,
      couponApplied: targetDiscount > 0,
      couponSummary: targetDiscount > 0 ? `${normalizedCoupon.code}: $${targetDiscount.toFixed(2)} USD` : '',
      promotionSummary: targetDiscount > 0 ? `Cupon ${normalizedCoupon.code}: $${targetDiscount.toFixed(2)} USD` : '',
      appliedPromotions: targetDiscount > 0 ? [{
        id: normalizedCoupon.id || '',
        name: normalizedCoupon.name || normalizedCoupon.code,
        label: `Cupon ${normalizedCoupon.code}`,
        type: 'manual_coupon',
        discount_usd: targetDiscount,
        scope: normalizedCoupon.scope,
      }] : [],
    };
  }

  function calculateCartWithManualCoupon(cart, promotions, coupon, deliveryMethod = '', shippingUSD = 0) {
    const automaticTotals = calculateCartPromotions(cart, promotions);
    if (!coupon) {
      return {
        ...automaticTotals,
        couponWinner: 'automatic',
        couponDiscountUSD: 0,
        shippingDiscountUSD: 0,
        shippingOriginalUSD: shippingUSD,
        shippingFinalUSD: shippingUSD,
      };
    }

    const couponTotals = calculateCouponOnBaseline(cart, coupon, deliveryMethod, shippingUSD);
    const automaticBenefit = number(automaticTotals.discountTotalUSD);
    const couponBenefit = number(couponTotals.couponDiscountUSD) + number(couponTotals.shippingDiscountUSD);
    const couponWins = couponTotals.couponApplied && couponBenefit > automaticBenefit;

    if (!couponWins) {
      const message = couponTotals.manualCouponStatus?.ok && couponBenefit > 0 && automaticBenefit >= couponBenefit
        ? 'Hay una promocion automatica de mayor beneficio. Se aplico esa promo.'
        : couponTotals.manualCouponStatus?.message || '';
      return {
        ...automaticTotals,
        manualCoupon: couponTotals.manualCoupon,
        manualCouponStatus: { ...(couponTotals.manualCouponStatus || {}), message },
        couponWinner: automaticBenefit > 0 ? 'automatic' : 'none',
        couponDiscountUSD: 0,
        shippingDiscountUSD: 0,
        shippingOriginalUSD: shippingUSD,
        shippingFinalUSD: shippingUSD,
      };
    }

    return {
      ...couponTotals,
      couponWinner: 'manual_coupon',
      shippingOriginalUSD: shippingUSD,
      shippingFinalUSD: Math.max(0, shippingUSD - number(couponTotals.shippingDiscountUSD)),
      totalBenefitUSD: couponBenefit,
    };
  }

  window.PZPromotions = {
    loadActivePromotions,
    loadActiveCoupons,
    calculateCartPromotions,
    calculateCartWithManualCoupon,
    normalizeCoupon,
    couponLabel,
    couponScopeLabel,
    discountLabel,
    PROMOTION_TYPES,
    COUPON_SCOPES,
  };
})();
