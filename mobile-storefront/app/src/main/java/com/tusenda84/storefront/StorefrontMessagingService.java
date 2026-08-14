package com.tusenda84.storefront;

import android.annotation.SuppressLint;
import android.util.Log;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

@SuppressLint("MissingFirebaseInstanceTokenRefresh") // Firebase Messaging 25 uses onRegistered(FID).
public final class StorefrontMessagingService extends FirebaseMessagingService {
    private static final String DIAGNOSTIC_TAG = "PZStorefrontFCM";

    @Override
    public void onRegistered(@NonNull String installationId) {
        registerWithoutExposingIdentifiers();
    }

    private void registerWithoutExposingIdentifiers() {
        if (!BuildConfig.FIREBASE_CONFIGURED) return;
        new StorefrontRegistrationClient(this).registerFromMessagingCallback(result -> {
            // El callback no registra identificadores, tokens ni credenciales en segundo plano.
        });
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String diagnostic = StorefrontPushPayload.diagnosticCode(
                data,
                StorefrontConfig.storeKey()
        );
        StorefrontPushPayload payload = StorefrontPushPayload.fromMap(
                data,
                StorefrontConfig.storeKey()
        );
        if (payload == null) {
            stagingDiagnostic("payload_rejected_" + diagnostic);
            return;
        }
        boolean posted = StorefrontNotifications.show(
                this,
                payload,
                payload.title,
                payload.body
        );
        stagingDiagnostic(posted ? "notification_posted" : "notification_skipped");
    }

    private static void stagingDiagnostic(String code) {
        if ("staging".equals(BuildConfig.BUILD_TYPE)) {
            Log.i(DIAGNOSTIC_TAG, code);
        }
    }
}
