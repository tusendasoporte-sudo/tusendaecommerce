/// <reference path="../pb_data/types.d.ts" />

const EVENTS = "admin_app_release_events";

migrate((app) => {
  const events = app.findCollectionByNameOrId(EVENTS);
  const action = events.fields.getByName("action");
  action.values = Array.from(new Set([...(action.values || []), "release_resumed"]));
  app.save(events);
}, (app) => {
  const resumed = app.findRecordsByFilter(EVENTS, "action = 'release_resumed'", "", 1, 0) || [];
  if (resumed.length) throw new Error("unsafe_rollback_admin_app_publication_controls");

  const events = app.findCollectionByNameOrId(EVENTS);
  const action = events.fields.getByName("action");
  action.values = (action.values || []).filter((value) => value !== "release_resumed");
  app.save(events);
});
