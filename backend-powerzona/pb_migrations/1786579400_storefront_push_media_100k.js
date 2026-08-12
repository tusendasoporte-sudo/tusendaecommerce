/// <reference path="../pb_data/types.d.ts" />

const PUSH_MEDIA_COLLECTION = "push_media";
const PUSH_MEDIA_MAX_BYTES_100K = 100 * 1024;
const PUSH_MEDIA_PREVIOUS_MAX_BYTES = 768000;

function setPushMediaMaximum(app, maxBytes) {
  const collection = app.findCollectionByNameOrId(PUSH_MEDIA_COLLECTION);
  collection.fields.getByName("file").maxSize = maxBytes;
  collection.fields.getByName("bytes").max = maxBytes;
  return app.save(collection);
}

migrate((app) => {
  return setPushMediaMaximum(app, PUSH_MEDIA_MAX_BYTES_100K);
}, (app) => {
  return setPushMediaMaximum(app, PUSH_MEDIA_PREVIOUS_MAX_BYTES);
});
