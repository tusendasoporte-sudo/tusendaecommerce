/// <reference path="../pb_data/types.d.ts" />

const priceWatch = typeof __hooks === "undefined"
  ? require("./pz_master_price_watch_lib.js")
  : require(`${__hooks}/pz_master_price_watch_lib.js`);
const expiration = typeof __hooks === "undefined"
  ? require("./pz_product_expiration_lib.js")
  : require(`${__hooks}/pz_product_expiration_lib.js`);
const teamPermissions = typeof __hooks === "undefined"
  ? require("./pz_store_team_permissions_lib.js")
  : require(`${__hooks}/pz_store_team_permissions_lib.js`);
const storeActivity = typeof __hooks === "undefined"
  ? require("./pz_store_activity_audit_lib.js")
  : require(`${__hooks}/pz_store_activity_audit_lib.js`);

const CHECKOUT_PATH = "/api/pz/checkout/orders";
const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{24,80}$/;
const COUPON_PATTERN = /^[A-Za-z0-9_-]{2,40}$/;
const DELIVERY_METHODS = Object.freeze(["delivery", "pickup", "coordinate"]);
const ONE_TO_ONE_RATE_TOLERANCE = 0.000001;
const MAX_ITEMS = 100;
const MAX_QUANTITY = 100000;
const ECONOMIC_SNAPSHOT_VERSION = 1;
const ECONOMIC_SNAPSHOT_ALGORITHM = "pz-order-economics-v1";
const MAX_MANUAL_UNIT_PRICE_USD = 1000000;
const MANUAL_ADJUSTMENT_STATES = Object.freeze(["pending", "confirmed", "preparing"]);
const ORDER_STATUSES = Object.freeze(["pending", "confirmed", "preparing", "delivered", "cancelled"]);
const INVENTORY_RESERVED_STATUSES = Object.freeze(["confirmed", "preparing", "delivered"]);
const ORDER_TOKEN_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const MANUAL_ADJUSTMENT_REASONS = Object.freeze([
  "customer_agreement",
  "price_correction",
  "special_discount",
  "shipping_service",
  "inconvenience",
  "other",
]);
const RESET_ADJUSTMENT_FIELDS = Object.freeze(["reason_code", "reason_text"]);
const BUSINESS_DAY_KEYS = Object.freeze(["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]);
const PROMOTION_TYPES = Object.freeze({
  BUY_X_PAY_Y: "buy_x_pay_y",
  VOLUME: "volume_discount",
  PRODUCT: "product_discount",
  CATEGORY: "category_discount",
  SUBCATEGORY: "subcategory_discount",
  CART_SUBTOTAL: "cart_subtotal_discount",
});
const COUPON_SCOPES = Object.freeze({
  CART: "cart",
  PRODUCT: "product",
  CATEGORY: "category",
  SUBCATEGORY: "subcategory",
  FREE_SHIPPING: "free_shipping",
});
const LEVEL_WEIGHT = Object.freeze({ product: 3, subcategory: 2, category: 1 });
const PUBLIC_ERROR_CODES = new Set([
  "invalid_order",
  "order_unavailable",
  "order_conflict",
]);

function recordValue(record, key) {
  if (!record) return undefined;
  if (typeof record.get === "function") {
    try { return record.get(key); } catch (_) {}
  }
  if (typeof record.getString === "function") {
    try { return record.getString(key); } catch (_) {}
  }
  return record[key];
}

function recordString(record, key) {
  const value = recordValue(record, key);
  if (value && typeof value === "object" && typeof value.string === "function") {
    try { return String(value.string() || "").trim(); } catch (_) { return ""; }
  }
  return String(value === null || value === undefined ? "" : value).trim();
}

function recordBool(record, key) {
  const value = recordValue(record, key);
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordNumber(record, key) {
  const value = Number(recordValue(record, key) || 0);
  return Number.isFinite(value) ? value : 0;
}

function recordJson(record, key) {
  const value = recordValue(record, key);
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch (_) {
    return null;
  }
}

function relationId(record, key) {
  const value = recordValue(record, key);
  if (Array.isArray(value)) return String(value[0] || "").trim();
  if (value && typeof value === "object") return String(value.id || "").trim();
  return String(value || "").trim();
}

function bounded(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  const raw = String(value || "").trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [raw];
  } catch (_) {
    return [raw];
  }
}

function safeFileName(value) {
  const name = bounded(value, 180);
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return "";
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) ? name : "";
}

function recordFileUrl(record, field, orderField) {
  if (!record || !record.id) return "";
  const files = stringList(recordValue(record, field)).map(safeFileName).filter(Boolean);
  const order = orderField ? stringList(recordValue(record, orderField)).map(safeFileName).filter(Boolean) : [];
  const fileName = order.concat(files).find((name, index, values) => files.includes(name) && values.indexOf(name) === index) || "";
  if (!fileName) return "";
  let collectionId = "";
  try { collectionId = bounded(record.collection().id, 80); } catch (_) {}
  if (!collectionId) return "";
  return `/api/files/${encodeURIComponent(collectionId)}/${encodeURIComponent(record.id)}/${encodeURIComponent(fileName)}`;
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function findRecord(app, collection, id) {
  if (!app || !RECORD_ID_PATTERN.test(String(id || ""))) return null;
  try { return app.findRecordById(collection, id); } catch (_) { return null; }
}

function findRecordsStrict(app, collection, filter, sort, limit, offset, params) {
  return app.findRecordsByFilter(collection, filter || "", sort || "", limit || 200, offset || 0, params || {}) || [];
}

function originalRecord(record) {
  if (!record || typeof record.original !== "function") return null;
  try { return record.original(); } catch (_) { return null; }
}

function codedError(code, status) {
  const error = new Error(PUBLIC_ERROR_CODES.has(code) ? code : "order_creation_failed");
  error.code = PUBLIC_ERROR_CODES.has(code) ? code : "order_creation_failed";
  error.status = Number(status) || 400;
  return error;
}

function requestErrorCode(error) {
  const code = String(error && (error.code || error.message) || "");
  return PUBLIC_ERROR_CODES.has(code) ? code : "";
}

function bodyValue(body, key) {
  if (!body) return undefined;
  if (typeof body.get === "function") return body.get(key);
  return body[key];
}

function parseCheckoutItem(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const productId = bounded(bodyValue(source, "product_id"), 15);
  const variationId = bounded(bodyValue(source, "variation_id"), 15);
  const giftId = bounded(bodyValue(source, "gift_id"), 15);
  const rawQuantity = bodyValue(source, "quantity");
  const quantity = Number(rawQuantity === undefined ? 1 : rawQuantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null;
  if (giftId) {
    if (!RECORD_ID_PATTERN.test(giftId) || productId || variationId || quantity !== 1) return null;
    return { giftId, productId: "", variationId: "", quantity: 1, isGift: true };
  }
  if (!RECORD_ID_PATTERN.test(productId)) return null;
  if (variationId && !RECORD_ID_PATTERN.test(variationId)) return null;
  return { giftId: "", productId, variationId, quantity, isGift: false };
}

function parseCheckoutPayload(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const storeId = bounded(bodyValue(body, "store_id"), 15);
  const idempotencyKey = bounded(bodyValue(body, "idempotency_key"), 80);
  const currencyId = bounded(bodyValue(body, "currency_id"), 15);
  const shippingZoneId = bounded(bodyValue(body, "shipping_zone_id"), 15);
  const deliveryMethod = bounded(bodyValue(body, "delivery_method"), 20);
  const couponCode = bounded(bodyValue(body, "coupon_code"), 40).toUpperCase();
  const customerName = bounded(bodyValue(body, "customer_name"), 160);
  const customerPhone = bounded(bodyValue(body, "customer_phone"), 40);
  const customerAddress = bounded(bodyValue(body, "customer_address"), 500);
  const customerMunicipality = bounded(bodyValue(body, "customer_municipality"), 120);
  const customerNote = bounded(bodyValue(body, "customer_note"), 500);
  const rawItems = bodyValue(body, "items");
  if (!RECORD_ID_PATTERN.test(storeId) || !IDEMPOTENCY_PATTERN.test(idempotencyKey)) return null;
  if (currencyId && !RECORD_ID_PATTERN.test(currencyId)) return null;
  if (shippingZoneId && !RECORD_ID_PATTERN.test(shippingZoneId)) return null;
  if (!DELIVERY_METHODS.includes(deliveryMethod)) return null;
  if (!customerName || customerName.length < 2 || !customerPhone || customerPhone.length < 6) return null;
  if (!/^[+0-9()\-\s.]+$/.test(customerPhone)) return null;
  if (deliveryMethod === "delivery" && (!shippingZoneId || !customerAddress)) return null;
  if (couponCode && !COUPON_PATTERN.test(couponCode)) return null;
  if (!Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > MAX_ITEMS) return null;
  const items = rawItems.map(parseCheckoutItem);
  if (items.some((item) => !item) || !items.some((item) => item && !item.isGift)) return null;
  if (items.filter((item) => item && item.isGift).length > 1) return null;
  const unique = new Set();
  for (const item of items) {
    const key = item.isGift ? `gift:${item.giftId}` : `product:${item.productId}:${item.variationId}`;
    if (unique.has(key)) return null;
    unique.add(key);
  }
  return {
    storeId,
    idempotencyKey,
    currencyId,
    shippingZoneId,
    deliveryMethod,
    couponCode,
    customerName,
    customerPhone,
    customerAddress: deliveryMethod === "delivery" ? customerAddress : "",
    customerMunicipality,
    customerNote,
    items,
  };
}

function dateBoundaryTime(value, boundary) {
  if (!value) return 0;
  const text = String(value && typeof value.string === "function" ? value.string() : value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const parts = text.split("-").map(Number);
    return boundary === "end"
      ? new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime()
      : new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0).getTime();
  }
  const time = new Date(text).getTime();
  return Number.isFinite(time) ? time : 0;
}

function todayInRange(entity, now) {
  const nowTime = now instanceof Date ? now.getTime() : Date.now();
  const startsAt = dateBoundaryTime(entity.starts_at, "start");
  const endsAt = dateBoundaryTime(entity.ends_at, "end");
  if (startsAt && startsAt > nowTime) return false;
  if (endsAt && endsAt < nowTime) return false;
  return true;
}

function timeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59 ? hours * 60 + minutes : null;
}

function havanaClock(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  try {
    if (typeof Intl !== "undefined" && typeof Intl.DateTimeFormat === "function") {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Havana", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
      }).formatToParts(date);
      const part = (type) => parts.find((item) => item.type === type);
      const weekdays = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const weekday = part("weekday");
      const hour = part("hour");
      const minute = part("minute");
      if (weekday && hour && minute) return { dayIndex: weekdays[weekday.value] || 0, minutes: Number(hour.value) * 60 + Number(minute.value) };
    }
  } catch (_) {}
  const year = date.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const secondSundayMarch = 8 + ((7 - marchFirst.getUTCDay()) % 7);
  const novemberFirst = new Date(Date.UTC(year, 10, 1));
  const firstSundayNovember = 1 + ((7 - novemberFirst.getUTCDay()) % 7);
  const dstStart = Date.UTC(year, 2, secondSundayMarch, 5, 0, 0);
  const dstEnd = Date.UTC(year, 10, firstSundayNovember, 5, 0, 0);
  const offset = date.getTime() >= dstStart && date.getTime() < dstEnd ? -4 : -5;
  const shifted = new Date(date.getTime() + offset * 60 * 60 * 1000);
  return { dayIndex: shifted.getUTCDay(), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() };
}

function ordersAllowedBySettings(settings, now) {
  const mode = recordString(settings, "business_hours_mode") || "always_available";
  if (mode === "temporarily_closed") return false;
  if (mode !== "custom" || recordValue(settings, "allow_orders_when_closed") !== false) return true;
  let hours = recordValue(settings, "business_hours");
  if (typeof hours === "string") {
    try { hours = JSON.parse(hours); } catch (_) { hours = null; }
  }
  if (!hours || typeof hours !== "object" || Array.isArray(hours)) return false;
  const clock = havanaClock(now);
  const day = hours[BUSINESS_DAY_KEYS[clock.dayIndex]];
  if (!day || day.enabled !== true) return false;
  const open = timeToMinutes(day.open);
  const close = timeToMinutes(day.close);
  if (open === null || close === null || open === close) return false;
  return open < close ? clock.minutes >= open && clock.minutes < close : clock.minutes >= open || clock.minutes < close;
}

function normalizePromotion(promotion) {
  return Object.assign({}, promotion, {
    type: String(promotion.type || ""),
    scope: String(promotion.scope || ""),
    discount_type: String(promotion.discount_type || ""),
    discount_value: number(promotion.discount_value),
    buy_qty: number(promotion.buy_qty),
    pay_qty: number(promotion.pay_qty),
    min_qty: number(promotion.min_qty),
    min_subtotal_usd: number(promotion.min_subtotal_usd),
    priority: number(promotion.priority),
    product: Array.isArray(promotion.product) ? promotion.product[0] : promotion.product || "",
    category: Array.isArray(promotion.category) ? promotion.category[0] : promotion.category || "",
    subcategory: Array.isArray(promotion.subcategory) ? promotion.subcategory[0] : promotion.subcategory || "",
  });
}

function normalizeCoupon(coupon) {
  return Object.assign({}, coupon, {
    code: String(coupon.code || "").trim().toUpperCase(),
    scope: String(coupon.scope || ""),
    discount_type: String(coupon.discount_type || ""),
    discount_value: number(coupon.discount_value),
    min_subtotal_usd: number(coupon.min_subtotal_usd),
    max_uses: number(coupon.max_uses),
    used_count: number(coupon.used_count),
    unlimited_uses: coupon.unlimited_uses !== false,
    product: Array.isArray(coupon.product) ? coupon.product[0] : coupon.product || "",
    category: Array.isArray(coupon.category) ? coupon.category[0] : coupon.category || "",
    subcategory: Array.isArray(coupon.subcategory) ? coupon.subcategory[0] : coupon.subcategory || "",
  });
}

function appliesToItem(promotion, item) {
  if (item && item.is_gift) return false;
  if (promotion.type === PROMOTION_TYPES.CART_SUBTOTAL || promotion.scope === "cart") return false;
  if (promotion.type === PROMOTION_TYPES.PRODUCT || promotion.scope === "product") return promotion.product && promotion.product === item.id;
  if (promotion.type === PROMOTION_TYPES.SUBCATEGORY || promotion.scope === "subcategory") return promotion.subcategory && promotion.subcategory === item.subcategory;
  if (promotion.type === PROMOTION_TYPES.CATEGORY || promotion.scope === "category") return promotion.category && promotion.category === item.category;
  return false;
}

function levelForPromotion(promotion) {
  if (promotion.type === PROMOTION_TYPES.PRODUCT || promotion.scope === "product") return "product";
  if (promotion.type === PROMOTION_TYPES.SUBCATEGORY || promotion.scope === "subcategory") return "subcategory";
  return "category";
}

function discountLabel(promotion) {
  if (!promotion) return "";
  if (promotion.badge_text) return promotion.badge_text;
  if (promotion.type === PROMOTION_TYPES.BUY_X_PAY_Y) return `Compra ${promotion.buy_qty} y paga ${promotion.pay_qty}`;
  if (promotion.type === PROMOTION_TYPES.CART_SUBTOTAL && promotion.min_subtotal_usd > 0 && promotion.discount_type === "fixed_usd") {
    return `Desde ${promotion.min_subtotal_usd.toFixed(2)} USD ahorras ${promotion.discount_value.toFixed(2)} USD`;
  }
  if (promotion.discount_type === "percentage") return `${promotion.discount_value}% OFF automatico`;
  if (promotion.discount_type === "fixed_usd") return `${promotion.discount_value.toFixed(2)} USD de descuento`;
  return promotion.name || "Promo automatica";
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
    return Math.min(originalSubtotal, groups * (promotion.buy_qty - promotion.pay_qty) * unitPrice);
  }
  if (promotion.type === PROMOTION_TYPES.VOLUME && quantity < promotion.min_qty) return 0;
  if (promotion.discount_type === "percentage") {
    if (promotion.discount_value <= 0) return 0;
    return Math.min(originalSubtotal, originalSubtotal * Math.min(100, promotion.discount_value) / 100);
  }
  if (promotion.discount_type === "fixed_usd") return Math.min(originalSubtotal, Math.max(0, promotion.discount_value));
  return 0;
}

function isDirectItemPromotion(promotion) {
  return promotion.type === PROMOTION_TYPES.PRODUCT
    || promotion.type === PROMOTION_TYPES.BUY_X_PAY_Y
    || promotion.type === PROMOTION_TYPES.VOLUME
    || promotion.scope === "product";
}

function isGroupPromotion(promotion, level) {
  if (level === "subcategory") return promotion.type === PROMOTION_TYPES.SUBCATEGORY || promotion.scope === "subcategory";
  if (level === "category") return promotion.type === PROMOTION_TYPES.CATEGORY || promotion.scope === "category";
  return false;
}

function discountForSubtotal(subtotalUSD, promotion) {
  if (!promotion || subtotalUSD <= 0) return 0;
  if (promotion.discount_type === "percentage") return subtotalUSD * Math.min(100, Math.max(0, promotion.discount_value)) / 100;
  if (promotion.discount_type === "fixed_usd") return Math.max(0, promotion.discount_value);
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
  return items.slice()
    .filter((item) => !item.is_gift && number(item.line_subtotal_final_usd) > 0)
    .sort((a, b) => number(b.line_subtotal_final_usd) - number(a.line_subtotal_final_usd))[0] || null;
}

function applyPromotionDiscountToItem(item, promotion, discountUSD, scope) {
  const available = number(item && item.line_subtotal_final_usd);
  const applied = Math.min(available, Math.max(0, discountUSD));
  if (!item || applied <= 0) return 0;
  const label = discountLabel(promotion);
  item.line_discount_usd = number(item.line_discount_usd) + applied;
  if (scope === "cart") item.cart_discount_usd = number(item.cart_discount_usd) + applied;
  item.line_subtotal_final_usd = Math.max(0, available - applied);
  item.unit_price_final_usd = lineQuantity(item) > 0 ? item.line_subtotal_final_usd / lineQuantity(item) : number(item.unit_price_final_usd);
  item.promotion = promotion;
  item.promotion_label = item.promotion_label && !item.promotion_label.includes(label)
    ? `${item.promotion_label} / ${label}`
    : item.promotion_label || label;
  return applied;
}

function couponLabel(coupon) {
  if (!coupon) return "";
  if (coupon.customer_message) return coupon.customer_message;
  if (coupon.scope === COUPON_SCOPES.FREE_SHIPPING) return "Envio gratis";
  if (coupon.discount_type === "percentage") return `${coupon.discount_value}% de descuento`;
  if (coupon.discount_type === "fixed_usd") return `${coupon.discount_value.toFixed(2)} USD de descuento`;
  return coupon.name || coupon.code || "Cupon manual";
}

function applyCouponDiscountToItem(item, coupon, discountUSD) {
  const available = number(item && item.line_subtotal_final_usd);
  const applied = Math.min(available, Math.max(0, discountUSD));
  if (!item || applied <= 0) return 0;
  item.line_discount_usd = number(item.line_discount_usd) + applied;
  item.coupon_discount_usd = number(item.coupon_discount_usd) + applied;
  item.line_subtotal_final_usd = Math.max(0, available - applied);
  item.unit_price_final_usd = lineQuantity(item) > 0 ? item.line_subtotal_final_usd / lineQuantity(item) : number(item.unit_price_final_usd);
  item.coupon = coupon;
  item.coupon_label = couponLabel(coupon);
  return applied;
}

function addAppliedPromotion(appliedPromotions, promotion, discountUSD, item, scope) {
  if (!promotion || discountUSD <= 0 || !item) return;
  appliedPromotions.push({
    id: promotion.id || "",
    name: promotion.name || discountLabel(promotion),
    label: discountLabel(promotion),
    type: promotion.type,
    discount_usd: discountUSD,
    product_id: item.id || "",
    only_usd: Boolean(item.only_usd),
    scope: scope || "",
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
  }, { localCurrencyTotal: 0, usdOnlyTotal: 0, usdOnlyDiscountTotal: 0, localCurrencyDiscountTotal: 0, discountTotalUSD: 0 });
}

function calculateOriginalTotals(items) {
  return items.reduce((totals, item) => {
    if (item.is_gift) return totals;
    const lineOriginal = number(item.line_subtotal_original_usd);
    if (item.only_usd) totals.usdOnlyOriginalTotal += lineOriginal;
    else totals.localCurrencyOriginalTotal += lineOriginal;
    return totals;
  }, { localCurrencyOriginalTotal: 0, usdOnlyOriginalTotal: 0 });
}

function applyGroupPromotions(items, activePromotions, appliedPromotions) {
  ["subcategory", "category"].forEach((level) => {
    const candidates = activePromotions
      .filter((promotion) => isGroupPromotion(promotion, level))
      .map((promotion) => {
        const eligibleItems = items.filter((item) => !item.is_gift && !item.promotion && appliesToItem(promotion, item) && number(item.line_subtotal_final_usd) > 0);
        const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + number(item.line_subtotal_final_usd), 0);
        const targetItem = highestValueItem(eligibleItems);
        const discount = Math.min(number(targetItem && targetItem.line_subtotal_final_usd), discountForSubtotal(eligibleSubtotal, promotion));
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

function calculateCartPromotions(cart, promotions, now) {
  const activePromotions = (promotions || []).map(normalizePromotion)
    .filter((promotion) => promotion.active !== false && todayInRange(promotion, now));
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
    return Object.assign({}, item, {
      promotion: best ? best.promotion : null,
      promotion_label: best ? discountLabel(best.promotion) : "",
      line_subtotal_original_usd: lineSubtotalOriginalUSD,
      line_discount_usd: lineDiscountUSD,
      line_subtotal_final_usd: lineSubtotalFinalUSD,
      unit_price_original_usd: unitPrice,
      unit_price_final_usd: quantity > 0 ? lineSubtotalFinalUSD / quantity : unitPrice,
    });
  });
  applyGroupPromotions(items, activePromotions, appliedPromotions);
  const totalsAfterItemPromos = recalculateTotals(items);
  const itemDiscountTotalUSD = totalsAfterItemPromos.discountTotalUSD;
  const subtotalAfterItemDiscountUSD = Math.max(0, subtotalOriginalUSD - itemDiscountTotalUSD);
  let cartDiscountUSD = 0;
  let cartPromotion = null;
  const cartPromotions = activePromotions
    .filter((promotion) => promotion.type === PROMOTION_TYPES.CART_SUBTOTAL || promotion.scope === "cart")
    .filter((promotion) => subtotalAfterItemDiscountUSD >= promotion.min_subtotal_usd)
    .sort((a, b) => (b.min_subtotal_usd - a.min_subtotal_usd) || (b.priority - a.priority));
  const highestCartPromotion = cartPromotions[0] || null;
  if (highestCartPromotion) {
    cartDiscountUSD = Math.min(subtotalAfterItemDiscountUSD, discountForSubtotal(subtotalAfterItemDiscountUSD, highestCartPromotion));
    cartPromotion = cartDiscountUSD > 0 ? highestCartPromotion : null;
  }
  if (cartDiscountUSD > 0 && cartPromotion) {
    const targetItem = highestValueItem(items);
    const applied = applyPromotionDiscountToItem(targetItem, cartPromotion, cartDiscountUSD, "cart");
    addAppliedPromotion(appliedPromotions, cartPromotion, applied, targetItem, "cart");
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
    promotionSummary: appliedPromotions.map((promo) => `${promo.label || promo.name}: $${number(promo.discount_usd).toFixed(2)} USD`).join("\n"),
  };
}

function couponIsSoldOut(coupon) {
  return coupon.unlimited_uses === false && coupon.max_uses > 0 && coupon.used_count >= coupon.max_uses;
}

function couponEligibleItems(coupon, items) {
  if (!coupon) return [];
  return (items || []).filter((item) => {
    if (item && item.is_gift) return false;
    if (coupon.scope === COUPON_SCOPES.CART) return true;
    if (coupon.scope === COUPON_SCOPES.PRODUCT) return coupon.product && coupon.product === item.id;
    if (coupon.scope === COUPON_SCOPES.CATEGORY) return coupon.category && coupon.category === item.category;
    if (coupon.scope === COUPON_SCOPES.SUBCATEGORY) return coupon.subcategory && coupon.subcategory === item.subcategory;
    return false;
  });
}

function couponStatusForCart(coupon, baseTotals, deliveryMethod, shippingUSD, now) {
  if (!coupon || coupon.active === false || !todayInRange(coupon, now) || couponIsSoldOut(coupon)) return { ok: false };
  if (coupon.scope === COUPON_SCOPES.FREE_SHIPPING && (deliveryMethod !== "delivery" || shippingUSD <= 0)) return { ok: false };
  if (coupon.min_subtotal_usd > 0 && number(baseTotals && baseTotals.subtotalOriginalUSD) < coupon.min_subtotal_usd) return { ok: false };
  return { ok: true };
}

function calculateCouponOnBaseline(cart, coupon, deliveryMethod, shippingUSD, now) {
  const baseTotals = calculateCartPromotions(cart, [], now);
  const normalizedCoupon = normalizeCoupon(coupon || {});
  const status = couponStatusForCart(normalizedCoupon, baseTotals, deliveryMethod, shippingUSD, now);
  if (!status.ok) return Object.assign({}, baseTotals, { manualCoupon: normalizedCoupon, couponDiscountUSD: 0, shippingDiscountUSD: 0, couponApplied: false });
  if (normalizedCoupon.scope === COUPON_SCOPES.FREE_SHIPPING) {
    const shippingDiscountUSD = deliveryMethod === "delivery" ? Math.max(0, shippingUSD) : 0;
    return Object.assign({}, baseTotals, {
      manualCoupon: normalizedCoupon,
      couponDiscountUSD: 0,
      shippingDiscountUSD,
      couponApplied: shippingDiscountUSD > 0,
      couponSummary: shippingDiscountUSD > 0 ? `${normalizedCoupon.code}: envio gratis` : "",
    });
  }
  const eligibleItems = couponEligibleItems(normalizedCoupon, baseTotals.items);
  const eligibleSubtotal = eligibleItems.reduce((sum, item) => sum + number(item.line_subtotal_final_usd), 0);
  if (eligibleSubtotal <= 0) return Object.assign({}, baseTotals, { manualCoupon: normalizedCoupon, couponDiscountUSD: 0, shippingDiscountUSD: 0, couponApplied: false });
  let targetDiscount = normalizedCoupon.discount_type === "percentage"
    ? eligibleSubtotal * Math.min(100, Math.max(0, normalizedCoupon.discount_value)) / 100
    : normalizedCoupon.discount_type === "fixed_usd" ? Math.max(0, normalizedCoupon.discount_value) : 0;
  targetDiscount = Math.min(eligibleSubtotal, targetDiscount);
  let remaining = targetDiscount;
  const sortedItems = eligibleItems.slice().sort((a, b) => number(b.line_subtotal_final_usd) - number(a.line_subtotal_final_usd));
  sortedItems.forEach((item, index) => {
    if (remaining <= 0) return;
    const available = number(item.line_subtotal_final_usd);
    const share = index === sortedItems.length - 1 ? remaining : Math.min(available, targetDiscount * (available / eligibleSubtotal));
    remaining = Math.max(0, remaining - applyCouponDiscountToItem(item, normalizedCoupon, share));
  });
  const finalTotals = recalculateTotals(baseTotals.items);
  const discountTotalUSD = finalTotals.discountTotalUSD;
  const subtotalFinalUSD = Math.max(0, baseTotals.subtotalOriginalUSD - discountTotalUSD);
  return Object.assign({}, baseTotals, {
    discountTotalUSD,
    usdOnlyDiscountTotal: finalTotals.usdOnlyDiscountTotal,
    localCurrencyDiscountTotal: finalTotals.localCurrencyDiscountTotal,
    subtotalFinalUSD,
    subtotalAfterDiscountUSD: subtotalFinalUSD,
    localCurrencyTotal: finalTotals.localCurrencyTotal,
    usdOnlyTotal: finalTotals.usdOnlyTotal,
    visualTotalUSD: finalTotals.localCurrencyTotal,
    manualCoupon: normalizedCoupon,
    couponDiscountUSD: targetDiscount,
    shippingDiscountUSD: 0,
    couponApplied: targetDiscount > 0,
    couponSummary: targetDiscount > 0 ? `${normalizedCoupon.code}: $${targetDiscount.toFixed(2)} USD` : "",
    promotionSummary: targetDiscount > 0 ? `Cupon ${normalizedCoupon.code}: $${targetDiscount.toFixed(2)} USD` : "",
    appliedPromotions: targetDiscount > 0 ? [{
      id: normalizedCoupon.id || "",
      name: normalizedCoupon.name || normalizedCoupon.code,
      label: `Cupon ${normalizedCoupon.code}`,
      type: "manual_coupon",
      discount_usd: targetDiscount,
      scope: normalizedCoupon.scope,
    }] : [],
  });
}

function calculateCartWithManualCoupon(cart, promotions, coupon, deliveryMethod, shippingUSD, now) {
  const automaticTotals = calculateCartPromotions(cart, promotions, now);
  if (!coupon) return Object.assign({}, automaticTotals, {
    couponWinner: "automatic", couponDiscountUSD: 0, shippingDiscountUSD: 0,
    shippingOriginalUSD: shippingUSD, shippingFinalUSD: shippingUSD,
  });
  const couponTotals = calculateCouponOnBaseline(cart, coupon, deliveryMethod, shippingUSD, now);
  const automaticBenefit = number(automaticTotals.discountTotalUSD);
  const couponBenefit = number(couponTotals.couponDiscountUSD) + number(couponTotals.shippingDiscountUSD);
  const couponWins = couponTotals.couponApplied && couponBenefit > automaticBenefit;
  if (!couponWins) return Object.assign({}, automaticTotals, {
    manualCoupon: couponTotals.manualCoupon,
    couponWinner: automaticBenefit > 0 ? "automatic" : "none",
    couponDiscountUSD: 0,
    shippingDiscountUSD: 0,
    shippingOriginalUSD: shippingUSD,
    shippingFinalUSD: shippingUSD,
  });
  return Object.assign({}, couponTotals, {
    couponWinner: "manual_coupon",
    shippingOriginalUSD: shippingUSD,
    shippingFinalUSD: Math.max(0, shippingUSD - number(couponTotals.shippingDiscountUSD)),
    totalBenefitUSD: couponBenefit,
  });
}

function variationsForProduct(app, productId) {
  return findRecordsStrict(app, "product_variations", "product = {:product}", "sort_order", 500, 0, { product: productId });
}

function productTaxonomyAvailable(app, storeId, product) {
  for (const collection of ["categories", "subcategories"]) {
    const id = relationId(product, collection === "categories" ? "category" : "subcategory");
    if (!id) continue;
    const record = findRecord(app, collection, id);
    if (!record || relationId(record, "store") !== storeId || recordValue(record, "active") === false) return false;
  }
  return true;
}

function resolveProductLine(app, store, requested, now) {
  const product = findRecord(app, "products", requested.productId);
  if (!product || relationId(product, "store") !== store.id || recordValue(product, "active") === false
    || !productTaxonomyAvailable(app, store.id, product)) throw codedError("order_unavailable", 422);
  const variations = variationsForProduct(app, product.id);
  const usesVariations = recordBool(product, "has_variations") || variations.length > 0;
  const variation = requested.variationId ? variations.find((entry) => entry.id === requested.variationId) || null : null;
  if ((usesVariations && !variation) || (!usesVariations && requested.variationId) || (variation && recordValue(variation, "active") === false)) {
    throw codedError("order_unavailable", 422);
  }
  const price = priceWatch.effectiveCommercialPrice(product, variation);
  if (!(number(price && price.effective) > 0)) throw codedError("order_unavailable", 422);
  const tracksStock = recordValue(product, "track_stock") !== false;
  const stockRecord = variation || product;
  const allowPreorder = recordBool(stockRecord, "allow_preorder") || (!variation && recordBool(product, "allow_preorder"));
  const stock = recordNumber(stockRecord, "stock");
  if (tracksStock && !allowPreorder && (stock <= 0 || requested.quantity > stock)) throw codedError("order_unavailable", 422);
  const availability = expiration.evaluateCommercialAvailability({ store, product, variations, variation, now });
  if (!availability.available) throw codedError("order_unavailable", 422);
  const variationLabel = variation
    ? bounded(`${recordString(variation, "variation_type") || "Variacion"}: ${recordString(variation, "value") || "Sin valor"}`, 180)
    : "";
  const variationCostRaw = variation ? recordValue(variation, "cost_usd") : undefined;
  const cost = variationCostRaw === undefined || variationCostRaw === null || variationCostRaw === ""
    ? recordNumber(product, "cost_usd") : number(variationCostRaw);
  return {
    id: product.id,
    product_id: product.id,
    variation_id: variation ? variation.id : "",
    title: bounded(recordString(product, "name") || "Producto", 180),
    variation_label: variationLabel,
    variation_ref: variation ? bounded(recordString(variation, "internal_ref"), 180) : "",
    image_url: recordFileUrl(variation, "image") || recordFileUrl(product, "images", "image_order"),
    price: number(price.effective),
    regular_price_usd: number(price.regular),
    is_offer: price.offer_active === true,
    quantity: requested.quantity,
    only_usd: recordBool(product, "only_usd"),
    category: relationId(product, "category"),
    subcategory: relationId(product, "subcategory"),
    cost_usd: cost,
    stock,
    track_stock: tracksStock,
    preorder: allowPreorder,
    is_gift: false,
    productRecord: product,
    variationRecord: variation,
  };
}

function recordToPromotion(record) {
  return normalizePromotion({
    id: record.id,
    name: recordString(record, "name"),
    active: recordValue(record, "active") !== false,
    type: recordString(record, "type"),
    scope: recordString(record, "scope"),
    discount_type: recordString(record, "discount_type"),
    discount_value: recordNumber(record, "discount_value"),
    buy_qty: recordNumber(record, "buy_qty"),
    pay_qty: recordNumber(record, "pay_qty"),
    min_qty: recordNumber(record, "min_qty"),
    min_subtotal_usd: recordNumber(record, "min_subtotal_usd"),
    priority: recordNumber(record, "priority"),
    product: relationId(record, "product"),
    category: relationId(record, "category"),
    subcategory: relationId(record, "subcategory"),
    starts_at: recordString(record, "starts_at"),
    ends_at: recordString(record, "ends_at"),
    badge_text: bounded(recordString(record, "badge_text"), 160),
  });
}

function recordToCoupon(record) {
  if (!record) return null;
  return normalizeCoupon({
    id: record.id,
    code: recordString(record, "code"),
    name: recordString(record, "name"),
    customer_message: bounded(recordString(record, "customer_message"), 220),
    active: recordValue(record, "active") !== false,
    scope: recordString(record, "scope"),
    discount_type: recordString(record, "discount_type"),
    discount_value: recordNumber(record, "discount_value"),
    min_subtotal_usd: recordNumber(record, "min_subtotal_usd"),
    product: relationId(record, "product"),
    category: relationId(record, "category"),
    subcategory: relationId(record, "subcategory"),
    starts_at: recordString(record, "starts_at"),
    ends_at: recordString(record, "ends_at"),
    unlimited_uses: recordValue(record, "unlimited_uses") !== false,
    max_uses: recordNumber(record, "max_uses"),
    used_count: recordNumber(record, "used_count"),
  });
}

function snapshotPromotion(promotion) {
  if (!promotion) return null;
  const normalized = normalizePromotion(promotion);
  return {
    id: bounded(normalized.id, 80),
    name: bounded(normalized.name, 180),
    active: true,
    type: normalized.type,
    scope: normalized.scope,
    discount_type: normalized.discount_type,
    discount_value: number(normalized.discount_value),
    buy_qty: number(normalized.buy_qty),
    pay_qty: number(normalized.pay_qty),
    min_qty: number(normalized.min_qty),
    min_subtotal_usd: number(normalized.min_subtotal_usd),
    priority: number(normalized.priority),
    product: bounded(normalized.product, 80),
    category: bounded(normalized.category, 80),
    subcategory: bounded(normalized.subcategory, 80),
    starts_at: "",
    ends_at: "",
    badge_text: bounded(normalized.badge_text, 160),
  };
}

function snapshotCoupon(coupon) {
  if (!coupon) return null;
  const normalized = normalizeCoupon(coupon);
  return {
    id: bounded(normalized.id, 80),
    code: bounded(normalized.code, 60),
    name: bounded(normalized.name, 180),
    customer_message: bounded(normalized.customer_message, 220),
    active: true,
    scope: normalized.scope,
    discount_type: normalized.discount_type,
    discount_value: number(normalized.discount_value),
    min_subtotal_usd: number(normalized.min_subtotal_usd),
    product: bounded(normalized.product, 80),
    category: bounded(normalized.category, 80),
    subcategory: bounded(normalized.subcategory, 80),
    starts_at: "",
    ends_at: "",
    unlimited_uses: true,
    max_uses: 0,
    used_count: 0,
  };
}

function lineEconomicSnapshot(item) {
  if (!item || item.is_gift) return null;
  const existing = item.economic_snapshot && typeof item.economic_snapshot === "object" ? item.economic_snapshot : null;
  if (existing) return existing;
  return {
    version: ECONOMIC_SNAPSHOT_VERSION,
    algorithm: ECONOMIC_SNAPSHOT_ALGORITHM,
    product_id: bounded(item.product_id || item.id, 80),
    variation_id: bounded(item.variation_id, 80),
    base_unit_price_usd: number(item.unit_price_original_usd === undefined ? item.price : item.unit_price_original_usd),
    cost_unit_usd: number(item.cost_usd),
    only_usd: Boolean(item.only_usd),
    category_id: bounded(item.category, 80),
    subcategory_id: bounded(item.subcategory, 80),
  };
}

function orderEconomicSnapshot(plan) {
  const totals = plan && plan.totals ? plan.totals : {};
  const winner = totals.couponWinner || (number(totals.discountTotalUSD) > 0 ? "automatic" : "none");
  const appliedIds = new Set((totals.appliedPromotions || [])
    .filter((entry) => entry && entry.type !== "manual_coupon" && entry.id)
    .map((entry) => String(entry.id)));
  const promotions = (plan.promotions || [])
    .filter((promotion) => appliedIds.has(String(promotion && promotion.id || "")))
    .map(snapshotPromotion)
    .filter(Boolean);
  return {
    version: ECONOMIC_SNAPSHOT_VERSION,
    algorithm: ECONOMIC_SNAPSHOT_ALGORITHM,
    winner,
    promotions,
    coupon: winner === "manual_coupon" ? snapshotCoupon(plan.coupon) : null,
    shipping: {
      delivery_method: bounded(plan.parsed && plan.parsed.deliveryMethod, 40),
      zone_id: bounded(plan.shipping && plan.shipping.record && plan.shipping.record.id, 80),
      original_usd: number(totals.shippingOriginalUSD),
      final_usd: number(totals.shippingFinalUSD),
      discount_usd: number(totals.shippingDiscountUSD),
    },
    currency: {
      id: bounded(plan.currency && plan.currency.record && plan.currency.record.id, 80),
      code: bounded(plan.currency && plan.currency.code, 20),
      rate: number(plan.currency && plan.currency.rate),
    },
  };
}

function resolveCurrency(app, storeId, currencyId) {
  let currency = currencyId ? findRecord(app, "currencies", currencyId) : null;
  if (!currency) {
    currency = findRecordsStrict(app, "currencies", "store = {:store} && active = true && is_default = true", "-updated", 1, 0, { store: storeId })[0]
      || findRecordsStrict(app, "currencies", "store = {:store} && active = true && code = 'USD'", "-updated", 1, 0, { store: storeId })[0]
      || null;
  }
  if (!currency || relationId(currency, "store") !== storeId || recordValue(currency, "active") === false) throw codedError("order_unavailable", 422);
  const rate = recordNumber(currency, "exchange_rate");
  if (!(rate > 0)) throw codedError("order_unavailable", 422);
  return { record: currency, code: recordString(currency, "code").toUpperCase(), rate };
}

function resolveShipping(app, storeId, deliveryMethod, shippingZoneId) {
  if (deliveryMethod !== "delivery") return { record: null, amount: 0, name: "" };
  const zone = findRecord(app, "shipping_zones", shippingZoneId);
  if (!zone || relationId(zone, "store") !== storeId || recordValue(zone, "active") === false) throw codedError("order_unavailable", 422);
  const amount = recordNumber(zone, "price_usd");
  if (amount < 0) throw codedError("order_unavailable", 422);
  return {
    record: zone,
    amount,
    name: bounded(`${recordString(zone, "municipality")} / ${recordString(zone, "zone") || recordString(zone, "municipality")}`, 240),
  };
}

function resolveGift(app, storeId, requested, productsSubtotalUSD) {
  if (!requested) return null;
  const gift = findRecord(app, "gifts", requested.giftId);
  if (!gift || relationId(gift, "store") !== storeId || recordValue(gift, "active") === false || recordNumber(gift, "stock") <= 0) {
    throw codedError("order_unavailable", 422);
  }
  const minimum = recordNumber(gift, "min_order_usd");
  if (productsSubtotalUSD < minimum) throw codedError("order_unavailable", 422);
  return {
    id: `gift-${gift.id}`,
    gift_id: gift.id,
    title: bounded(recordString(gift, "name") || "Regalo", 180),
    quantity: 1,
    price: 0,
    only_usd: false,
    cost_usd: 0,
    is_gift: true,
    gift_min_order_usd: minimum,
    image_url: recordFileUrl(gift, "image"),
    giftRecord: gift,
  };
}

function activeSettings(app, storeId) {
  return findRecordsStrict(app, "settings", "store = {:store} && active = true", "-updated", 1, 0, { store: storeId })[0] || null;
}

function buildCheckoutPlan(app, parsed, now) {
  const store = findRecord(app, "stores", parsed.storeId);
  const storeStatus = recordString(store, "status").toLowerCase();
  if (!store || recordValue(store, "active") === false || (storeStatus && storeStatus !== "active")) throw codedError("order_unavailable", 422);
  const settings = activeSettings(app, store.id);
  if (!settings || !ordersAllowedBySettings(settings, now)) throw codedError("order_unavailable", 422);
  const currency = resolveCurrency(app, store.id, parsed.currencyId);
  const shipping = resolveShipping(app, store.id, parsed.deliveryMethod, parsed.shippingZoneId);
  const productItems = parsed.items.filter((item) => !item.isGift).map((item) => resolveProductLine(app, store, item, now));
  const promotions = findRecordsStrict(app, "automatic_promotions", "store = {:store} && active = true", "priority,-updated", 200, 0, { store: store.id }).map(recordToPromotion);
  let couponRecord = null;
  if (parsed.couponCode) {
    couponRecord = findRecordsStrict(app, "manual_coupons", "store = {:store} && code = {:code}", "-updated", 1, 0, { store: store.id, code: parsed.couponCode })[0] || null;
  }
  const coupon = recordToCoupon(couponRecord);
  const totals = calculateCartWithManualCoupon(productItems, promotions, coupon, parsed.deliveryMethod, shipping.amount, now);
  const giftRequest = parsed.items.find((item) => item.isGift) || null;
  const gift = resolveGift(app, store.id, giftRequest, totals.subtotalOriginalUSD);
  if (gift) totals.items.push(Object.assign({}, gift, {
    line_subtotal_original_usd: 0,
    line_discount_usd: 0,
    line_subtotal_final_usd: 0,
    unit_price_original_usd: 0,
    unit_price_final_usd: 0,
  }));
  const plan = { store, settings, currency, shipping, couponRecord, coupon, totals, promotions, parsed };
  plan.economicSnapshot = orderEconomicSnapshot(plan);
  return plan;
}

function normalizeOrderPrefix(value) {
  const clean = String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
  return clean || "PP";
}

function randomOrderNumber(app, settings) {
  const prefix = normalizeOrderPrefix(recordString(settings, "order_prefix"));
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = $security.randomStringWithAlphabet(5, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789");
    const candidate = `${prefix}-${suffix}`;
    const exists = findRecordsStrict(app, "orders", "order_number = {:number}", "", 1, 0, { number: candidate }).length > 0;
    if (!exists) return candidate;
  }
  throw codedError("order_conflict", 409);
}

function isOneToOne(currency) {
  return currency.code === "USD" || Math.abs(currency.rate - 1) < ONE_TO_ONE_RATE_TOLERANCE;
}

function selectedMoney(value, onlyUsd, currency) {
  return !isOneToOne(currency) && onlyUsd ? number(value) : number(value) * currency.rate;
}

function applyCanonicalItemValues(record, item, orderId, currency) {
  const quantity = item.is_gift ? 1 : number(item.quantity);
  const unitAutomatic = item.is_gift ? 0 : number(item.unit_price_after_automatic_discount_usd === undefined
    ? item.unit_price_final_usd : item.unit_price_after_automatic_discount_usd);
  const lineAutomatic = item.is_gift ? 0 : number(item.line_subtotal_after_automatic_discount_usd === undefined
    ? item.line_subtotal_final_usd : item.line_subtotal_after_automatic_discount_usd);
  const hasManualAdjustment = !item.is_gift && item.has_manual_price_adjustment === true;
  const unitFinal = hasManualAdjustment ? number(item.manual_final_unit_price_usd) : unitAutomatic;
  const lineFinal = item.is_gift ? 0 : unitFinal * quantity;
  const manualUnit = hasManualAdjustment ? unitFinal - unitAutomatic : 0;
  const manualTotal = manualUnit * quantity;
  const cost = item.is_gift ? 0 : number(item.cost_usd);
  const unitProfit = item.is_gift ? 0 : unitFinal - cost;
  const snapshot = lineEconomicSnapshot(item);
  record.set("order", orderId);
  record.set("product", item.is_gift ? "" : item.product_id);
  record.set("product_ref", item.is_gift ? "" : item.product_id);
  record.set("variation", item.is_gift ? "" : item.variation_id || "");
  record.set("gift", item.is_gift ? item.gift_id : "");
  record.set("is_gift", item.is_gift === true);
  record.set("gift_min_order_usd", item.is_gift ? number(item.gift_min_order_usd) : 0);
  record.set("product_name", bounded(item.title || (item.is_gift ? "Regalo" : "Producto"), 180));
  record.set("variation_name", item.is_gift ? "" : bounded(item.variation_label, 180));
  record.set("variation_label", item.is_gift ? "" : bounded(item.variation_label, 180));
  record.set("variation_ref", item.is_gift ? "" : bounded(item.variation_ref, 180));
  record.set("item_image_url", bounded(item.image_url, 800));
  record.set("item_image_alt", bounded(item.title || "Producto", 180));
  record.set("quantity", quantity);
  record.set("unit_price_selected_currency", selectedMoney(unitFinal, item.only_usd, currency));
  record.set("unit_price_usd", unitFinal);
  record.set("variation_price_usd", unitFinal);
  record.set("unit_price_original_usd", item.is_gift ? 0 : number(item.unit_price_original_usd));
  record.set("unit_price_after_automatic_discount_usd", unitAutomatic);
  record.set("unit_price_final_usd", unitFinal);
  record.set("unit_profit_usd", unitProfit);
  record.set("line_profit_usd", unitProfit * quantity);
  record.set("line_total_usd", lineFinal);
  record.set("line_total_selected_currency", selectedMoney(lineFinal, item.only_usd, currency));
  record.set("line_subtotal_original_usd", item.is_gift ? 0 : number(item.line_subtotal_original_usd));
  record.set("line_discount_usd", item.is_gift ? 0 : number(item.line_discount_usd));
  record.set("line_subtotal_after_automatic_discount_usd", lineAutomatic);
  record.set("line_subtotal_final_usd", lineFinal);
  record.set("promotion_id", item.is_gift ? "" : bounded(item.promotion && item.promotion.id, 80));
  record.set("promotion_name", item.is_gift ? "" : bounded(item.promotion && (item.promotion.name || discountLabel(item.promotion)), 180));
  record.set("promotion_type", item.is_gift ? "" : bounded(item.promotion && item.promotion.type, 80));
  record.set("coupon_id", item.is_gift ? "" : bounded(item.coupon && item.coupon.id, 80));
  record.set("coupon_code", item.is_gift ? "" : bounded(item.coupon && item.coupon.code, 80));
  record.set("coupon_discount_usd", item.is_gift ? 0 : number(item.coupon_discount_usd));
  record.set("only_usd", item.is_gift ? false : Boolean(item.only_usd));
  record.set("economic_snapshot_version", snapshot ? Math.max(0, number(snapshot.version)) : 0);
  record.set("economic_snapshot_json", snapshot || null);
  record.set("has_manual_price_adjustment", hasManualAdjustment);
  record.set("manual_final_unit_price_usd", hasManualAdjustment ? unitFinal : 0);
  record.set("manual_adjustment_unit_usd", manualUnit);
  record.set("manual_adjustment_total_usd", manualTotal);
  record.set("manual_adjustment_reason_code", hasManualAdjustment ? bounded(item.manual_adjustment_reason_code, 80) : "");
  record.set("manual_adjustment_reason_text", hasManualAdjustment ? bounded(item.manual_adjustment_reason_text, 500) : "");
  record.set("manual_adjusted_by", hasManualAdjustment ? bounded(item.manual_adjusted_by, 80) : "");
  record.set("manual_adjusted_at", hasManualAdjustment ? bounded(item.manual_adjusted_at, 80) : "");
  return record;
}

function setCanonicalOrderTotals(order, plan) {
  const totals = plan.totals;
  const currency = plan.currency;
  const shippingOriginal = number(totals.shippingOriginalUSD);
  const shippingFinal = number(totals.shippingFinalUSD);
  const subtotal = number(totals.subtotalFinalUSD);
  const total = subtotal + shippingFinal;
  const separate = !isOneToOne(currency);
  order.set("currency", currency.record.id);
  order.set("shipping_zone", plan.shipping.record ? plan.shipping.record.id : "");
  order.set("subtotal", subtotal);
  order.set("shipping", shippingFinal);
  order.set("total", total);
  order.set("usd_total", total);
  order.set("subtotal_original_usd", number(totals.subtotalOriginalUSD));
  order.set("discount_total_usd", number(totals.discountTotalUSD));
  order.set("subtotal_after_discount_usd", subtotal);
  order.set("subtotal_before_manual_adjustments_usd", subtotal);
  order.set("manual_adjustment_total_usd", 0);
  order.set("subtotal_after_manual_adjustments_usd", subtotal);
  order.set("promotion_summary", bounded(totals.promotionSummary, 2000));
  order.set("coupon_id", totals.couponWinner === "manual_coupon" ? bounded(plan.coupon && plan.coupon.id, 80) : "");
  order.set("coupon_code", totals.couponWinner === "manual_coupon" ? bounded(plan.coupon && plan.coupon.code, 60) : "");
  order.set("coupon_discount_usd", totals.couponWinner === "manual_coupon" ? number(totals.couponDiscountUSD) : 0);
  order.set("coupon_summary", totals.couponWinner === "manual_coupon" ? bounded(totals.couponSummary || totals.promotionSummary, 1000) : "");
  order.set("shipping_original_usd", shippingOriginal);
  order.set("shipping_discount_usd", number(totals.shippingDiscountUSD));
  order.set("mixed_payment", separate && number(totals.usdOnlyTotal) > 0 && number(totals.localCurrencyTotal) > 0);
  order.set("local_currency_total", selectedMoney(number(totals.localCurrencyTotal), false, currency));
  order.set("usd_only_total", separate ? number(totals.usdOnlyTotal) : 0);
  order.set("shipping_cup", selectedMoney(shippingFinal, false, currency));
  order.set("exchange_rate_used", currency.rate);
  order.set("economic_snapshot_version", ECONOMIC_SNAPSHOT_VERSION);
  order.set("economic_snapshot_json", plan.economicSnapshot || orderEconomicSnapshot(plan));
  return order;
}

function createOrderRecord(app, parsed, plan) {
  const order = new Record(app.findCollectionByNameOrId("orders"), {});
  order.set("store", plan.store.id);
  order.set("order_number", randomOrderNumber(app, plan.settings));
  order.set("receipt_token", parsed.idempotencyKey);
  order.set("customer_name", parsed.customerName);
  order.set("customer_phone", parsed.customerPhone);
  order.set("customer_address", parsed.customerAddress);
  order.set("delivery_method", parsed.deliveryMethod);
  order.set("status", "pending");
  order.set("whatsapp_sent", false);
  order.set("stock_deducted", false);
  const notes = [
    parsed.customerMunicipality ? `Municipio: ${parsed.customerMunicipality}` : "",
    parsed.customerNote ? `Nota cliente: ${parsed.customerNote}` : "",
    `Moneda elegida cliente: ${plan.currency.code}`,
  ].filter(Boolean).join("\n");
  order.set("notes", bounded(notes, 1500));
  setCanonicalOrderTotals(order, plan);
  app.save(order);
  return order;
}

function createOrderItems(app, order, plan) {
  return plan.totals.items.map((item) => {
    const record = new Record(app.findCollectionByNameOrId("order_items"), {});
    applyCanonicalItemValues(record, item, order.id, plan.currency);
    app.save(record);
    return record;
  });
}

function createCouponUsage(app, order, parsed, plan) {
  if (plan.totals.couponWinner !== "manual_coupon" || !plan.couponRecord) return;
  const existing = findRecordsStrict(app, "manual_coupon_usages", "order = {:order}", "created", 200, 0, { order: order.id })
    .find((entry) => relationId(entry, "coupon") === plan.couponRecord.id);
  if (existing) return;
  const usage = new Record(app.findCollectionByNameOrId("manual_coupon_usages"), {});
  usage.set("coupon", plan.couponRecord.id);
  usage.set("order", order.id);
  usage.set("coupon_code", plan.coupon.code);
  usage.set("customer_name", parsed.customerName);
  usage.set("order_number", recordString(order, "order_number"));
  usage.set("discount_usd", number(plan.totals.couponDiscountUSD));
  usage.set("shipping_discount_usd", number(plan.totals.shippingDiscountUSD));
  app.save(usage);
  plan.couponRecord.set("used_count", recordNumber(plan.couponRecord, "used_count") + 1);
  app.save(plan.couponRecord);
}

function createOrderNotification(app, order, parsed, plan) {
  if (recordValue(plan.settings, "notifications_enabled") === false || recordValue(plan.settings, "notify_new_order") === false) return;
  const collection = app.findCollectionByNameOrId("store_notifications");
  const notification = new Record(collection, {});
  const subtotal = number(plan.totals.subtotalFinalUSD);
  const priorityEnabled = recordValue(plan.settings, "notification_priority_enabled") !== false;
  const importantMin = Math.max(0, recordNumber(plan.settings, "notification_priority_important_min_usd") || 50);
  const criticalMin = Math.max(importantMin, recordNumber(plan.settings, "notification_priority_critical_min_usd") || 100);
  const priority = !priorityEnabled ? "important" : subtotal >= criticalMin ? "critical" : subtotal >= importantMin ? "important" : "normal";
  const showSubtotal = recordValue(plan.settings, "notification_show_order_subtotal") !== false;
  const subtotalText = showSubtotal && subtotal > 0 ? ` - Productos: $${subtotal.toFixed(2)} USD sin envio` : "";
  notification.set("store", plan.store.id);
  notification.set("type", "new_order");
  notification.set("title", "Nuevo pedido recibido");
  notification.set("message", bounded(`Pedido #${recordString(order, "order_number")} por ${parsed.customerName}${subtotalText}`, 500));
  notification.set("status", "unread");
  notification.set("priority", priority);
  notification.set("target_url", bounded(`/t/${encodeURIComponent(recordString(plan.store, "slug"))}/admin/orders/${encodeURIComponent(order.id)}`, 500));
  notification.set("entity_collection", "orders");
  notification.set("entity_id", order.id);
  notification.set("metadata_json", {
    order_number: recordString(order, "order_number"),
    customer_name: parsed.customerName,
    products_subtotal_usd: subtotal,
    shipping_excluded: true,
    priority_rule: priority,
  });
  app.save(notification);
}

function responseItem(record) {
  return {
    id: record.id,
    product: relationId(record, "product"),
    variation: relationId(record, "variation"),
    gift: relationId(record, "gift"),
    title: recordString(record, "product_name"),
    product_name: recordString(record, "product_name"),
    variation_label: recordString(record, "variation_label"),
    variation_name: recordString(record, "variation_name"),
    quantity: recordNumber(record, "quantity"),
    price: recordNumber(record, "unit_price_final_usd"),
    unit_price_original_usd: recordNumber(record, "unit_price_original_usd"),
    unit_price_after_automatic_discount_usd: recordNumber(record, "unit_price_after_automatic_discount_usd"),
    unit_price_final_usd: recordNumber(record, "unit_price_final_usd"),
    line_subtotal_original_usd: recordNumber(record, "line_subtotal_original_usd"),
    line_discount_usd: recordNumber(record, "line_discount_usd"),
    line_subtotal_final_usd: recordNumber(record, "line_subtotal_final_usd"),
    line_total_usd: recordNumber(record, "line_total_usd"),
    has_manual_price_adjustment: recordBool(record, "has_manual_price_adjustment"),
    manual_final_unit_price_usd: recordNumber(record, "manual_final_unit_price_usd"),
    manual_adjustment_unit_usd: recordNumber(record, "manual_adjustment_unit_usd"),
    manual_adjustment_total_usd: recordNumber(record, "manual_adjustment_total_usd"),
    only_usd: recordBool(record, "only_usd"),
    is_gift: recordBool(record, "is_gift"),
  };
}

function responseOrder(order, items, shippingName, idempotent) {
  const subtotal = recordNumber(order, "subtotal");
  const shipping = recordNumber(order, "shipping");
  const total = recordNumber(order, "total");
  const exchangeRate = recordNumber(order, "exchange_rate_used") || 1;
  const localCurrencyTotalUSD = recordNumber(order, "local_currency_total") / exchangeRate;
  return {
    ok: true,
    idempotent: idempotent === true,
    order: {
      id: order.id,
      order_number: recordString(order, "order_number"),
      receipt_token: recordString(order, "receipt_token"),
      customer_name: recordString(order, "customer_name"),
      customer_phone: recordString(order, "customer_phone"),
      customer_address: recordString(order, "customer_address"),
      delivery_method: recordString(order, "delivery_method"),
      subtotal,
      shipping,
      total,
      usd_total: recordNumber(order, "usd_total"),
      subtotal_original_usd: recordNumber(order, "subtotal_original_usd"),
      discount_total_usd: recordNumber(order, "discount_total_usd"),
      subtotal_after_discount_usd: recordNumber(order, "subtotal_after_discount_usd"),
      subtotal_before_manual_adjustments_usd: recordNumber(order, "subtotal_before_manual_adjustments_usd"),
      manual_adjustment_total_usd: recordNumber(order, "manual_adjustment_total_usd"),
      subtotal_after_manual_adjustments_usd: recordNumber(order, "subtotal_after_manual_adjustments_usd"),
      coupon_discount_usd: recordNumber(order, "coupon_discount_usd"),
      shipping_original_usd: recordNumber(order, "shipping_original_usd"),
      shipping_discount_usd: recordNumber(order, "shipping_discount_usd"),
      local_currency_total: recordNumber(order, "local_currency_total"),
      usd_only_total: recordNumber(order, "usd_only_total"),
      shipping_cup: recordNumber(order, "shipping_cup"),
      exchange_rate_used: recordNumber(order, "exchange_rate_used"),
      mixed_payment: recordBool(order, "mixed_payment"),
      promotion_summary: recordString(order, "promotion_summary"),
      coupon_code: recordString(order, "coupon_code"),
      status: recordString(order, "status"),
      whatsapp_sent: recordBool(order, "whatsapp_sent"),
      stock_deducted: recordBool(order, "stock_deducted"),
    },
    items: (items || []).map(responseItem),
    totals: {
      subtotalOriginalUSD: recordNumber(order, "subtotal_original_usd"),
      discountTotalUSD: recordNumber(order, "discount_total_usd"),
      subtotalUSD: subtotal,
      subtotalFinalUSD: subtotal,
      shippingOriginalUSD: recordNumber(order, "shipping_original_usd"),
      shippingDiscountUSD: recordNumber(order, "shipping_discount_usd"),
      shippingUSD: shipping,
      totalUSD: total,
      localCurrencyTotal: localCurrencyTotalUSD,
      usdOnlyTotal: recordNumber(order, "usd_only_total"),
      mixedPayment: recordBool(order, "mixed_payment"),
      promotionSummary: recordString(order, "promotion_summary"),
      couponDiscountUSD: recordNumber(order, "coupon_discount_usd"),
      manualAdjustmentTotalUSD: recordNumber(order, "manual_adjustment_total_usd"),
      couponWinner: recordString(order, "coupon_code") ? "manual_coupon" : recordNumber(order, "discount_total_usd") > 0 ? "automatic" : "none",
    },
    shipping_zone_name: shippingName || "",
  };
}

function existingCheckout(app, parsed) {
  return findRecordsStrict(app, "orders", "store = {:store} && receipt_token = {:token}", "-created", 1, 0, {
    store: parsed.storeId,
    token: parsed.idempotencyKey,
  })[0] || null;
}

function shippingNameForOrder(app, order) {
  const zone = findRecord(app, "shipping_zones", relationId(order, "shipping_zone"));
  if (!zone || relationId(zone, "store") !== relationId(order, "store")) return "";
  return bounded(`${recordString(zone, "municipality")} / ${recordString(zone, "zone") || recordString(zone, "municipality")}`, 240);
}

function setNoStoreHeaders(e) {
  try {
    e.response.header().set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    e.response.header().set("Pragma", "no-cache");
    e.response.header().set("X-Content-Type-Options", "nosniff");
  } catch (_) {}
}

function handleCheckout(e) {
  setNoStoreHeaders(e);
  let parsed = null;
  try { parsed = parseCheckoutPayload(e.requestInfo().body || {}); } catch (_) { parsed = null; }
  if (!parsed) return e.json(400, { ok: false, error: "invalid_order" });
  let result = null;
  try {
    $app.runInTransaction((txApp) => {
      const existing = existingCheckout(txApp, parsed);
      if (existing) {
        const existingItems = findRecordsStrict(txApp, "order_items", "order = {:order}", "created", 200, 0, { order: existing.id });
        result = responseOrder(existing, existingItems, shippingNameForOrder(txApp, existing), true);
        return;
      }
      const plan = buildCheckoutPlan(txApp, parsed, new Date());
      const order = createOrderRecord(txApp, parsed, plan);
      const items = createOrderItems(txApp, order, plan);
      createCouponUsage(txApp, order, parsed, plan);
      createOrderNotification(txApp, order, parsed, plan);
      result = responseOrder(order, items, plan.shipping.name, false);
    });
    return e.json(200, result);
  } catch (error) {
    const code = requestErrorCode(error);
    if (code) return e.json(Number(error.status) || 422, { ok: false, error: code });
    try { $app.logger().error("PowerZona checkout transaction failed safely.", "code", "PZ_ORDER_CHECKOUT_FAILED"); } catch (_) {}
    return e.json(500, { ok: false, error: "order_creation_failed" });
  }
}

function standaloneGiftItem(app, order, giftId) {
  const storeId = relationId(order, "store");
  const storedItems = findRecordsStrict(app, "order_items", "order = {:order}", "created", 500, 0, { order: order.id });
  const productsSubtotal = storedItems.reduce((sum, item) => recordBool(item, "is_gift") ? sum : sum + recordNumber(item, "line_subtotal_original_usd"), 0);
  return resolveGift(app, storeId, { giftId }, productsSubtotal);
}

function canonicalizeOrderItemRecord(app, record, now) {
  return { code: "direct_order_item_mutation_forbidden", field: "order_item" };
}

function raiseOrderRequestError(safe) {
  const issue = safe || {};
  const field = bounded(issue.field || "order", 80);
  const data = {};
  data[field] = new ValidationError(bounded(issue.code || "order_unavailable", 80), "No se pudo completar la operacion.");
  throw new BadRequestError("No se pudo completar la operacion.", data);
}

function storedCurrencyForOrder(app, order) {
  const record = findRecord(app, "currencies", relationId(order, "currency"));
  const storedRate = recordNumber(order, "exchange_rate_used");
  const currentRate = recordNumber(record, "exchange_rate");
  const rate = storedRate > 0 ? storedRate : currentRate > 0 ? currentRate : 1;
  return { record: record || { id: relationId(order, "currency") }, code: recordString(record, "code").toUpperCase() || "USD", rate };
}

function storedAutomaticLine(item) {
  const explicit = recordValue(item, "line_subtotal_after_automatic_discount_usd");
  if (explicit !== undefined && explicit !== null && explicit !== "") return Math.max(0, number(explicit));
  const finalLine = recordNumber(item, "line_total_usd");
  return Math.max(0, finalLine - recordNumber(item, "manual_adjustment_total_usd"));
}

function applyStoredOrderTotals(app, order) {
  const currency = storedCurrencyForOrder(app, order);
  const items = findRecordsStrict(app, "order_items", "order = {:order}", "created", 1000, 0, { order: order.id });
  const subtotalOriginal = items.reduce((sum, item) => sum + recordNumber(item, "line_subtotal_original_usd"), 0);
  const subtotalBeforeManual = items.reduce((sum, item) => recordBool(item, "is_gift") ? sum : sum + storedAutomaticLine(item), 0);
  const subtotalAfterManual = items.reduce((sum, item) => sum + recordNumber(item, "line_total_usd"), 0);
  const manualTotal = subtotalAfterManual - subtotalBeforeManual;
  const discount = items.reduce((sum, item) => sum + recordNumber(item, "line_discount_usd"), 0);
  const local = items.reduce((sum, item) => recordBool(item, "is_gift") || recordBool(item, "only_usd") ? sum : sum + recordNumber(item, "line_total_usd"), 0);
  const usdOnly = items.reduce((sum, item) => recordBool(item, "is_gift") || !recordBool(item, "only_usd") ? sum : sum + recordNumber(item, "line_total_usd"), 0);
  const separate = !isOneToOne(currency);
  const snapshot = recordJson(order, "economic_snapshot_json");
  if (!snapshot) {
    const couponDiscount = items.reduce((sum, item) => sum + recordNumber(item, "coupon_discount_usd"), 0);
    const promotionNames = Array.from(new Set(items.map((item) => recordString(item, "promotion_name")).filter(Boolean)));
    const couponIds = Array.from(new Set(items.map((item) => recordString(item, "coupon_id")).filter(Boolean)));
    const couponCodes = Array.from(new Set(items.map((item) => recordString(item, "coupon_code")).filter(Boolean)));
    order.set("promotion_summary", bounded(promotionNames.join("\n"), 2000));
    order.set("coupon_id", bounded(couponIds[0], 80));
    order.set("coupon_code", bounded(couponCodes[0], 60));
    order.set("coupon_discount_usd", couponDiscount);
    order.set("coupon_summary", couponDiscount > 0 ? bounded(`${couponCodes[0] || "Cupon"}: $${couponDiscount.toFixed(2)} USD`, 1000) : "");
  }
  let shippingOriginal = Math.max(0, recordNumber(order, "shipping_original_usd"));
  let shippingFinal = Math.max(0, recordNumber(order, "shipping"));
  let shippingDiscount = Math.max(0, recordNumber(order, "shipping_discount_usd"));
  const submittedShipping = Math.max(0, recordNumber(order, "shipping"));
  const snapshotCoupon = snapshot && snapshot.coupon;
  if (snapshotCoupon && snapshotCoupon.scope === COUPON_SCOPES.FREE_SHIPPING && recordString(order, "delivery_method") === "delivery") {
    shippingOriginal = Math.max(submittedShipping, shippingOriginal);
    shippingDiscount = shippingOriginal;
    shippingFinal = 0;
  } else if (recordString(order, "delivery_method") !== "delivery") {
    shippingOriginal = 0;
    shippingDiscount = 0;
    shippingFinal = 0;
    order.set("shipping_zone", "");
  } else if (submittedShipping !== shippingFinal || submittedShipping > 0) {
    shippingOriginal = submittedShipping;
    shippingFinal = submittedShipping;
    shippingDiscount = 0;
  }
  order.set("subtotal", subtotalAfterManual);
  order.set("shipping", shippingFinal);
  order.set("total", subtotalAfterManual + shippingFinal);
  order.set("usd_total", subtotalAfterManual + shippingFinal);
  order.set("subtotal_original_usd", subtotalOriginal);
  order.set("discount_total_usd", discount);
  order.set("subtotal_after_discount_usd", subtotalBeforeManual);
  order.set("subtotal_before_manual_adjustments_usd", subtotalBeforeManual);
  order.set("manual_adjustment_total_usd", manualTotal);
  order.set("subtotal_after_manual_adjustments_usd", subtotalAfterManual);
  order.set("shipping_original_usd", shippingOriginal);
  order.set("shipping_discount_usd", shippingDiscount);
  order.set("local_currency_total", selectedMoney(local, false, currency));
  order.set("usd_only_total", separate ? usdOnly : 0);
  order.set("shipping_cup", selectedMoney(shippingFinal, false, currency));
  order.set("exchange_rate_used", currency.rate);
  order.set("mixed_payment", separate && local > 0 && usdOnly > 0);
  return order;
}

function legacyLineSnapshot(record) {
  const existing = recordJson(record, "economic_snapshot_json");
  if (existing) return existing;
  const quantity = Math.max(1, recordNumber(record, "quantity"));
  const baseUnit = recordNumber(record, "unit_price_original_usd")
    || recordNumber(record, "line_subtotal_original_usd") / quantity
    || recordNumber(record, "unit_price_final_usd");
  const automaticLine = storedAutomaticLine(record);
  const automaticUnit = automaticLine / quantity;
  return {
    version: 0,
    algorithm: "pz-order-legacy-preserved-v1",
    product_id: relationId(record, "product"),
    variation_id: relationId(record, "variation"),
    base_unit_price_usd: baseUnit,
    cost_unit_usd: Math.max(0, recordNumber(record, "unit_price_final_usd") - recordNumber(record, "unit_profit_usd")),
    only_usd: recordBool(record, "only_usd"),
    category_id: "",
    subcategory_id: "",
    legacy_automatic_unit_price_usd: automaticUnit,
    legacy_coupon_discount_unit_usd: recordNumber(record, "coupon_discount_usd") / quantity,
  };
}

function freezeLegacyLineEconomics(record) {
  if (!record || recordBool(record, "is_gift") || recordJson(record, "economic_snapshot_json")) return record;
  const snapshot = legacyLineSnapshot(record);
  const quantity = Math.max(1, recordNumber(record, "quantity"));
  record.set("economic_snapshot_version", 0);
  record.set("economic_snapshot_json", snapshot);
  record.set("unit_price_after_automatic_discount_usd", number(snapshot.legacy_automatic_unit_price_usd));
  record.set("line_subtotal_after_automatic_discount_usd", number(snapshot.legacy_automatic_unit_price_usd) * quantity);
  return record;
}

function storedManualFields(record) {
  return {
    has_manual_price_adjustment: recordBool(record, "has_manual_price_adjustment"),
    manual_final_unit_price_usd: recordNumber(record, "manual_final_unit_price_usd"),
    manual_adjustment_reason_code: recordString(record, "manual_adjustment_reason_code"),
    manual_adjustment_reason_text: recordString(record, "manual_adjustment_reason_text"),
    manual_adjusted_by: relationId(record, "manual_adjusted_by"),
    manual_adjusted_at: recordString(record, "manual_adjusted_at"),
  };
}

function storedLinePresentation(record, snapshot) {
  return {
    product_id: relationId(record, "product"),
    variation_id: relationId(record, "variation"),
    gift_id: relationId(record, "gift"),
    title: recordString(record, "product_name") || (recordBool(record, "is_gift") ? "Regalo" : "Producto"),
    variation_label: recordString(record, "variation_label") || recordString(record, "variation_name"),
    variation_ref: recordString(record, "variation_ref"),
    image_url: recordString(record, "item_image_url"),
    quantity: recordBool(record, "is_gift") ? 1 : recordNumber(record, "quantity"),
    only_usd: snapshot ? Boolean(snapshot.only_usd) : recordBool(record, "only_usd"),
    category: bounded(snapshot && snapshot.category_id, 80),
    subcategory: bounded(snapshot && snapshot.subcategory_id, 80),
    cost_usd: number(snapshot && snapshot.cost_unit_usd),
    is_gift: recordBool(record, "is_gift"),
    gift_min_order_usd: recordNumber(record, "gift_min_order_usd"),
    economic_snapshot: snapshot,
  };
}

function legacyCalculatedLine(record) {
  const snapshot = legacyLineSnapshot(record);
  const presentation = storedLinePresentation(record, snapshot);
  if (presentation.is_gift) return Object.assign({}, presentation, {
    price: 0,
    unit_price_original_usd: 0,
    unit_price_final_usd: 0,
    unit_price_after_automatic_discount_usd: 0,
    line_subtotal_original_usd: 0,
    line_discount_usd: 0,
    line_subtotal_after_automatic_discount_usd: 0,
    line_subtotal_final_usd: 0,
  });
  const quantity = presentation.quantity;
  const baseUnit = number(snapshot.base_unit_price_usd);
  const automaticUnit = Math.max(0, number(snapshot.legacy_automatic_unit_price_usd));
  const promotionId = recordString(record, "promotion_id");
  const couponId = recordString(record, "coupon_id");
  return Object.assign({}, presentation, storedManualFields(record), {
    price: baseUnit,
    unit_price_original_usd: baseUnit,
    unit_price_final_usd: automaticUnit,
    unit_price_after_automatic_discount_usd: automaticUnit,
    line_subtotal_original_usd: baseUnit * quantity,
    line_discount_usd: Math.max(0, (baseUnit - automaticUnit) * quantity),
    line_subtotal_after_automatic_discount_usd: automaticUnit * quantity,
    line_subtotal_final_usd: automaticUnit * quantity,
    coupon_discount_usd: Math.max(0, number(snapshot.legacy_coupon_discount_unit_usd) * quantity),
    promotion: promotionId ? { id: promotionId, name: recordString(record, "promotion_name"), type: recordString(record, "promotion_type") } : null,
    coupon: couponId ? { id: couponId, code: recordString(record, "coupon_code") } : null,
  });
}

function snapshotCalculatedLines(records, orderSnapshot, order) {
  const productRecords = records.filter((record) => !recordBool(record, "is_gift"));
  const cart = productRecords.map((record) => {
    const snapshot = recordJson(record, "economic_snapshot_json") || legacyLineSnapshot(record);
    return Object.assign({}, storedLinePresentation(record, snapshot), {
      id: relationId(record, "product"),
      price: number(snapshot.base_unit_price_usd),
    });
  });
  const deliveryMethod = recordString(order, "delivery_method");
  const shippingOriginal = deliveryMethod === "delivery"
    ? Math.max(0, recordNumber(order, "shipping_original_usd") || number(orderSnapshot && orderSnapshot.shipping && orderSnapshot.shipping.original_usd))
    : 0;
  const promotions = Array.isArray(orderSnapshot && orderSnapshot.promotions) ? orderSnapshot.promotions : [];
  const coupon = orderSnapshot && orderSnapshot.winner === "manual_coupon" ? orderSnapshot.coupon : null;
  const totals = calculateCartWithManualCoupon(cart, promotions, coupon, deliveryMethod, shippingOriginal, new Date());
  const byId = new Map(productRecords.map((record, index) => [record.id, totals.items[index]]));
  const lines = records.map((record) => {
    if (recordBool(record, "is_gift")) return legacyCalculatedLine(record);
    const calculated = byId.get(record.id);
    const snapshot = recordJson(record, "economic_snapshot_json") || legacyLineSnapshot(record);
    return Object.assign({}, storedLinePresentation(record, snapshot), storedManualFields(record), calculated, {
      economic_snapshot: snapshot,
      product_id: relationId(record, "product"),
      variation_id: relationId(record, "variation"),
      unit_price_after_automatic_discount_usd: number(calculated.unit_price_final_usd),
      line_subtotal_after_automatic_discount_usd: number(calculated.line_subtotal_final_usd),
    });
  });
  return { lines, totals };
}

function setRecalculatedOrderTotals(order, records, automaticTotals, currency, preserveStoredLabels) {
  const nonGifts = records.filter((record) => !recordBool(record, "is_gift"));
  const subtotalOriginal = nonGifts.reduce((sum, record) => sum + recordNumber(record, "line_subtotal_original_usd"), 0);
  const subtotalBeforeManual = nonGifts.reduce((sum, record) => sum + storedAutomaticLine(record), 0);
  const subtotalAfterManual = nonGifts.reduce((sum, record) => sum + recordNumber(record, "line_total_usd"), 0);
  const manualTotal = subtotalAfterManual - subtotalBeforeManual;
  const discount = nonGifts.reduce((sum, record) => sum + recordNumber(record, "line_discount_usd"), 0);
  const local = nonGifts.reduce((sum, record) => recordBool(record, "only_usd") ? sum : sum + recordNumber(record, "line_total_usd"), 0);
  const usdOnly = nonGifts.reduce((sum, record) => recordBool(record, "only_usd") ? sum + recordNumber(record, "line_total_usd") : sum, 0);
  const separate = !isOneToOne(currency);
  const shippingOriginal = automaticTotals ? number(automaticTotals.shippingOriginalUSD) : recordNumber(order, "shipping_original_usd");
  const shippingDiscount = automaticTotals ? number(automaticTotals.shippingDiscountUSD) : recordNumber(order, "shipping_discount_usd");
  const shippingFinal = automaticTotals ? number(automaticTotals.shippingFinalUSD) : recordNumber(order, "shipping");
  order.set("subtotal", subtotalAfterManual);
  order.set("shipping", shippingFinal);
  order.set("total", subtotalAfterManual + shippingFinal);
  order.set("usd_total", subtotalAfterManual + shippingFinal);
  order.set("subtotal_original_usd", subtotalOriginal);
  order.set("discount_total_usd", discount);
  order.set("subtotal_after_discount_usd", subtotalBeforeManual);
  order.set("subtotal_before_manual_adjustments_usd", subtotalBeforeManual);
  order.set("manual_adjustment_total_usd", manualTotal);
  order.set("subtotal_after_manual_adjustments_usd", subtotalAfterManual);
  order.set("shipping_original_usd", shippingOriginal);
  order.set("shipping_discount_usd", shippingDiscount);
  order.set("local_currency_total", selectedMoney(local, false, currency));
  order.set("usd_only_total", separate ? usdOnly : 0);
  order.set("shipping_cup", selectedMoney(shippingFinal, false, currency));
  order.set("exchange_rate_used", currency.rate);
  order.set("mixed_payment", separate && local > 0 && usdOnly > 0);
  if (automaticTotals && !preserveStoredLabels) {
    const couponWinner = automaticTotals.couponWinner === "manual_coupon";
    const coupon = couponWinner ? automaticTotals.manualCoupon : null;
    order.set("promotion_summary", bounded(automaticTotals.promotionSummary, 2000));
    order.set("coupon_id", coupon ? bounded(coupon.id, 80) : "");
    order.set("coupon_code", coupon ? bounded(coupon.code, 60) : "");
    order.set("coupon_discount_usd", couponWinner ? number(automaticTotals.couponDiscountUSD) : 0);
    order.set("coupon_summary", couponWinner ? bounded(automaticTotals.couponSummary || automaticTotals.promotionSummary, 1000) : "");
  }
  return order;
}

function recalculateOrderEconomics(app, order) {
  const records = findRecordsStrict(app, "order_items", "order = {:order}", "created", 1000, 0, { order: order.id });
  const orderSnapshot = recordJson(order, "economic_snapshot_json");
  const currency = storedCurrencyForOrder(app, order);
  let calculation = null;
  if (orderSnapshot && number(orderSnapshot.version) >= ECONOMIC_SNAPSHOT_VERSION) {
    calculation = snapshotCalculatedLines(records, orderSnapshot, order);
  } else {
    calculation = { lines: records.map(legacyCalculatedLine), totals: null };
  }
  records.forEach((record, index) => {
    applyCanonicalItemValues(record, calculation.lines[index], order.id, currency);
    app.save(record);
  });
  setRecalculatedOrderTotals(order, records, calculation.totals, currency, !orderSnapshot);
  app.save(order);
  return { order, items: records, automaticTotals: calculation.totals };
}

function privateRouteId(e, name) {
  try { return String(e.request.pathValue(name) || "").trim(); } catch (_) { return ""; }
}

function privateMutationError(code, status) {
  const error = new Error(code);
  error.privateCode = code;
  error.status = status;
  return error;
}

function requirePrivateOrder(app, auth, orderId, permissionKey) {
  if (!auth || !RECORD_ID_PATTERN.test(orderId)) throw privateMutationError("order_not_found", 404);
  const role = recordString(auth, "role");
  const status = recordString(auth, "status").toLowerCase();
  if (status !== "active" || !["master_admin", "store_admin", "store_staff"].includes(role)) throw privateMutationError("forbidden", 403);
  const order = findRecord(app, "orders", orderId);
  if (!order) throw privateMutationError("order_not_found", 404);
  const storeId = relationId(order, "store");
  const store = findRecord(app, "stores", storeId);
  if (!store) throw privateMutationError("order_not_found", 404);
  if (role !== "master_admin") {
    if (relationId(auth, "store") !== storeId) throw privateMutationError("order_not_found", 404);
    if (!teamPermissions.hasStorePermission(app, auth, store, permissionKey)) {
      throw privateMutationError("permission_denied", 403);
    }
  }
  return order;
}

function requirePrivateItem(app, order, itemId) {
  if (!RECORD_ID_PATTERN.test(itemId)) throw privateMutationError("item_not_found", 404);
  const item = findRecord(app, "order_items", itemId);
  if (!item || relationId(item, "order") !== order.id) throw privateMutationError("item_not_found", 404);
  return item;
}

function exactPrivatePayload(body, expectedKeys) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const actual = Object.keys(body).filter((key) => typeof body[key] !== "function").sort();
  const expected = expectedKeys.slice().sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function parseOrderTransitionPayload(body) {
  if (!exactPrivatePayload(body, ["status"])) throw privateMutationError("invalid_payload", 422);
  const status = bounded(bodyValue(body, "status"), 40).toLowerCase();
  if (!ORDER_STATUSES.includes(status)) throw privateMutationError("invalid_status", 422);
  return status;
}

function requireEmptyPrivatePayload(body) {
  if (!exactPrivatePayload(body, [])) throw privateMutationError("invalid_payload", 422);
}

function lockOrderStore(app, storeId) {
  if (!app || typeof app.db !== "function") return;
  const database = app.db();
  if (!database || typeof database.newQuery !== "function") return;
  database.newQuery("UPDATE stores SET id = id WHERE id = {:storeId}").bind({ storeId }).execute();
}

function requireLockedPrivateOrder(app, auth, orderId, permissionKey) {
  const initial = requirePrivateOrder(app, auth, orderId, permissionKey);
  const storeId = relationId(initial, "store");
  lockOrderStore(app, storeId);
  const current = requirePrivateOrder(app, auth, orderId, permissionKey);
  if (relationId(current, "store") !== storeId) throw privateMutationError("order_not_found", 404);
  return current;
}

function orderActivityLabel(order) {
  const number = bounded(recordString(order, "order_number"), 60);
  return number ? `Pedido ${number}` : "Pedido";
}

function orderActivityVersion(order, item, fallback) {
  return bounded(
    recordString(item, "updated")
      || recordString(order, "updated")
      || fallback
      || (item && item.id)
      || order.id,
    100
  );
}

function createOrderActivity(app, order, auth, values) {
  const input = values || {};
  return storeActivity.createActivity(app, {
    storeId: relationId(order, "store"),
    actor: auth,
    module: "orders",
    action: input.action,
    severity: input.severity || "important",
    resourceType: "order",
    resourceId: order.id,
    resourceLabel: orderActivityLabel(order),
    changedFields: input.changedFields || [],
    previousValues: input.previousValues || {},
    newValues: input.newValues || {},
    summary: input.summary,
    sourceEventKey: input.sourceEventKey,
  });
}

function addInventoryGroup(groups, key, record, quantity) {
  const existing = groups.get(key);
  if (existing) {
    existing.quantity += quantity;
    return;
  }
  groups.set(key, { key, record, quantity });
}

function orderInventoryGroups(app, order) {
  const storeId = relationId(order, "store");
  const items = findRecordsStrict(app, "order_items", "order = {:order}", "created", 10000, 0, { order: order.id });
  const groups = new Map();
  items.forEach((item) => {
    if (relationId(item, "order") !== order.id) throw privateMutationError("order_inventory_invalid", 409);
    const quantity = recordNumber(item, "quantity");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      throw privateMutationError("order_inventory_invalid", 409);
    }

    const productId = relationId(item, "product");
    const variationId = relationId(item, "variation");
    const giftId = relationId(item, "gift");
    if (recordBool(item, "is_gift")) {
      if (!giftId || productId || variationId) throw privateMutationError("order_inventory_invalid", 409);
      const gift = findRecord(app, "gifts", giftId);
      if (!gift || relationId(gift, "store") !== storeId) throw privateMutationError("order_inventory_invalid", 409);
      addInventoryGroup(groups, `gift:${gift.id}`, gift, quantity);
      return;
    }

    if (!productId || giftId) throw privateMutationError("order_inventory_invalid", 409);
    const product = findRecord(app, "products", productId);
    if (!product || relationId(product, "store") !== storeId) throw privateMutationError("order_inventory_invalid", 409);
    if (recordValue(product, "track_stock") === false) return;
    if (!variationId) {
      addInventoryGroup(groups, `product:${product.id}`, product, quantity);
      return;
    }

    const variation = findRecord(app, "product_variations", variationId);
    if (!variation || relationId(variation, "product") !== product.id) {
      throw privateMutationError("order_inventory_invalid", 409);
    }
    addInventoryGroup(groups, `variation:${variation.id}`, variation, quantity);
  });
  return Array.from(groups.values());
}

function moveOrderInventory(app, order, direction) {
  const groups = orderInventoryGroups(app, order);
  groups.forEach((group) => {
    const stock = Number(recordValue(group.record, "stock"));
    if (!Number.isFinite(stock) || stock < 0 || !Number.isInteger(stock)) {
      throw privateMutationError("order_inventory_invalid", 409);
    }
    if (direction < 0 && stock < group.quantity) throw privateMutationError("insufficient_stock", 409);
  });
  groups.forEach((group) => {
    const stock = Number(recordValue(group.record, "stock"));
    group.record.set("stock", stock + direction * group.quantity);
    app.save(group.record);
  });
  return groups.length;
}

function reconcileOrderInventory(app, order, nextStatus) {
  const shouldReserve = INVENTORY_RESERVED_STATUSES.includes(nextStatus);
  const wasReserved = recordBool(order, "stock_deducted");
  if (shouldReserve && !wasReserved) {
    moveOrderInventory(app, order, -1);
    order.set("stock_deducted", true);
    return "deducted";
  }
  if (!shouldReserve && wasReserved) {
    moveOrderInventory(app, order, 1);
    order.set("stock_deducted", false);
    return "restored";
  }
  return "unchanged";
}

function sanitizedTransitionResponse(order, inventoryAction) {
  return {
    ok: true,
    order: {
      id: order.id,
      status: recordString(order, "status"),
      stock_deducted: recordBool(order, "stock_deducted"),
      delivered_at: recordString(order, "delivered_at"),
    },
    inventory_action: inventoryAction,
  };
}

function transitionPrivateOrder(app, auth, orderId, nextStatus, now) {
  if (!ORDER_STATUSES.includes(nextStatus)) throw privateMutationError("invalid_status", 422);
  const permission = nextStatus === "cancelled" ? "orders.cancel_delete" : "orders.status.manage";
  const order = requireLockedPrivateOrder(app, auth, orderId, permission);
  const currentStatus = recordString(order, "status").toLowerCase();
  const previousStockDeducted = recordBool(order, "stock_deducted");
  const previousDeliveredAt = recordString(order, "delivered_at");
  if (nextStatus === "delivered" && !["confirmed", "delivered"].includes(currentStatus)) {
    throw privateMutationError("invalid_status_transition", 409);
  }
  const inventoryAction = reconcileOrderInventory(app, order, nextStatus);
  order.set("status", nextStatus);
  if (nextStatus === "delivered" && !recordString(order, "delivered_at")) {
    const deliveredAt = now instanceof Date ? now : new Date();
    order.set("delivered_at", deliveredAt.toISOString());
  }
  const nextStockDeducted = recordBool(order, "stock_deducted");
  const nextDeliveredAt = recordString(order, "delivered_at");
  const changedFields = [];
  const previousValues = {};
  const newValues = {};
  if (currentStatus !== nextStatus) {
    changedFields.push("status");
    previousValues.status = currentStatus;
    newValues.status = nextStatus;
  }
  if (previousStockDeducted !== nextStockDeducted) {
    changedFields.push("inventory_state");
    previousValues.inventory_reserved = previousStockDeducted;
    newValues.inventory_reserved = nextStockDeducted;
  }
  if (previousDeliveredAt !== nextDeliveredAt) {
    changedFields.push("delivered_at");
    previousValues.delivered_at = previousDeliveredAt;
    newValues.delivered_at = nextDeliveredAt;
  }
  if (!changedFields.length) return sanitizedTransitionResponse(order, inventoryAction);
  app.save(order);
  const version = orderActivityVersion(order, null, `${currentStatus}:${nextStatus}`);
  createOrderActivity(app, order, auth, {
    action: nextStatus === "cancelled" ? "order_cancelled" : "order_status_changed",
    severity: nextStatus === "cancelled" ? "critical" : "important",
    changedFields,
    previousValues,
    newValues,
    summary: nextStatus === "cancelled"
      ? `Canceló ${orderActivityLabel(order)}`
      : `Cambió el estado de ${orderActivityLabel(order)} a ${nextStatus}`,
    sourceEventKey: `orders:status:${order.id}:${version}:${currentStatus}:${nextStatus}`,
  });
  return sanitizedTransitionResponse(order, inventoryAction);
}

function secureUniqueOrderToken(app, field, length, securityApi) {
  const generator = securityApi || (typeof $security === "undefined" ? null : $security);
  if (!generator || typeof generator.randomStringWithAlphabet !== "function") {
    throw privateMutationError("token_unavailable", 503);
  }
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = String(generator.randomStringWithAlphabet(length, ORDER_TOKEN_ALPHABET) || "");
    if (token.length !== length || !/^[A-Za-z0-9_-]+$/.test(token)) continue;
    const duplicate = findRecordsStrict(app, "orders", `${field} = {:token}`, "", 1, 0, { token })[0];
    if (!duplicate) return token;
  }
  throw privateMutationError("token_unavailable", 503);
}

function ensurePrivateOrderToken(app, auth, orderId, options) {
  const config = options || {};
  const field = config.field === "review_token" ? "review_token" : "receipt_token";
  const permission = field === "review_token" ? "reviews.manage" : "orders.contact_customer";
  const order = requireLockedPrivateOrder(app, auth, orderId, permission);
  if (field === "review_token" && recordString(order, "status") !== "delivered") {
    throw privateMutationError("review_not_available", 409);
  }
  let token = recordString(order, field);
  if (!token) {
    token = secureUniqueOrderToken(app, field, field === "review_token" ? 40 : 32, config.securityApi);
    order.set(field, token);
    app.save(order);
    const reviewAccess = field === "review_token";
    const version = orderActivityVersion(order, null, reviewAccess ? "review_access" : "customer_access");
    createOrderActivity(app, order, auth, {
      action: reviewAccess ? "order_review_access_issued" : "order_customer_access_issued",
      severity: "important",
      changedFields: [reviewAccess ? "review_access_link" : "customer_access_link"],
      previousValues: { access_link_issued: false },
      newValues: { access_link_issued: true },
      summary: reviewAccess
        ? `Generó el enlace de reseña de ${orderActivityLabel(order)}`
        : `Generó el enlace de acceso de ${orderActivityLabel(order)}`,
      sourceEventKey: `orders:${reviewAccess ? "review_access" : "customer_access"}:${order.id}:${version}`,
    });
  }
  const responseOrderValue = { id: order.id };
  responseOrderValue[field] = token;
  return { ok: true, order: responseOrderValue };
}

function deleteCouponUsagesForOrder(app, order) {
  const usages = findRecordsStrict(app, "manual_coupon_usages", "order = {:order}", "created", 1000, 0, { order: order.id });
  usages.forEach((usage) => {
    const coupon = findRecord(app, "manual_coupons", relationId(usage, "coupon"));
    app.delete(usage);
    if (!coupon) return;
    coupon.set("used_count", Math.max(0, recordNumber(coupon, "used_count") - 1));
    app.save(coupon);
  });
}

function deletePrivateOrder(app, auth, orderId) {
  const order = requireLockedPrivateOrder(app, auth, orderId, "orders.cancel_delete");
  const previousStatus = recordString(order, "status");
  const previousStockDeducted = recordBool(order, "stock_deducted");
  const previousTotal = recordNumber(order, "total");
  const sourceVersion = orderActivityVersion(order, null, order.id);
  if (recordBool(order, "stock_deducted")) {
    moveOrderInventory(app, order, 1);
    order.set("stock_deducted", false);
  }
  order.set("status", "cancelled");
  app.save(order);
  const items = findRecordsStrict(app, "order_items", "order = {:order}", "created", 10000, 0, { order: order.id });
  items.forEach((item) => {
    if (relationId(item, "order") !== order.id) throw privateMutationError("order_inventory_invalid", 409);
    app.delete(item);
  });
  deleteCouponUsagesForOrder(app, order);
  createOrderActivity(app, order, auth, {
    action: "order_deleted",
    severity: "critical",
    changedFields: ["state"],
    previousValues: {
      state: "existing",
      status: previousStatus,
      inventory_reserved: previousStockDeducted,
      total_usd: previousTotal,
      item_count: items.length,
    },
    newValues: { state: "deleted" },
    summary: `Eliminó permanentemente ${orderActivityLabel(order)}`,
    sourceEventKey: `orders:deleted:${order.id}:${sourceVersion}`,
  });
  app.delete(order);
  return { ok: true, deleted: true };
}

function requireProductEditingOpen(order) {
  if (recordBool(order, "stock_deducted")) throw privateMutationError("order_products_locked", 409);
}

function requireAdjustmentState(order) {
  if (!MANUAL_ADJUSTMENT_STATES.includes(recordString(order, "status"))) throw privateMutationError("order_adjustment_locked", 409);
}

function parsePositiveQuantity(value) {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) throw privateMutationError("invalid_quantity", 422);
  return quantity;
}

function validateStoredLineStock(app, item, quantity) {
  const product = findRecord(app, "products", relationId(item, "product"));
  if (!product || recordValue(product, "track_stock") === false) return;
  const variation = relationId(item, "variation") ? findRecord(app, "product_variations", relationId(item, "variation")) : null;
  const stockRecord = variation || product;
  if (recordBool(stockRecord, "allow_preorder") || (!variation && recordBool(product, "allow_preorder"))) return;
  if (recordNumber(stockRecord, "stock") < quantity) throw privateMutationError("insufficient_stock", 422);
}

function adjustmentReason(body) {
  const code = bounded(body && body.reason_code, 80);
  const text = bounded(body && body.reason_text, 501);
  if (!MANUAL_ADJUSTMENT_REASONS.includes(code)) throw privateMutationError("invalid_adjustment_reason", 422);
  if (text.length > 500 || (code === "other" && text.length < 5)) throw privateMutationError("invalid_adjustment_reason", 422);
  return { code, text };
}

function validateResetPayload(body) {
  const payload = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const unexpected = Object.keys(payload).filter((key) => !RESET_ADJUSTMENT_FIELDS.includes(key));
  if (unexpected.length) throw privateMutationError("invalid_reset_payload", 422);
  return adjustmentReason(payload);
}

function adjustmentUnitPrice(body) {
  const value = Number(body && body.final_unit_price_usd);
  if (!Number.isFinite(value) || value < 0 || value > MAX_MANUAL_UNIT_PRICE_USD) throw privateMutationError("invalid_manual_price", 422);
  if (value === 0 && (!body || body.confirm_zero_price !== true)) throw privateMutationError("zero_price_confirmation_required", 422);
  return value;
}

function automaticUnitForRecord(record) {
  const explicit = recordValue(record, "unit_price_after_automatic_discount_usd");
  if (explicit !== undefined && explicit !== null && explicit !== "") return Math.max(0, number(explicit));
  return storedAutomaticLine(record) / Math.max(1, recordNumber(record, "quantity"));
}

function createPriceAdjustmentAudit(app, order, item, auth, values) {
  const audit = new Record(app.findCollectionByNameOrId("order_price_adjustments"), {});
  audit.set("store", relationId(order, "store"));
  audit.set("store_id_snapshot", relationId(order, "store"));
  audit.set("order", order.id);
  audit.set("order_id_snapshot", order.id);
  audit.set("order_number_snapshot", bounded(recordString(order, "order_number"), 60));
  audit.set("order_item", item.id);
  audit.set("order_item_id_snapshot", item.id);
  audit.set("product_name_snapshot", bounded(recordString(item, "product_name") || "Producto", 180));
  audit.set("actor", auth.id || "");
  audit.set("actor_name_snapshot", bounded(recordString(auth, "display_name") || recordString(auth, "name") || recordString(auth, "email") || "Usuario", 160));
  audit.set("actor_role_snapshot", bounded(recordString(auth, "role"), 40));
  audit.set("action", values.action);
  audit.set("quantity_snapshot", recordNumber(item, "quantity"));
  audit.set("automatic_unit_price_usd", values.automaticUnit);
  audit.set("previous_final_unit_price_usd", values.previousFinal);
  audit.set("new_final_unit_price_usd", values.newFinal);
  const unitAdjustment = Number.isFinite(values.unitAdjustment)
    ? values.unitAdjustment
    : values.newFinal - values.automaticUnit;
  const totalAdjustment = Number.isFinite(values.totalAdjustment)
    ? values.totalAdjustment
    : unitAdjustment * recordNumber(item, "quantity");
  audit.set("unit_adjustment_usd", unitAdjustment);
  audit.set("total_adjustment_usd", totalAdjustment);
  audit.set("reason_code", values.reasonCode);
  audit.set("reason_text", bounded(values.reasonText, 500));
  app.save(audit);
  return audit;
}

function privateMutationResponse(app, result) {
  return responseOrder(result.order, result.items, shippingNameForOrder(app, result.order), false);
}

function handlePrivateMutation(e, callback) {
  setNoStoreHeaders(e);
  try {
    let payload = null;
    $app.runInTransaction((txApp) => { payload = callback(txApp); });
    return e.json(200, payload);
  } catch (error) {
    if (error && error.privateCode) return e.json(Number(error.status) || 422, { ok: false, error: error.privateCode });
    try { $app.logger().error("PowerZona private order mutation failed safely.", "code", "PZ_ORDER_PRIVATE_MUTATION_FAILED", "error", String(error && error.message || error)); } catch (_) {}
    return e.json(500, { ok: false, error: "order_mutation_failed" });
  }
}

function handleOrderTransition(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  let status = "";
  try { status = parseOrderTransitionPayload(body); }
  catch (error) {
    setNoStoreHeaders(e);
    return e.json(Number(error && error.status) || 422, { ok: false, error: error && error.privateCode || "invalid_payload" });
  }
  return handlePrivateMutation(e, (app) => transitionPrivateOrder(app, e.auth, orderId, status, new Date()));
}

function handleOrderReceiptToken(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  try { requireEmptyPrivatePayload(body); }
  catch (error) {
    setNoStoreHeaders(e);
    return e.json(Number(error && error.status) || 422, { ok: false, error: error && error.privateCode || "invalid_payload" });
  }
  return handlePrivateMutation(e, (app) => ensurePrivateOrderToken(app, e.auth, orderId, { field: "receipt_token" }));
}

function handleOrderReviewToken(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  try { requireEmptyPrivatePayload(body); }
  catch (error) {
    setNoStoreHeaders(e);
    return e.json(Number(error && error.status) || 422, { ok: false, error: error && error.privateCode || "invalid_payload" });
  }
  return handlePrivateMutation(e, (app) => ensurePrivateOrderToken(app, e.auth, orderId, { field: "review_token" }));
}

function handleOrderDelete(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  try { requireEmptyPrivatePayload(body); }
  catch (error) {
    setNoStoreHeaders(e);
    return e.json(Number(error && error.status) || 422, { ok: false, error: error && error.privateCode || "invalid_payload" });
  }
  return handlePrivateMutation(e, (app) => deletePrivateOrder(app, e.auth, orderId));
}

function handleOrderItemQuantity(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  const itemId = privateRouteId(e, "itemId");
  return handlePrivateMutation(e, (app) => {
    const quantity = parsePositiveQuantity(body.quantity);
    const order = requirePrivateOrder(app, e.auth, orderId, "orders.items.manage");
    requireProductEditingOpen(order);
    const item = requirePrivateItem(app, order, itemId);
    if (recordBool(item, "is_gift")) throw privateMutationError("gift_quantity_locked", 409);
    const previousQuantity = recordNumber(item, "quantity");
    const productName = bounded(recordString(item, "product_name") || "Producto", 180);
    if (previousQuantity === quantity) {
      const items = findRecordsStrict(app, "order_items", "order = {:order}", "created", 1000, 0, { order: order.id });
      return privateMutationResponse(app, { order, items });
    }
    validateStoredLineStock(app, item, quantity);
    if (!recordJson(order, "economic_snapshot_json")) freezeLegacyLineEconomics(item);
    item.set("quantity", quantity);
    app.save(item);
    const result = recalculateOrderEconomics(app, order);
    const version = orderActivityVersion(order, item, `${previousQuantity}:${quantity}`);
    createOrderActivity(app, order, e.auth, {
      action: "order_item_quantity_changed",
      severity: "important",
      changedFields: ["item_quantity"],
      previousValues: { product_name: productName, quantity: previousQuantity },
      newValues: { product_name: productName, quantity },
      summary: `Cambió la cantidad de ${productName} en ${orderActivityLabel(order)}`,
      sourceEventKey: `orders:item_quantity:${order.id}:${item.id}:${version}`,
    });
    return privateMutationResponse(app, result);
  });
}

function handleOrderItemAdd(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  return handlePrivateMutation(e, (app) => {
    const productId = bounded(body.product_id, 80);
    const variationId = bounded(body.variation_id, 80);
    const quantity = parsePositiveQuantity(body.quantity);
    if (!RECORD_ID_PATTERN.test(productId) || (variationId && !RECORD_ID_PATTERN.test(variationId))) {
      throw privateMutationError("invalid_product", 422);
    }
    const order = requirePrivateOrder(app, e.auth, orderId, "orders.items.manage");
    requireProductEditingOpen(order);
    const existing = findRecordsStrict(app, "order_items", "order = {:order}", "created", 1000, 0, { order: order.id })
      .find((item) => !recordBool(item, "is_gift") && relationId(item, "product") === productId && relationId(item, "variation") === variationId);
    let changedItem = null;
    let previousQuantity = 0;
    if (existing) {
      previousQuantity = recordNumber(existing, "quantity");
      const nextQuantity = recordNumber(existing, "quantity") + quantity;
      parsePositiveQuantity(nextQuantity);
      validateStoredLineStock(app, existing, nextQuantity);
      if (!recordJson(order, "economic_snapshot_json")) freezeLegacyLineEconomics(existing);
      existing.set("quantity", nextQuantity);
      app.save(existing);
      changedItem = existing;
    } else {
      const store = findRecord(app, "stores", relationId(order, "store"));
      if (!store) throw privateMutationError("order_not_found", 404);
      let resolved = null;
      try { resolved = resolveProductLine(app, store, { productId, variationId, quantity }, new Date()); }
      catch (_) { throw privateMutationError("invalid_product", 422); }
      const baseline = calculateCartPromotions([resolved], [], new Date()).items[0];
      baseline.economic_snapshot = lineEconomicSnapshot(baseline);
      const record = new Record(app.findCollectionByNameOrId("order_items"), {});
      applyCanonicalItemValues(record, baseline, order.id, storedCurrencyForOrder(app, order));
      app.save(record);
      changedItem = record;
    }
    const result = recalculateOrderEconomics(app, order);
    const productName = bounded(recordString(changedItem, "product_name") || "Producto", 180);
    const nextQuantity = recordNumber(changedItem, "quantity");
    const version = orderActivityVersion(order, changedItem, `${previousQuantity}:${nextQuantity}`);
    createOrderActivity(app, order, e.auth, {
      action: existing ? "order_item_quantity_changed" : "order_item_added",
      severity: "important",
      changedFields: [existing ? "item_quantity" : "items"],
      previousValues: existing ? { product_name: productName, quantity: previousQuantity } : {},
      newValues: { product_name: productName, quantity: nextQuantity },
      summary: existing
        ? `Aumentó la cantidad de ${productName} en ${orderActivityLabel(order)}`
        : `Agregó ${productName} a ${orderActivityLabel(order)}`,
      sourceEventKey: `orders:${existing ? "item_quantity" : "item_added"}:${order.id}:${changedItem.id}:${version}`,
    });
    return privateMutationResponse(app, result);
  });
}

function handleOrderItemDelete(e) {
  const orderId = privateRouteId(e, "orderId");
  const itemId = privateRouteId(e, "itemId");
  return handlePrivateMutation(e, (app) => {
    const order = requirePrivateOrder(app, e.auth, orderId, "orders.items.manage");
    requireProductEditingOpen(order);
    const item = requirePrivateItem(app, order, itemId);
    const productName = bounded(recordString(item, "product_name") || "Producto", 180);
    const previousQuantity = recordNumber(item, "quantity");
    const itemVersion = orderActivityVersion(order, item, item.id);
    app.delete(item);
    const result = recalculateOrderEconomics(app, order);
    createOrderActivity(app, order, e.auth, {
      action: "order_item_removed",
      severity: "important",
      changedFields: ["items"],
      previousValues: { product_name: productName, quantity: previousQuantity },
      newValues: {},
      summary: `Eliminó ${productName} de ${orderActivityLabel(order)}`,
      sourceEventKey: `orders:item_removed:${order.id}:${item.id}:${itemVersion}`,
    });
    return privateMutationResponse(app, result);
  });
}

function handleOrderItemAdjustment(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  const itemId = privateRouteId(e, "itemId");
  return handlePrivateMutation(e, (app) => {
    const finalUnit = adjustmentUnitPrice(body);
    const reason = adjustmentReason(body);
    const order = requirePrivateOrder(app, e.auth, orderId, "orders.price_adjustment");
    requireAdjustmentState(order);
    const item = requirePrivateItem(app, order, itemId);
    if (recordBool(item, "is_gift")) throw privateMutationError("gift_adjustment_forbidden", 409);
    if (!recordJson(order, "economic_snapshot_json")) freezeLegacyLineEconomics(item);
    const automaticUnit = automaticUnitForRecord(item);
    const previousFinal = recordNumber(item, "unit_price_final_usd");
    const adjustedAt = new Date().toISOString();
    item.set("has_manual_price_adjustment", true);
    item.set("manual_final_unit_price_usd", finalUnit);
    item.set("manual_adjustment_reason_code", reason.code);
    item.set("manual_adjustment_reason_text", reason.text);
    item.set("manual_adjusted_by", e.auth.id || "");
    item.set("manual_adjusted_at", adjustedAt);
    app.save(item);
    const result = recalculateOrderEconomics(app, order);
    const adjustmentAudit = createPriceAdjustmentAudit(app, order, item, e.auth, {
      action: "adjust", automaticUnit, previousFinal, newFinal: finalUnit,
      reasonCode: reason.code, reasonText: reason.text,
    });
    const productName = bounded(recordString(item, "product_name") || "Producto", 180);
    createOrderActivity(app, order, e.auth, {
      action: "order_item_price_adjusted",
      severity: "critical",
      changedFields: ["final_unit_price_usd"],
      previousValues: { product_name: productName, final_unit_price_usd: previousFinal },
      newValues: { product_name: productName, final_unit_price_usd: finalUnit, reason_code: reason.code },
      summary: `Ajustó manualmente el precio de ${productName} en ${orderActivityLabel(order)}`,
      sourceEventKey: `orders:price_adjustment:${adjustmentAudit.id}`,
    });
    return privateMutationResponse(app, result);
  });
}

function handleOrderItemAdjustmentReset(e) {
  const body = e.requestInfo().body || {};
  const orderId = privateRouteId(e, "orderId");
  const itemId = privateRouteId(e, "itemId");
  return handlePrivateMutation(e, (app) => {
    const order = requirePrivateOrder(app, e.auth, orderId, "orders.price_adjustment");
    requireAdjustmentState(order);
    const item = requirePrivateItem(app, order, itemId);
    const reason = validateResetPayload(body);
    if (!recordBool(item, "has_manual_price_adjustment")) return privateMutationResponse(app, recalculateOrderEconomics(app, order));
    const automaticUnit = automaticUnitForRecord(item);
    const previousFinal = recordNumber(item, "unit_price_final_usd");
    const previousUnitAdjustment = previousFinal - automaticUnit;
    const previousTotalAdjustment = previousUnitAdjustment * recordNumber(item, "quantity");
    item.set("has_manual_price_adjustment", false);
    item.set("manual_final_unit_price_usd", 0);
    item.set("manual_adjustment_reason_code", "");
    item.set("manual_adjustment_reason_text", "");
    item.set("manual_adjusted_by", "");
    item.set("manual_adjusted_at", "");
    app.save(item);
    const result = recalculateOrderEconomics(app, order);
    const adjustmentAudit = createPriceAdjustmentAudit(app, order, item, e.auth, {
      action: "reset", automaticUnit, previousFinal, newFinal: automaticUnit,
      unitAdjustment: previousUnitAdjustment,
      totalAdjustment: previousTotalAdjustment,
      reasonCode: reason.code, reasonText: reason.text,
    });
    const productName = bounded(recordString(item, "product_name") || "Producto", 180);
    createOrderActivity(app, order, e.auth, {
      action: "order_item_price_adjustment_reset",
      severity: "critical",
      changedFields: ["final_unit_price_usd"],
      previousValues: { product_name: productName, final_unit_price_usd: previousFinal },
      newValues: { product_name: productName, final_unit_price_usd: automaticUnit, reason_code: reason.code },
      summary: `Restableció el precio de ${productName} en ${orderActivityLabel(order)}`,
      sourceEventKey: `orders:price_adjustment:${adjustmentAudit.id}`,
    });
    return privateMutationResponse(app, result);
  });
}

function canonicalizeOrderRecord(app, order) {
  try {
    const original = originalRecord(order);
    if (original && relationId(original, "store") !== relationId(order, "store")) return { code: "order_unavailable", field: "store" };
    if (!findRecord(app, "stores", relationId(order, "store"))) return { code: "order_unavailable", field: "store" };
    applyStoredOrderTotals(app, order);
    return null;
  } catch (_) {
    return { code: "order_unavailable", field: "total" };
  }
}

function recalculateOrderAfterItemMutation(e) {
  try {
    const record = e && e.record;
    const orderId = relationId(record, "order") || relationId(originalRecord(record), "order");
    const order = findRecord(e.app, "orders", orderId);
    if (order) {
      applyStoredOrderTotals(e.app, order);
      e.app.save(order);
    }
  } catch (_) {
    try { e.app.logger().error("PowerZona order total recalculation failed safely.", "code", "PZ_ORDER_TOTAL_RECALC_FAILED"); } catch (_) {}
  }
  return e.next();
}

module.exports = {
  CHECKOUT_PATH,
  COUPON_SCOPES,
  ECONOMIC_SNAPSHOT_VERSION,
  MANUAL_ADJUSTMENT_REASONS,
  PROMOTION_TYPES,
  applyCanonicalItemValues,
  applyStoredOrderTotals,
  buildCheckoutPlan,
  calculateCartPromotions,
  calculateCartWithManualCoupon,
  canonicalizeOrderItemRecord,
  canonicalizeOrderRecord,
  couponLabel,
  deletePrivateOrder,
  discountLabel,
  ensurePrivateOrderToken,
  freezeLegacyLineEconomics,
  handleCheckout,
  handleOrderDelete,
  handleOrderItemAdd,
  handleOrderItemAdjustment,
  handleOrderItemAdjustmentReset,
  handleOrderItemDelete,
  handleOrderItemQuantity,
  handleOrderReceiptToken,
  handleOrderReviewToken,
  handleOrderTransition,
  moveOrderInventory,
  normalizeCoupon,
  normalizePromotion,
  orderInventoryGroups,
  ordersAllowedBySettings,
  parseCheckoutPayload,
  parseOrderTransitionPayload,
  raiseOrderRequestError,
  recalculateOrderEconomics,
  recalculateOrderAfterItemMutation,
  resolveProductLine,
  responseOrder,
  transitionPrivateOrder,
  validateResetPayload,
};
