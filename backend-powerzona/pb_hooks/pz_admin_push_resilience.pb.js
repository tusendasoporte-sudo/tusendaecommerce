/// <reference path="../pb_data/types.d.ts" />

routerAdd(
  'POST',
  '/api/pz/admin-push/v2/register',
  (e) => require(__hooks + '/pz_admin_push_resilience_lib.js').handleRegister(e),
  (e) => require(__hooks + '/pz_admin_push_resilience_lib.js').requireAuthenticatedUser(e),
  $apis.requireAuth('users'),
  $apis.bodyLimit(8192),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  'POST',
  '/api/pz/admin-push/v2/notifications/sync',
  (e) => require(__hooks + '/pz_admin_push_resilience_lib.js').handleSync(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  'POST',
  '/api/pz/admin-push/v2/notifications/ack',
  (e) => require(__hooks + '/pz_admin_push_resilience_lib.js').handleAck(e),
  $apis.bodyLimit(12288),
  $apis.skipSuccessActivityLog()
);

routerAdd(
  'POST',
  '/api/pz/admin-push/v2/firebase',
  (e) => require(__hooks + '/pz_admin_push_resilience_lib.js').handleFirebase(e),
  $apis.bodyLimit(2048),
  $apis.skipSuccessActivityLog()
);

cronAdd(
  'pz_admin_push_receipt_cleanup',
  '17 * * * *',
  () => {
    try {
      const result = require(__hooks + '/pz_admin_push_resilience_lib.js')
        .cleanupReceipts($app, new Date());
      if (result.failed > 0) {
        try {
          $app.logger().error(
            'Admin push receipt cleanup was partially blocked.',
            'code', 'PZ_ADMIN_PUSH_CLEANUP_PARTIAL',
            'failed', result.failed
          );
        } catch (_) {}
      }
    } catch (_) {
      try {
        $app.logger().error(
          'Admin push receipt cleanup failed safely.',
          'code', 'PZ_ADMIN_PUSH_CLEANUP_FAILED'
        );
      } catch (_) {}
    }
  }
);
