/// <reference path="../pb_data/types.d.ts" />

const SETTINGS_PREVIOUS_READ_RULE = '(active = true) || (@request.auth.role = "master_admin") || ((@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store)';
const SETTINGS_TENANT_READ_RULE = '((@request.auth.id = "" || @request.auth.role = "customer") && active = true) || (@request.auth.role = "master_admin") || ((@request.auth.role = "store_admin" || @request.auth.role = "store_staff") && store = @request.auth.store)';

migrate((app) => {
  const settings = app.findCollectionByNameOrId("settings");
  settings.listRule = SETTINGS_TENANT_READ_RULE;
  settings.viewRule = SETTINGS_TENANT_READ_RULE;
  return app.save(settings);
}, (app) => {
  const settings = app.findCollectionByNameOrId("settings");
  settings.listRule = SETTINGS_PREVIOUS_READ_RULE;
  settings.viewRule = SETTINGS_PREVIOUS_READ_RULE;
  return app.save(settings);
});
