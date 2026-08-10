package com.tusenda84.admin;

import android.content.Context;
import android.content.SharedPreferences;

final class PushRegistrationStore {
    private static final String PREFERENCES = "pz_admin_push";
    private static final String INSTALLATION_ID = "firebase_installation_id";
    private static final String PERMISSION_REQUESTED = "notification_permission_requested";

    private PushRegistrationStore() {}

    static void saveInstallationId(Context context, String installationId) {
        String value = installationId == null ? "" : installationId.trim();
        if (value.isEmpty()) return;
        preferences(context).edit().putString(INSTALLATION_ID, value).apply();
    }

    static String getInstallationId(Context context) {
        return preferences(context).getString(INSTALLATION_ID, "");
    }

    static void markPermissionRequested(Context context) {
        preferences(context).edit().putBoolean(PERMISSION_REQUESTED, true).apply();
    }

    static boolean wasPermissionRequested(Context context) {
        return preferences(context).getBoolean(PERMISSION_REQUESTED, false);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
