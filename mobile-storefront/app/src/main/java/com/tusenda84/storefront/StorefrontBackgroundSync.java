package com.tusenda84.storefront;

import android.content.Context;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

final class StorefrontBackgroundSync {
    private static final String PERIODIC_WORK = "pz_storefront_durable_sync_v1";
    private static final String IMMEDIATE_WORK = "pz_storefront_immediate_sync_v1";

    private StorefrontBackgroundSync() {}

    static void schedule(Context context) {
        Constraints connected = new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(
                StorefrontSyncWorker.class,
                15,
                TimeUnit.MINUTES,
                5,
                TimeUnit.MINUTES
        )
                .setConstraints(connected)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build();
        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(StorefrontSyncWorker.class)
                .setConstraints(connected)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build();
        WorkManager manager = WorkManager.getInstance(context.getApplicationContext());
        manager.enqueueUniquePeriodicWork(
                PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                periodic
        );
        // KEEP evita que Application.onCreate cancele el mismo worker cuando Android
        // levanta el proceso exclusivamente para ejecutar una sincronización pendiente.
        manager.enqueueUniqueWork(IMMEDIATE_WORK, ExistingWorkPolicy.KEEP, immediate);
    }
}
