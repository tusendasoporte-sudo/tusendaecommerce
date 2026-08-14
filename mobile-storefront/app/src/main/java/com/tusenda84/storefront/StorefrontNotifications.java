package com.tusenda84.storefront;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;

final class StorefrontNotifications {
    static final String MARKETING_CHANNEL_ID = "pz_storefront_marketing";
    private static final int IMAGE_MAX_BYTES = 102_400;

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
        Bitmap image = downloadWebp(payload.imageUrl);
        Notification.Builder builder = new Notification.Builder(context, MARKETING_CHANNEL_ID);
        builder.setSmallIcon(R.drawable.ic_notification)
                .setColor(context.getColor(R.color.pz_brand_energy_cobalt))
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(contentIntent)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setCategory(Notification.CATEGORY_PROMO);
        if (image != null) {
            builder.setStyle(new Notification.BigPictureStyle()
                    .bigPicture(image)
                    .setSummaryText(body));
        } else {
            builder.setStyle(new Notification.BigTextStyle().bigText(body));
        }
        manager.notify("pz_storefront_" + payload.campaignId, requestCode, builder.build());
    }

    private static Bitmap downloadWebp(String rawUrl) {
        String value = rawUrl == null ? "" : rawUrl.trim();
        if (value.isEmpty()) return null;
        HttpURLConnection connection = null;
        try {
            URL url = new URL(value);
            if (!"https".equalsIgnoreCase(url.getProtocol())
                    || url.getUserInfo() != null
                    || (url.getPort() != -1 && url.getPort() != 443)
                    || !url.getPath().toLowerCase(Locale.ROOT).endsWith(".webp")) {
                return null;
            }
            connection = (HttpURLConnection) url.openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(10_000);
            connection.setReadTimeout(15_000);
            connection.setRequestProperty("Accept", "image/webp");
            connection.setRequestProperty("Cache-Control", "max-age=300");
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return null;
            String contentType = bounded(connection.getContentType(), 80, "").toLowerCase(Locale.ROOT);
            int declaredLength = connection.getContentLength();
            if (!contentType.startsWith("image/webp")
                    || declaredLength > IMAGE_MAX_BYTES) return null;
            byte[] bytes;
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = input.read(buffer)) != -1) {
                    total += read;
                    if (total > IMAGE_MAX_BYTES) return null;
                    output.write(buffer, 0, read);
                }
                bytes = output.toByteArray();
            }
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            if (!"image/webp".equals(bounds.outMimeType)
                    || bounds.outWidth < 1 || bounds.outWidth > 1200
                    || bounds.outHeight < 1 || bounds.outHeight > 630) return null;
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception ignored) {
            return null;
        } finally {
            if (connection != null) connection.disconnect();
        }
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
