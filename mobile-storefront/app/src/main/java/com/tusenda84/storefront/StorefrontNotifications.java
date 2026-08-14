package com.tusenda84.storefront;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

final class StorefrontNotifications {
    static final String MARKETING_CHANNEL_ID = "pz_storefront_marketing";

    private StorefrontNotifications() {}

    static void createChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(
                MARKETING_CHANNEL_ID,
                context.getString(R.string.notification_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription(context.getString(R.string.notification_channel_description));
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    static void show(
            Context context,
            StorefrontPushPayload payload,
            String rawTitle,
            String rawBody
    ) {
        if (payload == null || !canNotify(context)) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;
        createChannels(context);

        Intent openIntent = new Intent(context, StorefrontActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        payload.putInto(openIntent);
        int requestCode = payload.campaignId.hashCode() & 0x7fffffff;
        PendingIntent contentIntent = PendingIntent.getActivity(
                context,
                requestCode,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String title = bounded(rawTitle, 120, StorefrontConfig.displayName());
        String body = bounded(rawBody, 500, "");
        Notification.Builder builder = new Notification.Builder(context, MARKETING_CHANNEL_ID);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setColor(context.getColor(R.color.pz_staging_primary))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROMO);
        manager.notify("pz_storefront_" + payload.campaignId, requestCode, builder.build());
    }

    private static boolean canNotify(Context context) {
        return Build.VERSION.SDK_INT < 33
                || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
    }

    private static String bounded(String raw, int max, String fallback) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) value = fallback;
        if (value.length() > max) value = value.substring(0, max).trim();
        return value;
    }
}
