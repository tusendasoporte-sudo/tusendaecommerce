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
        StorefrontDiagnostics.record(
                this,
                StorefrontDiagnostics.FCM_TOKEN_CREATED,
                "success",
                "",
                0,
                0
        );
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
                StorefrontConfig.appKey()
        );
        StorefrontPushPayload payload = StorefrontPushPayload.fromMap(
                data,
                StorefrontConfig.appKey()
        );
        if (payload == null) {
            stagingDiagnostic("payload_rejected_" + diagnostic);
            return;
        }
        StorefrontDiagnostics.record(
                this,
                StorefrontDiagnostics.LAST_PUSH_RECEIVED,
                "success",
                "",
                0,
                0
        );
        StorefrontNotificationStore.queueReceipt(
                this,
                payload.deliveryId,
                "fcm_received",
                StorefrontNotificationStore.TRIGGER_FCM
        );
        boolean duplicate = StorefrontNotificationStore.wasDisplayed(this, payload.deliveryId);
        boolean posted = !duplicate && StorefrontNotifications.show(
                this,
                payload,
                payload.title,
                payload.body
        );
        if (posted) {
            StorefrontNotificationStore.markDisplayed(this, payload.deliveryId);
            StorefrontNotificationStore.queueReceipt(
                    this,
                    payload.deliveryId,
                    "native_delivered",
                    StorefrontNotificationStore.TRIGGER_FCM
            );
        }
        StorefrontRegistrationClient client = new StorefrontRegistrationClient(this);
        if (StorefrontInstallationStore.hasCredential(this)) {
            client.flushNotificationReceipts(result -> { });
        } else {
            client.syncFromAppStart(result -> {
                if (result.ok) client.flushNotificationReceipts(receiptResult -> { });
            });
        }
        stagingDiagnostic(duplicate ? "notification_duplicate"
                : posted ? "notification_posted" : "notification_skipped");
    }

    private static void stagingDiagnostic(String code) {
        if ("staging".equals(BuildConfig.BUILD_TYPE)) {
            Log.i(DIAGNOSTIC_TAG, code);
        }
    }
}
