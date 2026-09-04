package com.tusenda84.admin;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import java.util.Locale;

final class PushNotifications {
    static final String EXTRA_TARGET_URL = "pz_target_url";
    static final String EXTRA_NOTIFICATION_ID = "pz_notification_id";
    static final int NOTIFICATION_ID = 0;
    private static final String CHANNEL_ORDERS = "pz_admin_orders";
    private static final String CHANNEL_INVENTORY = "pz_admin_inventory";
    private static final String CHANNEL_SECURITY = "pz_admin_security";
    private static final String CHANNEL_GENERAL = "pz_admin_general";

    private PushNotifications() {}

    static void createChannels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        manager.createNotificationChannel(channel(
                context,
                CHANNEL_ORDERS,
                R.string.push_channel_orders,
                R.string.push_channel_orders_description,
                NotificationManager.IMPORTANCE_HIGH
        ));
        manager.createNotificationChannel(channel(
                context,
                CHANNEL_INVENTORY,
                R.string.push_channel_inventory,
                R.string.push_channel_inventory_description,
                NotificationManager.IMPORTANCE_DEFAULT
        ));
        manager.createNotificationChannel(channel(
                context,
                CHANNEL_SECURITY,
                R.string.push_channel_security,
                R.string.push_channel_security_description,
                NotificationManager.IMPORTANCE_HIGH
        ));
        manager.createNotificationChannel(channel(
                context,
                CHANNEL_GENERAL,
                R.string.push_channel_general,
                R.string.push_channel_general_description,
                NotificationManager.IMPORTANCE_DEFAULT
        ));
    }

    private static NotificationChannel channel(
            Context context,
            String id,
            int nameResource,
            int descriptionResource,
            int importance
    ) {
        NotificationChannel channel = new NotificationChannel(
                id,
                context.getString(nameResource),
                importance
        );
        channel.setDescription(context.getString(descriptionResource));
        channel.enableVibration(true);
        channel.setShowBadge(true);
        return channel;
    }

    static synchronized boolean show(Context context, AdminPushPayload payload) {
        if (payload == null || !PushRegistrationStore.notificationsEnabled(context)) return false;
        if (!payload.storeId.equals(PushRegistrationStore.boundStoreId(context))) return false;
        if (AdminNotificationStore.wasDisplayed(context, payload.notificationId)) return false;
        if (android.os.Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra(EXTRA_TARGET_URL, payload.targetUrl);
        openIntent.putExtra(EXTRA_NOTIFICATION_ID, payload.notificationId);
        int requestCode = positiveHash(payload.notificationId);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                requestCode,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(context, channelForType(payload.type))
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(Color.rgb(37, 99, 235))
                .setContentTitle(payload.title)
                .setContentText(payload.body)
                .setStyle(new Notification.BigTextStyle().bigText(payload.body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setCategory(categoryForType(payload.type))
                .setGroup("pz_admin_" + payload.storeId)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build();

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return false;
        manager.notify(notificationTag(payload.notificationId), NOTIFICATION_ID, notification);
        AdminNotificationStore.markDisplayed(context, payload.notificationId);
        return true;
    }

    static String notificationTag(String notificationId) {
        return "pz_admin_" + (notificationId == null ? "" : notificationId.trim());
    }

    private static String channelForType(String rawType) {
        String type = rawType.toLowerCase(Locale.ROOT);
        if (type.contains("order")) return CHANNEL_ORDERS;
        if (type.contains("stock") || type.contains("expir")) return CHANNEL_INVENTORY;
        if (type.contains("security") || type.contains("blocked")) return CHANNEL_SECURITY;
        return CHANNEL_GENERAL;
    }

    private static String categoryForType(String rawType) {
        String type = rawType.toLowerCase(Locale.ROOT);
        if (type.contains("order")) return Notification.CATEGORY_STATUS;
        if (type.contains("security") || type.contains("blocked")) return Notification.CATEGORY_ALARM;
        return Notification.CATEGORY_MESSAGE;
    }

    private static int positiveHash(String value) {
        int hash = value == null ? 1 : value.hashCode();
        return hash == Integer.MIN_VALUE ? 1 : Math.max(1, Math.abs(hash));
    }

}
