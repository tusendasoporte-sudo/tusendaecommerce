package com.tusenda84.storefront;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class StorefrontInstallationStore {
    private static final String PREFERENCES = "pz_storefront_native_v1";
    private static final String CREDENTIAL = "installation_credential_encrypted";
    private static final String IV = "installation_credential_iv";
    private static final String KEY_ALIAS = "pz_storefront_installation_credential_v1";
    private static final Pattern CREDENTIAL_PATTERN = Pattern.compile("^pzs_v1_[a-f0-9]{64}$");

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
