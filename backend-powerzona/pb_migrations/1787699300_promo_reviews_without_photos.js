/// <reference path="../pb_data/types.d.ts" />

"use strict";

const REVIEW_MEDIA_PURPOSE = "review";
const PURPOSE_FIELD_ID = "select1787521204";
const PHOTO_ASSETS_FIELD_ID = "rel178769880109";
const PHOTO_CONSENT_FIELD_ID = "bol178769880111";

function optionalField(collection, name) {
  try { return collection.fields.getByName(name); } catch (_) { return null; }
}

function fieldType(field) {
  try { return typeof field.type === "function" ? field.type() : field.type; } catch (_) { return ""; }
}

function purposeField(app) {
  const media = app.findCollectionByNameOrId("promo_media_assets");
  const purpose = optionalField(media, "purpose");
  if (!purpose || purpose.id !== PURPOSE_FIELD_ID || !Array.isArray(purpose.values)) {
    throw new Error("incompatible_promo_media_purpose");
  }
  return { media, purpose };
}

migrate((app) => {
  const requests = app.findCollectionByNameOrId("promo_review_requests");
  const photoAssets = optionalField(requests, "photo_assets");
  const photoConsent = optionalField(requests, "photo_consent");
  if (photoAssets && fieldType(photoAssets) !== "relation") {
    throw new Error("incompatible_promo_review_photo_assets");
  }
  if (photoConsent && fieldType(photoConsent) !== "bool") {
    throw new Error("incompatible_promo_review_photo_consent");
  }
  if (photoAssets) requests.fields.removeById(photoAssets.id);
  if (photoConsent) requests.fields.removeById(photoConsent.id);
  if (photoAssets || photoConsent) app.save(requests);

  while (true) {
    const rows = Array.from(app.findRecordsByFilter(
      "promo_media_assets", "purpose = {:purpose}", "id", 500, 0,
      { purpose: REVIEW_MEDIA_PURPOSE },
    ) || []);
    if (!rows.length) break;
    rows.forEach((record) => app.delete(record));
  }

  const { media, purpose } = purposeField(app);
  purpose.values = purpose.values.filter((value) => value !== REVIEW_MEDIA_PURPOSE);
  app.save(media);
}, (app) => {
  const { media, purpose } = purposeField(app);
  if (!purpose.values.includes(REVIEW_MEDIA_PURPOSE)) purpose.values.push(REVIEW_MEDIA_PURPOSE);
  app.save(media);

  const requests = app.findCollectionByNameOrId("promo_review_requests");
  if (!optionalField(requests, "photo_assets")) {
    requests.fields.add(new Field({
      cascadeDelete: false,
      collectionId: media.id,
      hidden: false,
      id: PHOTO_ASSETS_FIELD_ID,
      maxSelect: 3,
      minSelect: 0,
      name: "photo_assets",
      presentable: false,
      required: false,
      system: false,
      type: "relation",
    }));
  }
  if (!optionalField(requests, "photo_consent")) {
    requests.fields.add(new Field({
      hidden: false,
      id: PHOTO_CONSENT_FIELD_ID,
      name: "photo_consent",
      presentable: false,
      required: false,
      system: false,
      type: "bool",
    }));
  }
  app.save(requests);
});
