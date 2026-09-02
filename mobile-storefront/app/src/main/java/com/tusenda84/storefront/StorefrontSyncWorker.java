package com.tusenda84.storefront;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

public final class StorefrontSyncWorker extends Worker {
    public StorefrontSyncWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        StorefrontRegistrationClient.Result result = new StorefrontRegistrationClient(
                getApplicationContext()
        ).runDurableBackgroundSync();
        if (result.ok) return Result.success();
        return getRunAttemptCount() < 4 ? Result.retry() : Result.failure();
    }
}
