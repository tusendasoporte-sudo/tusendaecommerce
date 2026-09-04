package com.tusenda84.admin;

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

final class PushRegistrationStore {
    private static final String PREFERENCES = "pz_admin_push";
    private static final String FIREBASE_INSTALLATION_ID = "firebase_installation_id";
    private static final String LOCAL_INSTALLATION_ID = "installation_uuid_v2";
    private static final String CREDENTIAL = "installation_credential_encrypted";
    private static final String CREDENTIAL_IV = "installation_credential_iv";
    private static final String BOUND_STORE_ID = "bound_store_id";
    private static final String PERMISSION_REQUESTED = "notification_permission_requested";
    private static final String NOTIFICATIONS_ENABLED = "notifications_enabled";
    private static final String LAST_SUCCESSFUL_SYNC = "last_successful_sync";
    private static final String KEY_ALIAS = "pz_admin_push_credential_v2";
    private static final Pattern CREDENTIAL_PATTERN = Pattern.compile("^pza_v1_[a-f0-9]{64}$");
    private static final Pattern FIREBASE_INSTALLATION_PATTERN = Pattern.compile("^[A-Za-z0-9_-]{16,255}$");
    private static final Pattern RECORD_ID_PATTERN = Pattern.compile("^[a-z0-9]{15}$");
    private static final Pattern UUID_PATTERN = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"
    );

    private PushRegistrationStore() {}

    static synchronized String localInstallationId(Context context) {
        SharedPreferences preferences = preferences(context);
        String current = preferences.getString(LOCAL_INSTALLATION_ID, "");
        if (current != null && UUID_PATTERN.matcher(current).matches()) return current;
        String created = UUID.randomUUID().toString();
        if (!preferences.edit().putString(LOCAL_INSTALLATION_ID, created).commit()) {
            throw new IllegalStateException("installation_storage_unavailable");
        }
        return created;
    }

    static synchronized void saveInstallationId(Context context, String installationId) {
        String value = installationId == null ? "" : installationId.trim();
        if (!FIREBASE_INSTALLATION_PATTERN.matcher(value).matches()) return;
        preferences(context).edit().putString(FIREBASE_INSTALLATION_ID, value).apply();
    }

    static synchronized String getInstallationId(Context context) {
        String value = preferences(context).getString(FIREBASE_INSTALLATION_ID, "");
        return value == null ? "" : value;
    }

    static synchronized void saveCredential(Context context, String credential, String storeId) {
        if (credential == null || !CREDENTIAL_PATTERN.matcher(credential).matches()) {
            throw new IllegalArgumentException("invalid_credential");
        }
        String normalizedStoreId = storeId == null ? "" : storeId.trim();
        if (!RECORD_ID_PATTERN.matcher(normalizedStoreId).matches()) {
            throw new IllegalArgumentException("invalid_store");
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, encryptionKey());
            byte[] encrypted = cipher.doFinal(credential.getBytes(StandardCharsets.UTF_8));
            boolean stored = preferences(context).edit()
                    .putString(CREDENTIAL, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                    .putString(CREDENTIAL_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                    .putString(BOUND_STORE_ID, normalizedStoreId)
                    .commit();
            if (!stored) throw new IllegalStateException("credential_storage_unavailable");
        } catch (Exception error) {
            clearCredential(context);
            throw new IllegalStateException("credential_storage_unavailable", error);
        }
    }

    static synchronized String credential(Context context) {
        String encoded = preferences(context).getString(CREDENTIAL, "");
        String encodedIv = preferences(context).getString(CREDENTIAL_IV, "");
        if (encoded == null || encodedIv == null || encoded.isEmpty() || encodedIv.isEmpty()) return "";
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(
                    Cipher.DECRYPT_MODE,
                    encryptionKey(),
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

    static synchronized boolean hasCredential(Context context) {
        return !credential(context).isEmpty();
    }

    static synchronized String boundStoreId(Context context) {
        String value = preferences(context).getString(BOUND_STORE_ID, "");
        String normalized = value == null ? "" : value.trim();
        return RECORD_ID_PATTERN.matcher(normalized).matches() ? normalized : "";
    }

    static synchronized void clearCredential(Context context) {
        preferences(context).edit()
                .remove(CREDENTIAL)
                .remove(CREDENTIAL_IV)
                .remove(BOUND_STORE_ID)
                .apply();
    }

    static synchronized void setNotificationsEnabled(Context context, boolean enabled) {
        preferences(context).edit().putBoolean(NOTIFICATIONS_ENABLED, enabled).apply();
    }

    static synchronized boolean notificationsEnabled(Context context) {
        return preferences(context).getBoolean(NOTIFICATIONS_ENABLED, false);
    }

    static synchronized void recordSuccessfulSync(Context context, String timestamp) {
        if (timestamp == null || timestamp.isEmpty() || timestamp.length() > 40) return;
        preferences(context).edit().putString(LAST_SUCCESSFUL_SYNC, timestamp).apply();
    }

    static synchronized String lastSuccessfulSync(Context context) {
        String value = preferences(context).getString(LAST_SUCCESSFUL_SYNC, "");
        return value == null ? "" : value;
    }

    static void markPermissionRequested(Context context) {
        preferences(context).edit().putBoolean(PERMISSION_REQUESTED, true).apply();
    }

    static boolean wasPermissionRequested(Context context) {
        return preferences(context).getBoolean(PERMISSION_REQUESTED, false);
    }

    private static SecretKey encryptionKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key current = keyStore.getKey(KEY_ALIAS, null);
        if (current instanceof SecretKey) return (SecretKey) current;
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES,
                "AndroidKeyStore"
        );
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}
