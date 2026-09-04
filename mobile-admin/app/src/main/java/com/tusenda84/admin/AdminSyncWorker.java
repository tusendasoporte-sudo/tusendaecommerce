package com.tusenda84.admin;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class AdminSyncWorker extends Worker {
    public AdminSyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        AdminNotificationClient.Result result = new AdminNotificationClient(
                getApplicationContext()
        ).runDurableBackgroundSync();
        if (result.ok) return Result.success();
        return getRunAttemptCount() < 4 ? Result.retry() : Result.failure();
    }
}
