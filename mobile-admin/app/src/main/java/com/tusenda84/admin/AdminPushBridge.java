package com.tusenda84.admin;

import android.webkit.JavascriptInterface;

final class AdminPushBridge {
    private final MainActivity activity;

    AdminPushBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return true;
    }

    @JavascriptInterface
    public String permissionState() {
        return activity.getPushPermissionState();
    }

    @JavascriptInterface
    public void requestState() {
        activity.runOnUiThread(activity::emitPushStateToWeb);
    }

    @JavascriptInterface
    public void requestPermission() {
        activity.runOnUiThread(activity::requestPushPermissionFromWeb);
    }

    @JavascriptInterface
    public void openSettings() {
        activity.runOnUiThread(activity::openNotificationSettings);
    }

    @JavascriptInterface
    public boolean completeRegistration(String credential, String storeId) {
        return activity.completePushRegistration(credential, storeId);
    }

    @JavascriptInterface
    public void setNotificationsEnabled(boolean enabled) {
        activity.setPushNotificationsEnabled(enabled);
    }

    @JavascriptInterface
    public void syncNow() {
        activity.syncAdminNotifications(AdminNotificationStore.TRIGGER_FOREGROUND);
    }
}
