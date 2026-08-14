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
        if (!BuildConfig.FIREBASE_CONFIGURED) return;

        FirebaseApp firebaseApp = FirebaseApp.initializeApp(this);
        if (firebaseApp == null) return;

        FirebaseAppCheck.getInstance(firebaseApp).installAppCheckProviderFactory(
                PlayIntegrityAppCheckProviderFactory.getInstance()
        );
        FirebaseMessaging.getInstance().setAutoInitEnabled(false);
    }
}
