package com.tusenda84.storefront;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;

public final class StorefrontActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 601;

    private StorefrontRegistrationClient client;
    private TextView status;
    private Button[] operationButtons;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_storefront);
        client = new StorefrontRegistrationClient(this);
        status = findViewById(R.id.status);
        operationButtons = new Button[]{
                findViewById(R.id.register),
                findViewById(R.id.register_repeat),
                findViewById(R.id.rotate),
                findViewById(R.id.heartbeat),
                findViewById(R.id.permission),
                findViewById(R.id.bootstrap),
                findViewById(R.id.disable),
        };

        findViewById(R.id.register).setOnClickListener(view -> run(
                getString(R.string.status_registering),
                client::register
        ));
        findViewById(R.id.register_repeat).setOnClickListener(view -> run(
                getString(R.string.status_repeating),
                client::register
        ));
        findViewById(R.id.rotate).setOnClickListener(view -> confirmRotation());
        findViewById(R.id.heartbeat).setOnClickListener(view -> run(
                getString(R.string.status_heartbeat),
                client::heartbeat
        ));
        findViewById(R.id.permission).setOnClickListener(view -> requestOrUpdatePermission());
        findViewById(R.id.bootstrap).setOnClickListener(view -> run(
                getString(R.string.status_bootstrap),
                client::bootstrap
        ));
        findViewById(R.id.disable).setOnClickListener(view -> confirmDisable());

        findViewById(R.id.rotate).setVisibility(
                BuildConfig.ALLOW_STAGING_DESTRUCTIVE_TESTS ? View.VISIBLE : View.GONE
        );
        if (!BuildConfig.FIREBASE_CONFIGURED || StorefrontConfig.apiBaseUrl().isEmpty()) {
            status.setText(R.string.status_incomplete_build);
            setButtonsEnabled(false);
        }
    }

    private void requestOrUpdatePermission() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
            return;
        }
        run(getString(R.string.status_permission), client::updatePermission);
    }

    private void confirmRotation() {
        new AlertDialog.Builder(this)
                .setTitle(R.string.rotate_title)
                .setMessage(R.string.rotate_message)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.rotate_confirm, (dialog, which) -> run(
                        getString(R.string.status_rotating),
                        client::rotateFidAndRegister
                ))
                .show();
    }

    private void confirmDisable() {
        new AlertDialog.Builder(this)
                .setTitle(R.string.disable_title)
                .setMessage(R.string.disable_message)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.disable_confirm, (dialog, which) -> run(
                        getString(R.string.status_disabling),
                        client::disable
                ))
                .show();
    }

    private void run(String pending, ClientCall call) {
        status.setText(pending);
        setButtonsEnabled(false);
        call.start(result -> {
            status.setText(getString(
                    R.string.status_result,
                    getString(result.ok ? R.string.result_approved : R.string.result_failed),
                    result.message
            ));
            setButtonsEnabled(true);
        });
    }

    private void setButtonsEnabled(boolean enabled) {
        for (Button button : operationButtons) button.setEnabled(enabled);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            run(getString(R.string.status_permission_result), client::updatePermission);
        }
    }

    private interface ClientCall {
        void start(StorefrontRegistrationClient.Callback callback);
    }
}
