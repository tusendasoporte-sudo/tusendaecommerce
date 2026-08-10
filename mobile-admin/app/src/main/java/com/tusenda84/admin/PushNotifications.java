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
import java.util.Map;

final class PushNotifications {
    static final String EXTRA_TARGET_URL = "pz_target_url";
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

    static void show(Context context, Map<String, String> data, String fallbackTitle, String fallbackBody) {
        if (android.os.Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        String notificationId = clean(data.get("notification_id"));
        String type = clean(data.get("type"));
        String title = firstNonBlank(data.get("title"), fallbackTitle, "Nueva notificación");
        String body = firstNonBlank(data.get("body"), fallbackBody, "Tienes un nuevo aviso en el panel administrativo.");
        String targetUrl = clean(data.get("target_url"));
        String storeId = clean(data.get("store_id"));

        Intent openIntent = new Intent(context, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openIntent.putExtra(EXTRA_TARGET_URL, targetUrl);
        int requestCode = positiveHash(notificationId.isEmpty() ? targetUrl + title : notificationId);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                context,
                requestCode,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new Notification.Builder(context, channelForType(type))
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(Color.rgb(37, 99, 235))
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new Notification.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .setCategory(categoryForType(type))
                .setGroup(storeId.isEmpty() ? "pz_admin" : "pz_admin_" + storeId)
                .setVisibility(Notification.VISIBILITY_PRIVATE)
                .build();

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null) manager.notify(requestCode, notification);
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

    private static String clean(String value) {
        return value == null ? "" : value.trim();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            String clean = clean(value);
            if (!clean.isEmpty()) return clean;
        }
        return "";
    }
}
