/// <reference path="../pb_data/types.d.ts" />

routerUse(new Middleware(
  (e) => require(`${__hooks}/pz_promo_security_lib.js`).enforceRequest(e),
  -950,
));
