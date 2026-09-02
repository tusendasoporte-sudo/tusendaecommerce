package com.tusenda84.storefront;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.UUID;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class StorefrontInstallationStore {
    private static final String PREFERENCES = "pz_storefront_native_v1";
    private static final String CREDENTIAL = "installation_credential_encrypted";
    private static final String IV = "installation_credential_iv";
    private static final String NOTIFICATION_PERMISSION_REQUESTED = "notification_permission_requested";
    private static final String LAST_REPORTED_PERMISSION = "last_reported_notification_permission";
    private static final String INSTALLATION_ID = "installation_uuid_v2";
    private static final String LAST_SUCCESSFUL_SYNC = "last_successful_sync";
    private static final String LAST_REALTIME_STATUS = "last_realtime_status";
    private static final String LAST_REALTIME_STATUS_AT = "last_realtime_status_at";
    private static final String KEY_ALIAS = "pz_storefront_installation_credential_v1";
    private static final Pattern CREDENTIAL_PATTERN = Pattern.compile("^pzs_v1_[a-f0-9]{64}$");
    private static final Pattern INSTALLATION_ID_PATTERN = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    );

    private StorefrontInstallationStore() {}

    static synchronized void saveCredential(Context context, String credential) {
        if (credential == null || !CREDENTIAL_PATTERN.matcher(credential).matches()) {
            throw new IllegalArgumentException("invalid_credential");
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key());
            byte[] encrypted = cipher.doFinal(credential.getBytes(StandardCharsets.UTF_8));
            preferences(context).edit()
                    .putString(CREDENTIAL, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .putString(IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .apply();
        } catch (Exception error) {
            throw new IllegalStateException("credential_storage_unavailable", error);
        }
    }

    static synchronized String credential(Context context) {
        String encoded = preferences(context).getString(CREDENTIAL, "");
        String encodedIv = preferences(context).getString(IV, "");
        if (encoded.isEmpty() || encodedIv.isEmpty()) return "";
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    key(),
                    new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP))
            );
            String credential = new String(
                    cipher.doFinal(Base64.decode(encoded, Base64.NO_WRAP)),
                    StandardCharsets.UTF_8
            );
            if (!CREDENTIAL_PATTERN.matcher(credential).matches()) throw new IllegalStateException();
            return credential;
        } catch (Exception error) {
            clearCredential(context);
            return "";
        }
    }

    static synchronized void clearCredential(Context context) {
        preferences(context).edit().remove(CREDENTIAL).remove(IV).apply();
    }

    static synchronized boolean hasCredential(Context context) {
        return !credential(context).isEmpty();
    }

    static synchronized String installationId(Context context) {
        SharedPreferences preferences = preferences(context);
        String existing = preferences.getString(INSTALLATION_ID, "");
        if (existing != null && INSTALLATION_ID_PATTERN.matcher(existing).matches()) return existing;
        String created = UUID.randomUUID().toString();
        if (!preferences.edit().putString(INSTALLATION_ID, created).commit()) {
            throw new IllegalStateException("installation_storage_unavailable");
        }
        return created;
    }

    static synchronized boolean hasInstallationId(Context context) {
        String value = preferences(context).getString(INSTALLATION_ID, "");
        return value != null && INSTALLATION_ID_PATTERN.matcher(value).matches();
    }

    static synchronized void recordSuccessfulSync(Context context, String timestamp) {
        if (timestamp == null || timestamp.isEmpty() || timestamp.length() > 40) return;
        preferences(context).edit().putString(LAST_SUCCESSFUL_SYNC, timestamp).apply();
    }

    static synchronized String lastSuccessfulSync(Context context) {
        String value = preferences(context).getString(LAST_SUCCESSFUL_SYNC, "");
        return value == null ? "" : value;
    }

    static synchronized void recordRealtimeStatus(Context context, String status, String timestamp) {
        if (!"connected".equals(status) && !"unavailable".equals(status)) return;
        if (timestamp == null || timestamp.isEmpty() || timestamp.length() > 40) return;
        preferences(context).edit()
                .putString(LAST_REALTIME_STATUS, status)
                .putString(LAST_REALTIME_STATUS_AT, timestamp)
                .apply();
    }

    static synchronized String lastRealtimeStatus(Context context) {
        String value = preferences(context).getString(LAST_REALTIME_STATUS, "");
        return value == null ? "" : value;
    }

    static synchronized String lastRealtimeStatusAt(Context context) {
        String value = preferences(context).getString(LAST_REALTIME_STATUS_AT, "");
        return value == null ? "" : value;
    }

    static synchronized void markNotificationPermissionRequested(Context context) {
        preferences(context).edit().putBoolean(NOTIFICATION_PERMISSION_REQUESTED, true).apply();
    }

    static synchronized boolean wasNotificationPermissionRequested(Context context) {
        return preferences(context).getBoolean(NOTIFICATION_PERMISSION_REQUESTED, false);
    }

    static synchronized void recordReportedPermission(Context context, String permission) {
        if (!"granted".equals(permission) && !"denied".equals(permission) && !"unknown".equals(permission)) {
            return;
        }
        preferences(context).edit().putString(LAST_REPORTED_PERMISSION, permission).apply();
    }

    static synchronized String lastReportedPermission(Context context) {
        String value = preferences(context).getString(LAST_REPORTED_PERMISSION, "");
        return value == null ? "" : value;
    }

    private static SecretKey key() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
