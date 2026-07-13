/// <reference path="../pb_data/types.d.ts" />

onBootstrap((e) => {
  const nextResult = e.next();
  try {
    require(`${__hooks}/pz_security_health_lib.js`).logSecurityRuntimeStatus($app);
  } catch (_) {}
  return nextResult;
});

routerAdd(
  "GET",
  "/api/pz/security/health",
  (e) => require(`${__hooks}/pz_security_health_lib.js`).handleSecurityHealth(e),
  $apis.skipSuccessActivityLog()
);
