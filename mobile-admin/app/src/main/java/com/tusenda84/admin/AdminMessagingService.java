package com.tusenda84.admin;

import android.annotation.SuppressLint;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

@SuppressLint("MissingFirebaseInstanceTokenRefresh") // Firebase Messaging 25 usa onRegistered(FID).
public final class AdminMessagingService extends FirebaseMessagingService {
    @Override
    public void onRegistered(@NonNull String installationId) {
        PushRegistrationStore.saveInstallationId(this, installationId);
        AdminBackgroundSync.schedule(this);
        if (!PushRegistrationStore.hasCredential(this)) return;
        AdminNotificationClient client = new AdminNotificationClient(this);
        client.enrichFirebase(installationId, result -> {
            AdminBackgroundSync.enqueueImmediate(this);
        });
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        AdminPushPayload payload = AdminPushPayload.fromFcm(message.getData());
        if (payload == null) return;
        AdminNotificationStore.queueReceipt(
                this,
                payload.notificationId,
                "fcm_received",
                AdminNotificationStore.TRIGGER_FCM
        );
        boolean posted = PushNotifications.show(this, payload);
        if (posted) {
            AdminNotificationStore.queueReceipt(
                    this,
                    payload.notificationId,
                    "native_delivered",
                    AdminNotificationStore.TRIGGER_FCM
            );
        }
        if (PushRegistrationStore.hasCredential(this)) {
            new AdminNotificationClient(this).flushReceipts(result -> { });
        }
        AdminBackgroundSync.enqueueImmediate(this);
    }
}
