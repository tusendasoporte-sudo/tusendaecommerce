package com.tusenda84.admin;

import android.webkit.JavascriptInterface;

final class AdminPushBridge {
    private final MainActivity activity;

    AdminPushBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isAvailable() {
        return BuildConfig.FIREBASE_CONFIGURED;
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
}
