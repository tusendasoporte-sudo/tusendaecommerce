package com.tusenda84.admin;

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

final class AdminBackgroundSync {
    private static final String PERIODIC_WORK = "pz_admin_notification_sync_v2";
    private static final String IMMEDIATE_WORK = "pz_admin_notification_sync_now_v2";

    private AdminBackgroundSync() {}

    static void schedule(Context context) {
        Constraints connected = connected();
        PeriodicWorkRequest periodic = new PeriodicWorkRequest.Builder(
                AdminSyncWorker.class,
                15,
                TimeUnit.MINUTES,
                5,
                TimeUnit.MINUTES
        )
                .setConstraints(connected)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniquePeriodicWork(
                PERIODIC_WORK,
                ExistingPeriodicWorkPolicy.KEEP,
                periodic
        );
        enqueueImmediate(context);
    }

    static void enqueueImmediate(Context context) {
        OneTimeWorkRequest immediate = new OneTimeWorkRequest.Builder(AdminSyncWorker.class)
                .setConstraints(connected())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .build();
        WorkManager.getInstance(context.getApplicationContext()).enqueueUniqueWork(
                IMMEDIATE_WORK,
                ExistingWorkPolicy.KEEP,
                immediate
        );
    }

    private static Constraints connected() {
        return new Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build();
    }
}
