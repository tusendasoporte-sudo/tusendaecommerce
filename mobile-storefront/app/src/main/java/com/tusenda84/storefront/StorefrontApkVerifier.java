package com.tusenda84.storefront;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

final class StorefrontApkVerifier {
    private StorefrontApkVerifier() {}

    static void verify(Context context, File apk, String expectedSha256, long expectedVersionCode,
                       String expectedPackage) throws IOException, PackageManager.NameNotFoundException {
        if (!StorefrontUpdateContract.validMetadata(expectedSha256, expectedVersionCode, expectedPackage)) {
            throw new IOException("invalid_update_metadata");
        }
        if (!StorefrontUpdateContract.normalized(expectedSha256).equals(sha256(apk))) {
            throw new IOException("update_checksum_mismatch");
        }
        PackageManager manager = context.getPackageManager();
        PackageInfo archive = archiveInfo(manager, apk);
        PackageInfo installed = installedInfo(manager, context.getPackageName());
        if (archive == null || !expectedPackage.equals(archive.packageName)
                || !context.getPackageName().equals(archive.packageName)) {
            throw new IOException("update_package_mismatch");
        }
        long archiveCode = Build.VERSION.SDK_INT >= 28 ? archive.getLongVersionCode() : archive.versionCode;
        long installedCode = Build.VERSION.SDK_INT >= 28 ? installed.getLongVersionCode() : installed.versionCode;
        if (archiveCode != expectedVersionCode || archiveCode <= installedCode) {
            throw new IOException("update_version_mismatch");
        }
        Set<String> archiveSigners = signerSet(archive);
        Set<String> installedSigners = signerSet(installed);
        if (archiveSigners.isEmpty() || !archiveSigners.equals(installedSigners)) {
            throw new IOException("update_signature_mismatch");
        }
    }

    static String sha256(File file) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            try (FileInputStream input = new FileInputStream(file)) {
                int read;
                while ((read = input.read(buffer)) >= 0) if (read > 0) digest.update(buffer, 0, read);
            }
            StringBuilder result = new StringBuilder(64);
            for (byte value : digest.digest()) result.append(String.format(Locale.ROOT, "%02x", value & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            throw new IOException("sha256_unavailable", error);
        }
    }

    @SuppressWarnings("deprecation")
    private static PackageInfo archiveInfo(PackageManager manager, File apk) {
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
    }

    @SuppressWarnings("deprecation")
    private static PackageInfo installedInfo(PackageManager manager, String packageName)
            throws PackageManager.NameNotFoundException {
        int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        return manager.getPackageInfo(packageName, flags);
    }

    @SuppressWarnings("deprecation")
    private static Set<String> signerSet(PackageInfo info) {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 && info.signingInfo != null
                ? (info.signingInfo.hasMultipleSigners()
                ? info.signingInfo.getApkContentsSigners()
                : info.signingInfo.getSigningCertificateHistory())
                : info.signatures;
        Set<String> result = new HashSet<>();
        if (signatures != null) Arrays.stream(signatures)
                .forEach((signature) -> result.add(Arrays.toString(signature.toByteArray())));
        return result;
    }
}
