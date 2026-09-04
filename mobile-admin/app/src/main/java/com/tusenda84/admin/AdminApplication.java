package com.tusenda84.admin;

import android.app.Application;

public final class AdminApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        PushNotifications.createChannels(this);
        try {
            PushRegistrationStore.localInstallationId(this);
        } catch (RuntimeException ignored) {
            // El panel continúa disponible y el registro volverá a intentarse al abrirlo.
        }
        AdminBackgroundSync.schedule(this);
    }
}
