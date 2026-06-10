(function () {
  const PROMOTION_TYPES = {
    BUY_X_PAY_Y: 'buy_x_pay_y',
    VOLUME: 'volume_discount',
    PRODUCT: 'product_discount',
    CATEGORY: 'category_discount',
    SUBCATEGORY: 'subcategory_discount',
    CART_SUBTOTAL: 'cart_subtotal_discount',
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

  async function loadActivePromotions(pocketbaseUrl) {
    const baseUrl = String(pocketbaseUrl || '').replace(/\/$/, '');
    if (!baseUrl) return [];

    try {
      const filter = encodeURIComponent('active = true');
      const response = await fetch(`${baseUrl}/api/collections/automatic_promotions/records?filter=${filter}&sort=priority,-updated&perPage=200`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || 'No se pudieron cargar promociones automaticas.');
      return (result?.items || []).map(normalizePromotion).filter(todayInRange);
    } catch (error) {
      console.warn('Promociones automaticas no disponibles todavia.', error);
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

  window.PZPromotions = {
    loadActivePromotions,
    calculateCartPromotions,
    discountLabel,
    PROMOTION_TYPES,
  };
})();
