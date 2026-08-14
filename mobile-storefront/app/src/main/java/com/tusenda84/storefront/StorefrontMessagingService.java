package com.tusenda84.storefront;

import android.annotation.SuppressLint;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

@SuppressLint("MissingFirebaseInstanceTokenRefresh") // Firebase Messaging 25 uses onRegistered(FID).
public final class StorefrontMessagingService extends FirebaseMessagingService {
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
        StorefrontPushPayload payload = StorefrontPushPayload.fromMap(
                message.getData(),
                StorefrontConfig.storeKey()
        );
        if (payload == null) return;
        RemoteMessage.Notification notification = message.getNotification();
        StorefrontNotifications.show(
                this,
                payload,
                notification == null ? StorefrontConfig.displayName() : notification.getTitle(),
                notification == null ? "" : notification.getBody()
        );
    }
}
