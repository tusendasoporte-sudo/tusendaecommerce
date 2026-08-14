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
        new StorefrontRegistrationClient(this).register(result -> {
            // C06A no registra identificadores ni tokens en logs o interfaz en segundo plano.
        });
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        // La entrega y visualización de campañas pertenece a C05/C06 y permanece fuera de C06A.
    }
}
