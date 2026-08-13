export const PRODUCT_CREATE_STEP_COUNT = 3;

export function clampProductCreateStep(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(PRODUCT_CREATE_STEP_COUNT, Math.floor(numeric)));
}

export function validateProductCreateWizardStep({
  step = 1,
  name = '',
  allowDraft = false,
  currencyId = '',
  usesVariations = false,
  hasEligibleVariation = false,
  parentCommercialError = '',
} = {}) {
  if (!String(name || '').trim()) {
    return { valid: false, code: 'missing_name', message: 'Escribe el nombre del producto para continuar.' };
  }
  if (allowDraft || clampProductCreateStep(step) === 1) return { valid: true, code: 'valid', message: '' };
  if (!String(currencyId || '').trim()) {
    return { valid: false, code: 'missing_currency', message: 'Selecciona la moneda del precio.' };
  }
  if (usesVariations && !hasEligibleVariation) {
    return {
      valid: false,
      code: 'missing_variation',
      message: 'Crea al menos una variación activa con precio válido antes de continuar.',
    };
  }
  if (!usesVariations && String(parentCommercialError || '').trim()) {
    return { valid: false, code: 'invalid_parent_commerce', message: String(parentCommercialError).trim() };
  }
  return { valid: true, code: 'valid', message: '' };
}

export function getProductCreationPublishPlan({
  asDraft = false,
  usesVariations = false,
  requestedVisible = true,
} = {}) {
  const staged = Boolean(asDraft || usesVariations);
  return Object.freeze({
    initialVisible: staged ? false : Boolean(requestedVisible),
    initialHasVariations: false,
    finalVisible: asDraft ? false : Boolean(requestedVisible),
    finalHasVariations: Boolean(usesVariations),
  });
}

export function parseProductVariationValues(value) {
  return [...new Set(String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean))];
}

export function buildProductVariationCombinations({
  attributeOne = '',
  valuesOne = '',
  attributeTwo = '',
  valuesTwo = '',
  limit = 30,
} = {}) {
  const firstAttribute = String(attributeOne || '').trim();
  const firstValues = parseProductVariationValues(valuesOne);
  const secondAttribute = String(attributeTwo || '').trim();
  const secondValues = parseProductVariationValues(valuesTwo);
  if (!firstAttribute || !firstValues.length) return { valid: false, code: 'missing_primary_attribute', items: [] };
  if ((secondAttribute && !secondValues.length) || (!secondAttribute && secondValues.length)) {
    return { valid: false, code: 'incomplete_secondary_attribute', items: [] };
  }
  const items = secondAttribute
    ? firstValues.flatMap((first) => secondValues.map((second) => ({
        type: `${firstAttribute} / ${secondAttribute}`,
        value: `${first} / ${second}`,
      })))
    : firstValues.map((value) => ({ type: firstAttribute, value }));
  if (items.length > Math.max(1, Number(limit) || 30)) return { valid: false, code: 'combination_limit', items: [] };
  return { valid: true, code: 'valid', items };
}
