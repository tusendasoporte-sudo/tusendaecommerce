/// <reference path="../pb_data/types.d.ts" />

const TAXONOMY_CARD_THUMB = "480x270";
const TAXONOMY_IMAGE_FIELDS = [
  ["categories", "image"],
  ["subcategories", "image"],
];

function findCollectionSafe(app, name) {
  try {
    return app.findCollectionByNameOrId(name);
  } catch (_) {
    return null;
  }
}

function updateTaxonomyThumbs(app, collectionName, fieldName, updater) {
  const collection = findCollectionSafe(app, collectionName);
  if (!collection) return;

  const field = collection.fields.getByName(fieldName);
  const currentThumbs = Array.isArray(field.thumbs) ? [...field.thumbs] : [];
  const nextThumbs = updater(currentThumbs);
  if (nextThumbs.length === currentThumbs.length
    && nextThumbs.every((thumb, index) => thumb === currentThumbs[index])) return;
  field.thumbs = nextThumbs;
  app.save(collection);
}

migrate((app) => {
  TAXONOMY_IMAGE_FIELDS.forEach(([collectionName, fieldName]) => {
    updateTaxonomyThumbs(app, collectionName, fieldName, (currentThumbs) => (
      currentThumbs.includes(TAXONOMY_CARD_THUMB)
        ? currentThumbs
        : [...currentThumbs, TAXONOMY_CARD_THUMB]
    ));
  });
}, (app) => {
  TAXONOMY_IMAGE_FIELDS.forEach(([collectionName, fieldName]) => {
    updateTaxonomyThumbs(app, collectionName, fieldName, (currentThumbs) => (
      currentThumbs.filter((thumb) => thumb !== TAXONOMY_CARD_THUMB)
    ));
  });
});
