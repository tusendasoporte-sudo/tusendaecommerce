/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  "POST",
  "/api/pz/raffles/public",
  (e) => require(`${__hooks}/pz_raffles_premium_lib.js`).handlePublic(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/raffles/enter",
  (e) => require(`${__hooks}/pz_raffles_premium_lib.js`).handleEnter(e),
  $apis.bodyLimit(4096),
  $apis.skipSuccessActivityLog(),
);

routerAdd(
  "POST",
  "/api/pz/raffles/status",
  (e) => require(`${__hooks}/pz_raffles_premium_lib.js`).handleStatus(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog(),
);
