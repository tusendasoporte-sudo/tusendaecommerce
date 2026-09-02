/// <reference path="../pb_data/types.d.ts" />

"use strict";

function activeMaster(app) {
  const rows = Array.from(app.findRecordsByFilter(
    "users",
    "role = {:role} && status = {:status}",
    "created,id",
    1,
    0,
    { role: "master_admin", status: "active" },
  ) || []);
  return rows[0] || null;
}

migrate((app) => {
  const actor = activeMaster(app);
  if (!actor) return;
  const themeApi = typeof __hooks === "undefined"
    ? require("../pb_hooks/pz_promo_theme_api_lib.js")
    : require(`${__hooks}/pz_promo_theme_api_lib.js`);
  themeApi.ensureFirstPartyCatalog(app, actor, {
    promoteBootstrapDrafts: true,
    auditOrigin: "migration",
  });
}, () => {
  // El catálogo no se elimina: sus releases pueden quedar referenciados por sitios activos.
});
