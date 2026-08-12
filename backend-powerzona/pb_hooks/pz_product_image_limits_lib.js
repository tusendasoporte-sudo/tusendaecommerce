/// <reference path="../pb_data/types.d.ts" />

const capabilities = typeof __hooks === "undefined"
  ? require("./pz_store_capabilities_lib.js")
  : require(`${__hooks}/pz_store_capabilities_lib.js`);
const storageBudget = typeof __hooks === "undefined"
  ? require("./pz_store_storage_budget_lib.js")
  : require(`${__hooks}/pz_store_storage_budget_lib.js`);

const PRODUCT_IMAGE_PHYSICAL_LIMIT = 4;
const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const PRODUCT_IMAGE_MIME_TYPES = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const SAFE_ERRORS = Object.freeze({
  product_image_limit_exceeded: Object.freeze({
    status: 400,
    message: "La cantidad de fotos supera el límite permitido por el plan de esta tienda.",
  }),
  product_image_slot_locked: Object.freeze({
    status: 400,
    message: "No puedes modificar una foto Premium conservada.",
  }),
  product_image_delete_would_activate_locked: Object.freeze({
    status: 400,
    message: "No puedes borrar esta foto mientras existan fotos Premium conservadas. Puedes reemplazarla o volver a Premium para reorganizar toda la galería.",
  }),
  invalid_product_image_order: Object.freeze({
    status: 400,
    message: "El orden de las fotos no es válido.",
  }),
  invalid_product_image: Object.freeze({
    status: 400,
    message: "La foto debe ser JPEG, PNG o WebP válido y pesar como máximo 2 MiB.",
  }),
  store_storage_full: Object.freeze({
    status: 507,
    message: "El almacenamiento de las tiendas alcanzó el límite de 40 GiB.",
  }),
  store_storage_unavailable: Object.freeze({
    status: 503,
    message: "No se pudo verificar el espacio disponible. Intenta de nuevo.",
  }),
  product_image_management_unavailable: Object.freeze({
    status: 400,
    message: "La administración de fotos no está disponible temporalmente.",
  }),
});

class ProductImageLimitError extends Error {
  constructor(code) {
    const safeCode = Object.prototype.hasOwnProperty.call(SAFE_ERRORS, code)
      ? code
      : "product_image_management_unavailable";
    super(SAFE_ERRORS[safeCode].message);
    this.name = "ProductImageLimitError";
    this.code = safeCode;
  }
}

function fail(code) {
  throw new ProductImageLimitError(code);
}

function stringValue(value) {
  try {
    return String(value === null || value === undefined ? "" : value).trim();
  } catch (_) {
    return "";
  }
}

function uniqueStrings(value) {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const result = [];
  for (const item of values) {
    const text = stringValue(item);
    if (text && !result.includes(text)) result.push(text);
  }
  return result;
}

function hasDuplicates(values) {
  return new Set(values).size !== values.length;
}

function sameArray(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameSet(left, right) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function parseImageOrder(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    const raw = parsed.trim();
    if (!raw) return [];
    try {
      parsed = JSON.parse(raw);
    } catch (_) {
      fail("invalid_product_image_order");
    }
  }
  if (parsed instanceof Uint8Array) {
    try {
      parsed = JSON.parse(new TextDecoder().decode(parsed));
    } catch (_) {
      fail("invalid_product_image_order");
    }
  }
  if (!Array.isArray(parsed)) fail("invalid_product_image_order");
  const order = parsed.map((entry) => stringValue(entry));
  if (order.some((entry) => !entry) || hasDuplicates(order)) {
    fail("invalid_product_image_order");
  }
  return order;
}

function orderedProductImages(imagesValue, orderValue) {
  const images = uniqueStrings(imagesValue).slice(0, PRODUCT_IMAGE_PHYSICAL_LIMIT);
  let requested = [];
  try {
    requested = parseImageOrder(orderValue || []);
  } catch (_) {
    requested = [];
  }
  const ordered = requested.filter((name) => images.includes(name));
  return ordered.concat(images.filter((name) => !ordered.includes(name))).slice(0, PRODUCT_IMAGE_PHYSICAL_LIMIT);
}

function validateExactImageOrder(orderValue, finalImages) {
  const order = parseImageOrder(orderValue);
  if (order.length > PRODUCT_IMAGE_PHYSICAL_LIMIT || !sameSet(order, finalImages)) {
    fail("invalid_product_image_order");
  }
  return order;
}

function validateActiveLimit(activeImageLimit) {
  if (!Number.isInteger(activeImageLimit)
      || activeImageLimit < 0
      || activeImageLimit > PRODUCT_IMAGE_PHYSICAL_LIMIT) {
    fail("product_image_management_unavailable");
  }
  return activeImageLimit;
}

function evaluateProductImageMutation(input) {
  const activeImageLimit = validateActiveLimit(input && input.activeImageLimit);
  const beforeImages = uniqueStrings(input && input.beforeImages);
  const afterImages = uniqueStrings(input && input.afterImages);
  if (beforeImages.length > PRODUCT_IMAGE_PHYSICAL_LIMIT || afterImages.length > PRODUCT_IMAGE_PHYSICAL_LIMIT) {
    fail("product_image_limit_exceeded");
  }

  const beforeOrdered = orderedProductImages(beforeImages, input && input.beforeOrder);
  const activeBefore = beforeOrdered.slice(0, activeImageLimit);
  const lockedTail = beforeOrdered.slice(activeImageLimit);
  const deleted = beforeOrdered.filter((name) => !afterImages.includes(name));
  const added = afterImages.filter((name) => !beforeOrdered.includes(name));
  const imagesTouched = Boolean(input && input.imagesTouched)
    || deleted.length > 0
    || added.length > 0;
  const orderTouched = Boolean(input && input.orderTouched);

  if (!imagesTouched && !orderTouched) {
    return Object.freeze({
      activeImageLimit,
      beforeOrdered,
      activeBefore,
      lockedTail,
      finalOrder: beforeOrdered,
      deleted: [],
      added: [],
      shouldSetOrder: false,
    });
  }

  if (afterImages.length > activeImageLimit && lockedTail.length === 0) {
    fail("product_image_limit_exceeded");
  }

  let finalOrder;
  let shouldSetOrder = false;
  if (lockedTail.length > 0) {
    if (deleted.some((name) => lockedTail.includes(name))) {
      fail("product_image_slot_locked");
    }
    if (added.length !== deleted.length) {
      if (deleted.length > added.length) fail("product_image_delete_would_activate_locked");
      fail("product_image_limit_exceeded");
    }
    if (deleted.some((name) => !activeBefore.includes(name))) {
      fail("product_image_slot_locked");
    }

    if (orderTouched) {
      finalOrder = validateExactImageOrder(input.requestedOrder, afterImages);
      const requestedActive = finalOrder.slice(0, activeImageLimit);
      const requestedTail = finalOrder.slice(activeImageLimit);
      const expectedActiveSet = activeBefore.filter((name) => !deleted.includes(name)).concat(added);
      if (!sameArray(requestedTail, lockedTail) || !sameSet(requestedActive, expectedActiveSet)) {
        fail("product_image_slot_locked");
      }
    } else {
      const additions = added.slice();
      const safeActive = activeBefore.map((name) => {
        if (!deleted.includes(name)) return name;
        return additions.shift() || "";
      });
      if (safeActive.some((name) => !name) || additions.length > 0) {
        fail("product_image_management_unavailable");
      }
      finalOrder = safeActive.concat(lockedTail);
      shouldSetOrder = imagesTouched;
    }
  } else if (orderTouched) {
    finalOrder = validateExactImageOrder(input.requestedOrder, afterImages);
  } else {
    finalOrder = orderedProductImages(afterImages, input && input.beforeOrder);
  }

  if (finalOrder.length !== afterImages.length || finalOrder.length > PRODUCT_IMAGE_PHYSICAL_LIMIT) {
    fail("invalid_product_image_order");
  }
  if (lockedTail.length === 0 && finalOrder.length > activeImageLimit) {
    fail("product_image_limit_exceeded");
  }

  return Object.freeze({
    activeImageLimit,
    beforeOrdered,
    activeBefore,
    lockedTail,
    finalOrder,
    deleted,
    added,
    shouldSetOrder,
  });
}

function byteArray(value) {
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) return Uint8Array.from(value);
  if (typeof value === "string") {
    const result = new Uint8Array(value.length);
    for (let index = 0; index < value.length; index += 1) result[index] = value.charCodeAt(index) & 255;
    return result;
  }
  return new Uint8Array();
}

function bytesMatch(bytes, offset, expected) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

function detectProductImageMime(bytesValue) {
  const bytes = byteArray(bytesValue);
  if (bytes.length >= 4
      && bytesMatch(bytes, 0, [0xff, 0xd8, 0xff])
      && bytesMatch(bytes, bytes.length - 2, [0xff, 0xd9])) {
    return "image/jpeg";
  }
  if (bytes.length >= 20
      && bytesMatch(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      && bytesMatch(bytes, bytes.length - 12, [0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])) {
    return "image/png";
  }
  if (bytes.length >= 16
      && bytesMatch(bytes, 0, [0x52, 0x49, 0x46, 0x46])
      && bytesMatch(bytes, 8, [0x57, 0x45, 0x42, 0x50])
      && ([0x20, 0x4c, 0x58].includes(bytes[15]))) {
    const declaredSize = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    if (declaredSize + 8 <= bytes.length) return "image/webp";
  }
  return "";
}

function validateProductImageBytes(sizeValue, bytesValue) {
  const bytes = byteArray(bytesValue);
  const size = Number(sizeValue);
  if (!Number.isInteger(size)
      || size <= 0
      || size > PRODUCT_IMAGE_MAX_BYTES
      || bytes.length !== size
      || !PRODUCT_IMAGE_MIME_TYPES.includes(detectProductImageMime(bytes))) {
    fail("invalid_product_image");
  }
  return true;
}

function recordString(record, key) {
  if (!record) return "";
  try {
    if (typeof record.getString === "function") return stringValue(record.getString(key));
    if (typeof record.get === "function") return stringValue(record.get(key));
    return stringValue(record[key]);
  } catch (_) {
    return "";
  }
}

function recordStrings(record, key) {
  if (!record) return [];
  try {
    if (typeof record.getStringSlice === "function") return uniqueStrings(record.getStringSlice(key));
    if (typeof record.get === "function") return uniqueStrings(record.get(key));
    return uniqueStrings(record[key]);
  } catch (_) {
    return [];
  }
}

function recordOriginal(record) {
  if (!record || typeof record.original !== "function") return null;
  try {
    return record.original();
  } catch (_) {
    return null;
  }
}

function requestBody(event) {
  try {
    const info = event && typeof event.requestInfo === "function" ? event.requestInfo() : null;
    return info && info.body && typeof info.body === "object" ? info.body : {};
  } catch (_) {
    return {};
  }
}

function owns(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

function uploadedFiles(event, key) {
  try {
    return event && typeof event.findUploadedFiles === "function"
      ? Array.from(event.findUploadedFiles(key) || [])
      : [];
  } catch (_) {
    return [];
  }
}

function getUnsavedProductImages(event) {
  try {
    if (event && event.record && typeof event.record.getUnsavedFiles === "function") {
      return Array.from(event.record.getUnsavedFiles("images") || []);
    }
  } catch (_) {}
  return [
    ...uploadedFiles(event, "images"),
    ...uploadedFiles(event, "images+"),
    ...uploadedFiles(event, "+images"),
  ];
}

function uploadedImageName(file, index) {
  const name = stringValue(file && file.name);
  return name || `@f7p8-upload-${index + 1}`;
}

function requestFieldValues(event, key) {
  const request = event && event.request;
  if (!request) return [];
  try {
    if (typeof request.parseMultipartForm === "function") request.parseMultipartForm(8 * 1024 * 1024);
  } catch (_) {}
  const sources = [
    request.multipartForm && request.multipartForm.value,
    request.postForm,
    request.form,
  ];
  for (const source of sources) {
    if (!source) continue;
    try {
      const direct = source[key];
      if (Array.isArray(direct)) return uniqueStrings(direct);
      if (direct !== undefined && direct !== null && direct !== "") return uniqueStrings(direct);
      if (typeof source.has === "function" && source.has(key)) {
        return uniqueStrings(typeof source.get === "function" ? source.get(key) : "");
      }
    } catch (_) {}
  }
  return [];
}

function requestHasField(event, key) {
  const request = event && event.request;
  if (!request) return false;
  const sources = [
    request.multipartForm && request.multipartForm.value,
    request.multipartForm && request.multipartForm.file,
    request.postForm,
    request.form,
  ];
  for (const source of sources) {
    if (!source) continue;
    try {
      if (Object.prototype.hasOwnProperty.call(source, key)) return true;
      if (typeof source.has === "function" && source.has(key)) return true;
    } catch (_) {}
  }
  return false;
}

function requestBodyImageNames(value) {
  const values = Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
  const names = [];
  for (const entry of values) {
    const name = typeof entry === "string" ? stringValue(entry) : stringValue(entry && entry.name);
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

function finalProductImagesForRequest(record, original, flags, mode) {
  const currentNames = recordStrings(record, "images");
  const beforeNames = mode === "update" ? recordStrings(original, "images") : [];
  const uploadedNames = flags.unsavedFiles.map((file, index) => uploadedImageName(file, index));
  if (mode === "create") {
    return uniqueStrings(currentNames.concat(uploadedNames));
  }

  if (owns(flags.body, "images")) {
    return requestBodyImageNames(flags.body.images);
  }

  const afterDeletes = beforeNames.filter((name) => !flags.deleteNames.includes(name));
  if (flags.replaceUploadCount > 0) return uniqueStrings(uploadedNames);
  if (flags.prependUploadCount > 0) return uniqueStrings(uploadedNames.concat(afterDeletes));
  if (flags.appendUploadCount > 0) return uniqueStrings(afterDeletes.concat(uploadedNames));
  if (flags.deleteNames.length > 0) return afterDeletes;
  if (flags.orderTouched && !flags.imagesTouched) return beforeNames;

  if (currentNames.length > 0) return uniqueStrings(currentNames.concat(uploadedNames));
  if (flags.unsavedFiles.length > 0) fail("product_image_management_unavailable");
  return beforeNames;
}

function imageMutationFlags(event, mode) {
  const body = requestBody(event);
  const unsavedFiles = getUnsavedProductImages(event);
  const replaceUploadCount = uploadedFiles(event, "images").length;
  const appendUploadCount = uploadedFiles(event, "images+").length;
  const prependUploadCount = uploadedFiles(event, "+images").length;
  const uploadCount = unsavedFiles.length;
  const deleteNames = uniqueStrings(
    requestFieldValues(event, "images-").concat(requestFieldValues(event, "-images"))
  );
  const imagesTouched = mode === "create"
    || uploadCount > 0
    || deleteNames.length > 0
    || ["images", "images+", "+images", "images-", "-images"].some((key) => requestHasField(event, key))
    || ["images", "images+", "+images", "images-", "-images"].some((key) => owns(body, key));
  return {
    body,
    imagesTouched,
    orderTouched: owns(body, "image_order"),
    unsavedFiles,
    appendUploadCount,
    deleteNames,
    prependUploadCount,
    replaceUploadCount,
  };
}

function readUploadedFileBytes(file) {
  if (!file || !file.reader || typeof file.reader.open !== "function" || typeof toBytes !== "function") {
    fail("invalid_product_image");
  }
  let reader = null;
  try {
    reader = file.reader.open();
    return byteArray(toBytes(reader));
  } catch (_) {
    fail("invalid_product_image");
  } finally {
    try {
      if (reader && typeof reader.close === "function") reader.close();
    } catch (_) {}
  }
}

function validateUploadedProductImages(files) {
  for (const file of files) {
    const bytes = readUploadedFileBytes(file);
    validateProductImageBytes(Number(file && file.size), bytes);
  }
}

function resolveRequestStore(event, mode, flags) {
  const record = event && event.record;
  if (!record || !event.app) fail("product_image_management_unavailable");
  const original = mode === "update" ? recordOriginal(record) : null;
  const originalStoreId = recordString(original, "store");
  const requestedStoreId = recordString(record, "store");
  if (mode === "update" && flags.imagesTouched && (!originalStoreId || requestedStoreId !== originalStoreId)) {
    fail("product_image_management_unavailable");
  }
  const storeId = mode === "update" ? originalStoreId : requestedStoreId;
  if (!storeId) fail("product_image_management_unavailable");
  try {
    return event.app.findRecordById("stores", storeId);
  } catch (_) {
    fail("product_image_management_unavailable");
  }
}

function resolveActiveImageLimit(store) {
  const access = capabilities.resolveStoreCapabilityAccess(store, "max_product_images");
  if (!access || !access.allowed) fail("product_image_management_unavailable");
  return validateActiveLimit(access.limit);
}

function getSafeProductImageError(error) {
  const code = error && Object.prototype.hasOwnProperty.call(SAFE_ERRORS, error.code)
    ? error.code
    : "product_image_management_unavailable";
  const definition = SAFE_ERRORS[code];
  return Object.freeze({ status: definition.status, code, message: definition.message });
}

function validateProductImageRequest(event, mode) {
  const flags = imageMutationFlags(event, mode);
  if (mode === "update" && !flags.imagesTouched && !flags.orderTouched) {
    return null;
  }

  try {
    const record = event && event.record;
    if (!record) fail("product_image_management_unavailable");
    const original = mode === "update" ? recordOriginal(record) : null;
    if (mode === "update" && !original) fail("product_image_management_unavailable");
    const store = resolveRequestStore(event, mode, flags);
    const activeImageLimit = resolveActiveImageLimit(store);
    validateUploadedProductImages(flags.unsavedFiles);
    if (flags.unsavedFiles.length > 0) {
      const incomingBytes = flags.unsavedFiles.reduce(
        (total, file) => total + Number(file && file.size || 0),
        0,
      );
      storageBudget.assertStoreStorageBudget(event.app, incomingBytes, { now: new Date() });
    }
    const afterImages = finalProductImagesForRequest(record, original, flags, mode);
    const result = evaluateProductImageMutation({
      activeImageLimit,
      beforeImages: mode === "update" ? recordStrings(original, "images") : [],
      beforeOrder: mode === "update" ? recordString(original, "image_order") : [],
      afterImages,
      imagesTouched: flags.imagesTouched,
      orderTouched: flags.orderTouched,
      requestedOrder: recordString(record, "image_order"),
    });
    if (result.shouldSetOrder && typeof record.set === "function") {
      if (result.finalOrder.some((name) => name.startsWith("@f7p8-upload-"))) {
        fail("product_image_management_unavailable");
      }
      record.set("image_order", JSON.stringify(result.finalOrder));
    }
    return null;
  } catch (error) {
    return getSafeProductImageError(error);
  }
}

module.exports = {
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
  PRODUCT_IMAGE_PHYSICAL_LIMIT,
  ProductImageLimitError,
  detectProductImageMime,
  evaluateProductImageMutation,
  getSafeProductImageError,
  orderedProductImages,
  parseImageOrder,
  validateExactImageOrder,
  validateProductImageRequest,
  validateProductImageBytes,
};
