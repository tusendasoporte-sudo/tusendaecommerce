package com.tusenda84.storefront;

import android.app.Application;

import com.google.firebase.FirebaseApp;
import com.google.firebase.appcheck.FirebaseAppCheck;
import com.google.firebase.appcheck.playintegrity.PlayIntegrityAppCheckProviderFactory;
import com.google.firebase.messaging.FirebaseMessaging;

public final class StorefrontApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        StorefrontNotifications.createChannels(this);
        StorefrontDiagnostics.record(this, StorefrontDiagnostics.APP_STARTED, "started", "", 0, 0);
        boolean existingInstallationId = StorefrontInstallationStore.hasInstallationId(this);
        try {
            StorefrontInstallationStore.installationId(this);
            if (!existingInstallationId) {
                StorefrontDiagnostics.record(
                        this,
                        StorefrontDiagnostics.INSTALLATION_UUID_CREATED,
                        "success",
                        "",
                        0,
                        0
                );
            }
        } catch (RuntimeException error) {
            StorefrontDiagnostics.record(
                    this,
                    StorefrontDiagnostics.INSTALLATION_UUID_CREATED,
                    "failure",
                    "installation_storage_unavailable",
                    0,
                    0
            );
        }
        StorefrontBackgroundSync.schedule(this);
        if (!BuildConfig.FIREBASE_CONFIGURED) {
            StorefrontDiagnostics.record(
                    this,
                    StorefrontDiagnostics.FIREBASE_INITIALIZED,
                    "skipped",
                    "firebase_not_configured",
                    0,
                    0
            );
            return;
        }
        try {
            FirebaseApp firebaseApp = FirebaseApp.initializeApp(this);
            if (firebaseApp == null) throw new IllegalStateException("firebase_initialization_failed");
            FirebaseAppCheck.getInstance(firebaseApp).installAppCheckProviderFactory(
                    PlayIntegrityAppCheckProviderFactory.getInstance()
            );
            FirebaseMessaging.getInstance().setAutoInitEnabled(false);
            StorefrontDiagnostics.record(
                    this,
                    StorefrontDiagnostics.FIREBASE_INITIALIZED,
                    "success",
                    "",
                    0,
                    0
            );
        } catch (RuntimeException error) {
            StorefrontDiagnostics.record(
                    this,
                    StorefrontDiagnostics.FIREBASE_INITIALIZED,
                    "failure",
                    "firebase_initialization_failed",
                    0,
                    0
            );
            // La tienda pública sigue disponible y la integración nativa falla cerrada.
        }
    }
}
