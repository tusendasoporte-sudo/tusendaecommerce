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
    const startsAt = promotion.starts_at ? new Date(promotion.starts_at).getTime() : 0;
    const endsAt = promotion.ends_at ? new Date(promotion.ends_at).getTime() : 0;
    if (startsAt && startsAt > now) return false;
    if (endsAt && endsAt < now) return false;
    return true;
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
      if (!response.ok) throw new Error(result?.message || 'No se pudieron cargar promociones automáticas.');
      return (result?.items || []).map(normalizePromotion).filter(todayInRange);
    } catch (error) {
      console.warn('Promociones automáticas no disponibles todavía.', error);
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
    if (promotion.discount_type === 'percentage') return `${promotion.discount_value}% OFF automático`;
    if (promotion.discount_type === 'fixed_usd') return `${promotion.discount_value.toFixed(2)} USD de descuento`;
    return promotion.name || 'Promo automática';
  }

  function calculateLineDiscount(item, promotion) {
    const quantity = number(item.quantity || 1);
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

  function bestItemPromotion(item, promotions) {
    const candidates = promotions
      .filter((promotion) => appliesToItem(promotion, item))
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

  function calculateCartPromotions(cart, promotions) {
    const activePromotions = (promotions || []).map(normalizePromotion).filter((promotion) => promotion.active !== false && todayInRange(promotion));
    let subtotalOriginalUSD = 0;
    let itemDiscountTotalUSD = 0;
    let localCurrencyTotal = 0;
    let usdOnlyTotal = 0;
    const appliedPromotions = [];

    const items = (cart || []).map((item) => {
      const quantity = item.is_gift ? 1 : number(item.quantity || 1);
      const unitPrice = item.is_gift ? 0 : number(item.price);
      const lineSubtotalOriginalUSD = unitPrice * quantity;
      subtotalOriginalUSD += lineSubtotalOriginalUSD;

      const best = bestItemPromotion(item, activePromotions);
      const lineDiscountUSD = best ? Math.min(lineSubtotalOriginalUSD, best.discount) : 0;
      const lineSubtotalFinalUSD = Math.max(0, lineSubtotalOriginalUSD - lineDiscountUSD);
      itemDiscountTotalUSD += lineDiscountUSD;

      if (item.only_usd) usdOnlyTotal += lineSubtotalFinalUSD;
      else localCurrencyTotal += lineSubtotalFinalUSD;

      if (best) {
        appliedPromotions.push({
          id: best.promotion.id || '',
          name: best.promotion.name || discountLabel(best.promotion),
          type: best.promotion.type,
          discount_usd: lineDiscountUSD,
          product_id: item.id || '',
        });
      }

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

    let subtotalAfterItemDiscountUSD = Math.max(0, subtotalOriginalUSD - itemDiscountTotalUSD);
    let cartDiscountUSD = 0;
    let cartPromotion = null;
    const cartPromotions = activePromotions.filter((promotion) => promotion.type === PROMOTION_TYPES.CART_SUBTOTAL || promotion.scope === 'cart');
    cartPromotions.forEach((promotion) => {
      if (subtotalAfterItemDiscountUSD < promotion.min_subtotal_usd) return;
      let discount = 0;
      if (promotion.discount_type === 'percentage') discount = subtotalAfterItemDiscountUSD * Math.min(100, promotion.discount_value) / 100;
      if (promotion.discount_type === 'fixed_usd') discount = promotion.discount_value;
      discount = Math.min(subtotalAfterItemDiscountUSD, Math.max(0, discount));
      if (discount > cartDiscountUSD) {
        cartDiscountUSD = discount;
        cartPromotion = promotion;
      }
    });

    if (cartDiscountUSD > 0 && subtotalAfterItemDiscountUSD > 0) {
      const ratio = cartDiscountUSD / subtotalAfterItemDiscountUSD;
      localCurrencyTotal = 0;
      usdOnlyTotal = 0;
      items.forEach((item) => {
        const cartShare = item.line_subtotal_final_usd * ratio;
        item.cart_discount_usd = cartShare;
        item.line_discount_usd += cartShare;
        item.line_subtotal_final_usd = Math.max(0, item.line_subtotal_final_usd - cartShare);
        item.unit_price_final_usd = number(item.quantity || 1) > 0 ? item.line_subtotal_final_usd / number(item.quantity || 1) : item.unit_price_final_usd;
        if (item.only_usd) usdOnlyTotal += item.line_subtotal_final_usd;
        else localCurrencyTotal += item.line_subtotal_final_usd;
      });
      appliedPromotions.push({
        id: cartPromotion.id || '',
        name: cartPromotion.name || discountLabel(cartPromotion),
        type: cartPromotion.type,
        discount_usd: cartDiscountUSD,
        scope: 'cart',
      });
    }

    const discountTotalUSD = itemDiscountTotalUSD + cartDiscountUSD;
    const subtotalFinalUSD = Math.max(0, subtotalOriginalUSD - discountTotalUSD);
    const usdOnlyDiscountTotal = items.reduce((sum, item) => item.only_usd ? sum + number(item.line_discount_usd) : sum, 0);
    const localCurrencyDiscountTotal = Math.max(0, discountTotalUSD - usdOnlyDiscountTotal);

    return {
      items,
      subtotalOriginalUSD,
      itemDiscountTotalUSD,
      cartDiscountUSD,
      discountTotalUSD,
      usdOnlyDiscountTotal,
      localCurrencyDiscountTotal,
      subtotalFinalUSD,
      subtotalAfterDiscountUSD: subtotalFinalUSD,
      localCurrencyTotal,
      usdOnlyTotal,
      visualTotalUSD: localCurrencyTotal,
      appliedPromotions,
      promotionSummary: appliedPromotions.map((promo) => `${promo.name}: $${number(promo.discount_usd).toFixed(2)} USD`).join('\n'),
    };
  }

  window.PZPromotions = {
    loadActivePromotions,
    calculateCartPromotions,
    discountLabel,
    PROMOTION_TYPES,
  };
})();
