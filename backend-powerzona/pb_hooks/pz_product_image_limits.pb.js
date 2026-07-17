/// <reference path="../pb_data/types.d.ts" />

onRecordCreateRequest((e) => {
  const safe = require(`${__hooks}/pz_product_image_limits_lib.js`).validateProductImageRequest(e, "create");
  if (safe) {
    const code = String(safe.code || "product_image_management_unavailable");
    const message = String(safe.message || "La administración de fotos no está disponible temporalmente.");
    const status = Number(safe.status) || 503;
    const field = code === "invalid_product_image_order" ? "image_order" : "images";
    const data = {};
    data[field] = new ValidationError(code, message);
    if (status === 400) throw new BadRequestError(message, data);
    throw new InternalServerError(message, data);
  }
  return e.next();
}, "products");

onRecordUpdateRequest((e) => {
  const safe = require(`${__hooks}/pz_product_image_limits_lib.js`).validateProductImageRequest(e, "update");
  if (safe) {
    const code = String(safe.code || "product_image_management_unavailable");
    const message = String(safe.message || "La administración de fotos no está disponible temporalmente.");
    const status = Number(safe.status) || 503;
    const field = code === "invalid_product_image_order" ? "image_order" : "images";
    const data = {};
    data[field] = new ValidationError(code, message);
    if (status === 400) throw new BadRequestError(message, data);
    throw new InternalServerError(message, data);
  }
  return e.next();
}, "products");
