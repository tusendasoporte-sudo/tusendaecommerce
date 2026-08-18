package com.tusenda84.admin;

import android.webkit.JavascriptInterface;

final class AdminUpdateBridge {
    private final MainActivity activity;

    AdminUpdateBridge(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public void requestState() {
        activity.runOnUiThread(activity::emitAdminAppStateToWeb);
    }

    @JavascriptInterface
    public void downloadUpdate(String url, String sha256, long versionCode, String packageName) {
        activity.runOnUiThread(() -> activity.downloadVerifiedAdminUpdate(url, sha256, versionCode, packageName));
    }
}
