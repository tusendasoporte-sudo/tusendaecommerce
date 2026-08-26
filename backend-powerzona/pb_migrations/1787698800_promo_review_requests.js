/// <reference path="../pb_data/types.d.ts" />

"use strict";

const REVIEW_MEDIA_PURPOSE = "review";
const PURPOSE_FIELD_ID = "select1787521204";

function idField(id) {
  return {
    autogeneratePattern: "[a-z0-9]{15}", hidden: false, id, max: 15, min: 15,
    name: "id", pattern: "^[a-z0-9]+$", presentable: false, primaryKey: true,
    required: true, system: true, type: "text",
  };
}

function textField(id, name, min, max, required, hidden, pattern) {
  return {
    autogeneratePattern: "", hidden: hidden === true, id, max, min,
    name, pattern: pattern || "", presentable: false, primaryKey: false,
    required: required === true, system: false, type: "text",
  };
}

function relationField(id, name, collectionId, required, cascadeDelete, maximum) {
  const maxSelect = Number.isInteger(maximum) && maximum > 1 ? maximum : 1;
  return {
    cascadeDelete: cascadeDelete === true, collectionId, hidden: false, id,
    maxSelect, minSelect: required ? 1 : 0, name, presentable: false,
    required: required === true, system: false, type: "relation",
  };
}

function selectField(id, name, values, required) {
  return {
    hidden: false, id, maxSelect: 1, name, presentable: false,
    required: required === true, system: false, type: "select", values,
  };
}

function boolField(id, name) {
  return {
    hidden: false, id, name, presentable: false, required: false,
    system: false, type: "bool",
  };
}

function dateField(id, name, required) {
  return {
    hidden: false, id, max: "", min: "", name, presentable: false,
    required: required === true, system: false, type: "date",
  };
}

function autoDateField(id, name, onUpdate) {
  return {
    hidden: false, id, name, onCreate: true, onUpdate: onUpdate === true,
    presentable: false, system: false, type: "autodate",
  };
}

function privateCollection(id, name, fields, indexes) {
  return new Collection({
    id, name, type: "base", system: false,
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields, indexes,
  });
}

function mediaPurpose(app) {
  const media = app.findCollectionByNameOrId("promo_media_assets");
  const purpose = media.fields.getByName("purpose");
  if (!purpose || purpose.id !== PURPOSE_FIELD_ID || !Array.isArray(purpose.values)) {
    throw new Error("incompatible_promo_media_purpose");
  }
  return { media, purpose };
}

migrate((app) => {
  const sites = app.findCollectionByNameOrId("promo_sites");
  const stores = app.findCollectionByNameOrId("stores");
  const users = app.findCollectionByNameOrId("users");
  const reviews = app.findCollectionByNameOrId("reviews");
  const { media, purpose } = mediaPurpose(app);

  if (!purpose.values.includes(REVIEW_MEDIA_PURPOSE)) purpose.values.push(REVIEW_MEDIA_PURPOSE);
  app.save(media);

  const requests = privateCollection(
    "pbc_1787698801",
    "promo_review_requests",
    [
      idField("txt178769880101"),
      relationField("rel178769880102", "site", sites.id, true, true),
      relationField("rel178769880103", "store", stores.id, true, true),
      textField("txt178769880104", "token_sha256", 64, 64, true, true, "^[a-f0-9]{64}$"),
      selectField("sel178769880105", "status", ["pending", "received", "expired", "revoked"], true),
      textField("txt178769880106", "locale", 2, 12, true, false, "^[a-z]{2}(?:-[A-Z]{2})?$"),
      textField("txt178769880107", "customer_label", 0, 120, false, false, ""),
      textField("txt178769880108", "work_label", 0, 240, false, false, ""),
      relationField("rel178769880109", "photo_assets", media.id, false, false, 3),
      relationField("rel178769880110", "review", reviews.id, false, false),
      boolField("bol178769880111", "photo_consent"),
      relationField("rel178769880112", "created_by", users.id, true, false),
      dateField("dat178769880113", "expires_at", true),
      dateField("dat178769880114", "received_at", false),
      dateField("dat178769880115", "revoked_at", false),
      autoDateField("aut178769880116", "created", false),
      autoDateField("aut178769880117", "updated", true),
    ],
    [
      "CREATE UNIQUE INDEX `ux_promo_review_request_token` ON `promo_review_requests` (`token_sha256`)",
      "CREATE INDEX `ix_promo_review_request_site_status` ON `promo_review_requests` (`site`, `status`, `created`)",
      "CREATE INDEX `ix_promo_review_request_store_status` ON `promo_review_requests` (`store`, `status`, `created`)",
      "CREATE UNIQUE INDEX `ux_promo_review_request_review` ON `promo_review_requests` (`review`) WHERE `review` != ''",
      "CREATE INDEX `ix_promo_review_request_expiry` ON `promo_review_requests` (`status`, `expires_at`)",
    ],
  );
  return app.save(requests);
}, (app) => {
  const rows = app.findRecordsByFilter("promo_review_requests", "", "id", 1, 0) || [];
  if (rows.length) throw new Error("unsafe_rollback_promo_review_requests");
  app.delete(app.findCollectionByNameOrId("promo_review_requests"));

  const used = app.findRecordsByFilter(
    "promo_media_assets", "purpose = {:purpose}", "id", 1, 0, { purpose: REVIEW_MEDIA_PURPOSE },
  ) || [];
  if (used.length) throw new Error("unsafe_rollback_promo_review_media");
  const { media, purpose } = mediaPurpose(app);
  purpose.values = purpose.values.filter((value) => value !== REVIEW_MEDIA_PURPOSE);
  return app.save(media);
});
