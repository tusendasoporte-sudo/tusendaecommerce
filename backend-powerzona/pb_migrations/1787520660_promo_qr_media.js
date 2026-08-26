/// <reference path="../pb_data/types.d.ts" />

"use strict";

const PURPOSE_FIELD_ID = "select1787521204";
const QR_PURPOSE = "qr";

function purposeField(app) {
  const media = app.findCollectionByNameOrId("promo_media_assets");
  const purpose = media.fields.getByName("purpose");
  if (!purpose || purpose.id !== PURPOSE_FIELD_ID || !Array.isArray(purpose.values)) {
    throw new Error("incompatible_promo_media_purpose");
  }
  return { media, purpose };
}

migrate((app) => {
  const { media, purpose } = purposeField(app);
  if (!purpose.values.includes(QR_PURPOSE)) purpose.values.push(QR_PURPOSE);
  app.save(media);
}, (app) => {
  const used = app.findRecordsByFilter(
    "promo_media_assets", "purpose = {:purpose}", "id", 1, 0, { purpose: QR_PURPOSE },
  ) || [];
  if (used.length) throw new Error("unsafe_rollback_promo_qr_media");
  const { media, purpose } = purposeField(app);
  purpose.values = purpose.values.filter((value) => value !== QR_PURPOSE);
  app.save(media);
});
