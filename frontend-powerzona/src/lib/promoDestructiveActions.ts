import { normalizePromoCmsDraftResponse } from './promoCms.ts';
import { normalizePromoGalleryCatalog, promoGalleryErrorMessage } from './promoGallery.ts';

const RECORD_ID_PATTERN = /^[a-z0-9]{15}$/;
const MEDIA_BUTTON_SELECTOR = [
  '[data-promo-service-products] .pz-promo-media-slot button.is-danger',
  '[data-promo-service-products] .pz-promo-gallery__item button.is-danger',
  '[data-promo-cms] [data-cms-remove-logo]',
  '[data-promo-cms] [data-cms-remove-qr]',
].join(',');

type JsonRecord = Record<string, any>;

function adminLocale() {
  const root = document.querySelector<HTMLElement>('[data-promo-admin-root]');
  return root?.dataset.promoAdminLocale === 'en' ? 'en' : 'es';
}

function copy(es: string, en: string) {
  return adminLocale() === 'en' ? en : es;
}

function requestError(code: unknown, fallback: string) {
  const normalized = String(code || '');
  if (normalized.startsWith('promo_media_')) return promoGalleryErrorMessage(normalized);
  if (normalized === 'promo_reviews_conflict') {
    return copy('La reseña cambió en otra sesión. Actualiza la página e inténtalo de nuevo.', 'The review changed in another session. Refresh the page and try again.');
  }
  if (normalized === 'promo_permission_denied') {
    return copy('Esta sesión no tiene permiso para eliminar este elemento.', 'This session cannot delete this item.');
  }
  return fallback;
}

async function successfulJson(response: Response, fallback: string) {
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) {
    const error = new Error(requestError(result?.error, fallback)) as Error & { code?: string };
    error.code = String(result?.error || 'unavailable');
    throw error;
  }
  return result;
}

function mediaRoot(button: HTMLButtonElement) {
  return button.closest<HTMLElement>('[data-promo-service-products], [data-promo-cms]');
}

function assetIdFromButton(button: HTMLButtonElement) {
  const card = button.closest<HTMLElement>('.pz-promo-media-slot, .pz-promo-gallery__item');
  const source = card?.querySelector<HTMLImageElement | HTMLVideoElement>('img[src*="asset="], video[src*="asset="]');
  if (!source) return '';
  try {
    const assetId = new URL(source.currentSrc || source.src, window.location.origin).searchParams.get('asset') || '';
    return RECORD_ID_PATTERN.test(assetId) ? assetId : '';
  } catch (_) {
    return '';
  }
}

function hasUnsavedChanges(root: HTMLElement) {
  const save = root.querySelector<HTMLButtonElement>('[data-products-save], [data-cms-save]');
  return Boolean(save && !save.disabled);
}

function showMediaMessage(root: HTMLElement, message: string, error = false) {
  const productsAlert = root.querySelector<HTMLElement>('[data-products-alert]');
  const productsStatus = root.querySelector<HTMLElement>('[data-products-status]');
  if (!error && productsStatus) {
    productsStatus.textContent = message;
    return;
  }
  if (error && productsAlert) {
    productsAlert.hidden = false;
    productsAlert.textContent = message;
    productsAlert.dataset.tone = error ? 'error' : 'success';
    productsAlert.focus();
    return;
  }
  const cmsError = root.querySelector<HTMLElement>('[data-cms-error]');
  const cmsErrorMessage = root.querySelector<HTMLElement>('[data-cms-error-message]');
  const cmsStatus = root.querySelector<HTMLElement>('[data-cms-status]');
  if (error && cmsError && cmsErrorMessage) {
    cmsError.hidden = false;
    cmsErrorMessage.textContent = message;
    cmsError.focus();
  } else if (cmsStatus) {
    cmsStatus.hidden = false;
    const label = cmsStatus.querySelector<HTMLElement>('span:last-child');
    if (label) label.textContent = message;
  }
}

function mediaUseKeys(documentValue: JsonRecord, assetId: string) {
  const refs = documentValue.media_refs && typeof documentValue.media_refs === 'object'
    ? documentValue.media_refs as JsonRecord
    : {};
  return new Set(Object.entries(refs)
    .filter(([, reference]) => String((reference as JsonRecord)?.asset_id || '') === assetId)
    .map(([useKey]) => useKey));
}

function scrubMediaUseKeys(value: unknown, useKeys: ReadonlySet<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry) => scrubMediaUseKeys(entry, useKeys));
    return;
  }
  Object.entries(value as JsonRecord).forEach(([key, entry]) => {
    if (key.endsWith('media_use_key') && typeof entry === 'string' && useKeys.has(entry)) {
      (value as JsonRecord)[key] = '';
      return;
    }
    if (key.endsWith('media_use_keys') && Array.isArray(entry)) {
      (value as JsonRecord)[key] = entry.filter((candidate) => !useKeys.has(String(candidate || '')));
      return;
    }
    scrubMediaUseKeys(entry, useKeys);
  });
}

function removeAssetReferences(documentValue: JsonRecord, assetId: string) {
  const useKeys = mediaUseKeys(documentValue, assetId);
  if (!useKeys.size) return false;
  useKeys.forEach((useKey) => delete documentValue.media_refs[useKey]);
  Object.values(documentValue.content_by_locale || {}).forEach((localized) => {
    const mediaAlt = (localized as JsonRecord)?.media_alt;
    if (!mediaAlt || typeof mediaAlt !== 'object') return;
    useKeys.forEach((useKey) => delete mediaAlt[useKey]);
  });
  scrubMediaUseKeys(documentValue, useKeys);
  return true;
}

async function catalogPosterId(storeSlug: string, assetId: string) {
  const response = await fetch(`/api/admin/promo-media?store=${encodeURIComponent(storeSlug)}`, {
    headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin',
  });
  const catalog = normalizePromoGalleryCatalog(await successfulJson(
    response,
    copy('No se pudo comprobar el archivo.', 'The file could not be checked.'),
  ));
  return catalog.assets.find((asset) => asset.assetId === assetId)?.posterAssetId || '';
}

async function saveWithoutAsset(storeSlug: string, assetId: string) {
  const endpoint = `/api/admin/promo-cms?store=${encodeURIComponent(storeSlug)}`;
  const current = normalizePromoCmsDraftResponse(await successfulJson(
    await fetch(endpoint, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' }),
    copy('No se pudo cargar la página antes de eliminar.', 'The page could not be loaded before deletion.'),
  ));
  const changed = removeAssetReferences(current.document, assetId);
  if (!changed) return;
  const result = await successfulJson(await fetch(endpoint, {
    method: 'PUT',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ expected_version: current.version, document: current.document }),
    cache: 'no-store',
    credentials: 'same-origin',
  }), copy('No se pudieron retirar todas las referencias de la imagen.', 'All image references could not be removed.'));
  normalizePromoCmsDraftResponse({ ok: result.ok, contract: result.contract, draft: result.draft });
}

async function deleteAsset(storeSlug: string, assetId: string) {
  return successfulJson(await fetch(`/api/admin/promo-media-delete?store=${encodeURIComponent(storeSlug)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ asset_id: assetId }),
    cache: 'no-store',
    credentials: 'same-origin',
  }), copy('No se pudo eliminar físicamente el archivo.', 'The file could not be permanently deleted.'));
}

const deletingAssets = new Set<string>();

async function permanentlyDeleteMedia(button: HTMLButtonElement) {
  const root = mediaRoot(button);
  const assetId = assetIdFromButton(button);
  const storeSlug = String(root?.dataset.storeSlug || '');
  if (!root || !RECORD_ID_PATTERN.test(assetId) || !storeSlug || deletingAssets.has(assetId)) return;
  if (hasUnsavedChanges(root)) {
    showMediaMessage(root, copy(
      'Guarda primero los cambios pendientes y luego elimina la imagen.',
      'Save pending changes before deleting the image.',
    ), true);
    return;
  }
  const confirmed = window.confirm(copy(
    'Esta acción eliminará definitivamente el archivo de PocketBase y de todos los lugares de esta página. No se puede deshacer. ¿Deseas continuar?',
    'This permanently deletes the file from PocketBase and every place on this page. It cannot be undone. Continue?',
  ));
  if (!confirmed) return;
  deletingAssets.add(assetId);
  const priorDisabled = button.disabled;
  button.disabled = true;
  button.textContent = copy('Eliminando…', 'Deleting…');
  showMediaMessage(root, copy('Retirando referencias y eliminando el archivo…', 'Removing references and deleting the file…'));
  try {
    const posterAssetId = await catalogPosterId(storeSlug, assetId);
    await saveWithoutAsset(storeSlug, assetId);
    await deleteAsset(storeSlug, assetId);
    if (RECORD_ID_PATTERN.test(posterAssetId) && posterAssetId !== assetId) {
      try { await deleteAsset(storeSlug, posterAssetId); } catch (_) { /* It may still serve another video. */ }
    }
    showMediaMessage(root, copy('Archivo eliminado definitivamente.', 'File permanently deleted.'));
    window.setTimeout(() => window.location.reload(), 250);
  } catch (error) {
    showMediaMessage(root, String((error as Error)?.message || copy(
      'No se pudo completar la eliminación.',
      'Deletion could not be completed.',
    )), true);
    button.disabled = priorDisabled;
    button.textContent = copy('Eliminar', 'Delete');
  } finally {
    deletingAssets.delete(assetId);
  }
}

function reviewRoot(button: HTMLButtonElement) {
  return button.closest<HTMLElement>('[data-promo-reviews-editor]');
}

async function permanentlyDeleteReview(button: HTMLButtonElement) {
  const root = reviewRoot(button);
  const card = button.closest<HTMLElement>('.pz-promo-reviews-admin__card');
  const storeSlug = String(root?.dataset.storeSlug || '');
  const reviewId = String(card?.dataset.reviewId || '');
  const expectedUpdated = String(card?.querySelector<HTMLElement>('[data-review-updated]')?.dataset.reviewUpdated || '');
  if (!root || !card || !RECORD_ID_PATTERN.test(reviewId) || !expectedUpdated) return;
  if (!window.confirm(copy(
    'Esta acción eliminará definitivamente la reseña y, si existen, su solicitud privada y fotos asociadas. No se puede deshacer. ¿Deseas continuar?',
    'This permanently deletes the review and, when present, its private request and photos. It cannot be undone. Continue?',
  ))) return;
  const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('button'));
  buttons.forEach((candidate) => { candidate.disabled = true; });
  button.textContent = copy('Eliminando…', 'Deleting…');
  try {
    await successfulJson(await fetch(`/api/admin/promo-review-delete?store=${encodeURIComponent(storeSlug)}`, {
      method: 'DELETE',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_id: reviewId, expected_updated: expectedUpdated }),
      cache: 'no-store',
      credentials: 'same-origin',
    }), copy('No se pudo eliminar la reseña.', 'The review could not be deleted.'));
    const alertBox = root.querySelector<HTMLElement>('[data-reviews-alert]');
    if (alertBox) {
      alertBox.hidden = false;
      alertBox.dataset.tone = 'success';
      alertBox.textContent = copy('Reseña eliminada definitivamente.', 'Review permanently deleted.');
    }
    root.querySelector<HTMLButtonElement>('[data-reviews-refresh]')?.click();
  } catch (error) {
    const alertBox = root.querySelector<HTMLElement>('[data-reviews-alert]');
    if (alertBox) {
      alertBox.hidden = false;
      alertBox.dataset.tone = 'error';
      alertBox.textContent = String((error as Error)?.message || copy('No se pudo eliminar la reseña.', 'The review could not be deleted.'));
    }
    buttons.forEach((candidate) => { candidate.disabled = false; });
    button.textContent = copy('Eliminar', 'Delete');
  }
}

function enhanceMediaButtons(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLButtonElement>(MEDIA_BUTTON_SELECTOR).forEach((button) => {
    if (!assetIdFromButton(button)) return;
    button.textContent = copy('Eliminar', 'Delete');
    button.setAttribute('aria-label', copy('Eliminar archivo definitivamente', 'Permanently delete file'));
  });
}

function enhanceReviewButtons(scope: ParentNode = document) {
  scope.querySelectorAll<HTMLElement>('[data-promo-reviews-editor][data-can-moderate="true"] .pz-promo-reviews-admin__card').forEach((card) => {
    const actions = card.querySelector<HTMLElement>('.pz-promo-reviews-admin__actions');
    if (!actions || actions.querySelector('[data-review-delete]')) return;
    const reference = actions.querySelector<HTMLElement>('[data-review-updated]');
    if (!reference?.dataset.reviewUpdated) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.reviewDelete = 'true';
    button.dataset.tone = 'danger';
    button.textContent = copy('Eliminar', 'Delete');
    button.addEventListener('click', () => { void permanentlyDeleteReview(button); });
    actions.append(button);
  });
}

function initialize() {
  enhanceMediaButtons();
  enhanceReviewButtons();
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>(MEDIA_BUTTON_SELECTOR)
      : null;
    if (!button || !assetIdFromButton(button)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void permanentlyDeleteMedia(button);
  }, true);
  const observer = new MutationObserver((records) => {
    records.forEach((record) => record.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      enhanceMediaButtons(node);
      enhanceReviewButtons(node);
      if (node.matches(MEDIA_BUTTON_SELECTOR)) enhanceMediaButtons(node.parentElement || document);
      if (node.matches('.pz-promo-reviews-admin__card')) enhanceReviewButtons(node.parentElement || document);
    }));
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (typeof document !== 'undefined') initialize();
