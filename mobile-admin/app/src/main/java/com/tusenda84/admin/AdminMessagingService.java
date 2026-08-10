package com.tusenda84.admin;

import androidx.annotation.NonNull;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

public final class AdminMessagingService extends FirebaseMessagingService {
    @Override
    public void onRegistered(@NonNull String installationId) {
        PushRegistrationStore.saveInstallationId(this, installationId);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        RemoteMessage.Notification notification = message.getNotification();
        PushNotifications.show(
                this,
                message.getData(),
                notification == null ? "" : notification.getTitle(),
                notification == null ? "" : notification.getBody()
        );
    }
}
