package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StorefrontRegistrationPayloadTest {
    @Test
    public void emitsFirebaseIndependentCoreRegistrationContract() {
        String json = StorefrontRegistrationPayload.coreRegister(
                "123e4567-e89b-42d3-a456-426614174000",
                "powerzona-storefront-staging",
                "0.1.0-staging",
                1,
                "16",
                "Google Pixel 9",
                "es-US",
                "America/Havana",
                "unknown"
        );
        assertEquals(
                "{\"installation_id\":\"123e4567-e89b-42d3-a456-426614174000\","
                        + "\"app_key\":\"powerzona-storefront-staging\","
                        + "\"app_version\":\"0.1.0-staging\",\"app_version_code\":1,"
                        + "\"android_version\":\"16\",\"device_model\":\"Google Pixel 9\","
                        + "\"locale\":\"es-US\",\"timezone\":\"America/Havana\","
                        + "\"notification_permission\":\"unknown\"}",
                json
        );
        assertTrue(!json.contains("fid") && !json.contains("firebase") && !json.contains("store_id"));
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.coreRegister(
                "not-a-uuid", "powerzona-storefront-staging", "0.1.0", 1,
                "16", "Pixel", "es-US", "UTC", "unknown"
        ));
    }

    @Test
    public void emitsExactRegisterContractWithoutSecretsBeyondFid() {
        String json = StorefrontRegistrationPayload.register(
                "abcdefghijklmnop",
                "123e4567-e89b-42d3-a456-426614174000",
                "0.1.0-staging",
                1,
                "16",
                "Google Pixel 9",
                "es-US",
                "America/New_York",
                "granted"
        );
        assertEquals(
                "{\"fid\":\"abcdefghijklmnop\",\"app_set_id\":\"123e4567-e89b-42d3-a456-426614174000\","
                        + "\"app_version\":\"0.1.0-staging\","
                        + "\"app_version_code\":1,\"android_version\":\"16\","
                        + "\"device_model\":\"Google Pixel 9\",\"locale\":\"es-US\","
                        + "\"timezone\":\"America/New_York\",\"notification_permission\":\"granted\"}",
                json
        );
        assertTrue(!json.contains("store_id") && !json.contains("credential") && !json.contains("ip"));
        assertEquals("", StorefrontRegistrationPayload.invalidRegisterField(
                "abcdefghijklmnop",
                "123e4567-e89b-42d3-a456-426614174000",
                "0.1.0-staging",
                1,
                "16",
                "Google Pixel 9",
                "es-US",
                "America/New_York",
                "granted"
        ));
        assertEquals("", StorefrontRegistrationPayload.invalidRegisterField(
                "abcdefghijklmnop",
                "12Jd92JD8078S8J29sDoakc0EF230337",
                "0.1.0-staging",
                1,
                "16",
                "Google Pixel 9",
                "es-US",
                "America/New_York",
                "granted"
        ));
        assertEquals("app_set_id", StorefrontRegistrationPayload.invalidRegisterField(
                "abcdefghijklmnop",
                "unsafe:app-set-id-value",
                "0.1.0-staging",
                1,
                "16",
                "Google Pixel 9",
                "es-US",
                "America/New_York",
                "granted"
        ));
        String opaque = "12Jd92JD8078S8J29sDoakc0EF230337";
        assertTrue(StorefrontRegistrationPayload.register(
                "abcdefghijklmnop", opaque, "0.1.0-staging", 1,
                "16", "Google Pixel 9", "es-US", "America/New_York", "granted"
        ).contains("\"app_set_id\":\"" + opaque + "\""));
    }

    @Test
    public void emitsExactFirebaseEnrichmentContract() {
        assertEquals(
                "{\"fid\":\"abcdefghijklmnop\",\"app_set_id\":\"12Jd92JD8078S8J29sDoakc0EF230337\"}",
                StorefrontRegistrationPayload.firebaseEnrichment(
                        "abcdefghijklmnop",
                        "12Jd92JD8078S8J29sDoakc0EF230337"
                )
        );
        assertEquals(
                "{\"fid\":\"abcdefghijklmnop\"}",
                StorefrontRegistrationPayload.firebaseEnrichment("abcdefghijklmnop", "")
        );
        assertThrows(IllegalArgumentException.class, () ->
                StorefrontRegistrationPayload.firebaseEnrichment("short", "")
        );
        assertThrows(IllegalArgumentException.class, () ->
                StorefrontRegistrationPayload.firebaseEnrichment(
                        "abcdefghijklmnop",
                        "unsafe:app-set-id-value"
                )
        );
    }

    @Test
    public void appSetIdIsOptionalWhenGooglePlayServicesCannotReturnIt() {
        String json = StorefrontRegistrationPayload.register(
                "abcdefghijklmnop", "", "0.1.0-staging", 1,
                "16", "Google Pixel 9", "es-US", "America/New_York", "granted"
        );
        assertEquals(
                "{\"fid\":\"abcdefghijklmnop\",\"app_version\":\"0.1.0-staging\","
                        + "\"app_version_code\":1,\"android_version\":\"16\","
                        + "\"device_model\":\"Google Pixel 9\",\"locale\":\"es-US\","
                        + "\"timezone\":\"America/New_York\",\"notification_permission\":\"granted\"}",
                json
        );
        assertTrue(!json.contains("app_set_id"));
        assertTrue(StorefrontRegistrationPayload.validOptionalAppSetId(""));
        assertTrue(!StorefrontRegistrationPayload.validOptionalAppSetId("unsafe:app-set-id-value"));
    }

    @Test
    public void emitsExactHeartbeatAndPermissionContracts() {
        assertEquals(
                "{\"app_version\":\"0.1.0-staging\",\"app_version_code\":1,"
                        + "\"android_version\":\"16\",\"device_model\":\"Pixel\","
                        + "\"locale\":\"en-US\",\"timezone\":\"UTC\"}",
                StorefrontRegistrationPayload.heartbeat("0.1.0-staging", 1, "16", "Pixel", "en-US", "UTC")
        );
        assertEquals(
                "{\"notification_permission\":\"denied\"}",
                StorefrontRegistrationPayload.permission("denied")
        );
        assertEquals("{}", StorefrontRegistrationPayload.empty());
        assertEquals(
                "{\"campaign_id\":\"abc123def456ghi\"}",
                StorefrontRegistrationPayload.resolveCampaignTarget("abc123def456ghi")
        );
        StorefrontEventQueue.Event opened = new StorefrontEventQueue.Event(
                "opened", "delivery0000001", "2026-08-15T12:00:00Z", "", 0
        );
        assertEquals(
                "{\"delivery_id\":\"delivery0000001\",\"event_type\":\"opened\","
                        + "\"idempotency_key\":\"opened:delivery0000001\","
                        + "\"occurred_at\":\"2026-08-15T12:00:00Z\",\"target_path\":\"\"}",
                StorefrontRegistrationPayload.event(opened)
        );
        StorefrontEventQueue.Event destination = new StorefrontEventQueue.Event(
                "destination_viewed", "delivery0000001", "2026-08-15T12:00:01Z",
                "/t/powerzona/producto/bateria-12v", 0
        );
        assertTrue(StorefrontRegistrationPayload.event(destination).contains("destination_viewed"));
        assertTrue(StorefrontEventQueue.validEvent("opened", "delivery0000001", ""));
        assertTrue(StorefrontEventQueue.validEvent(
                "destination_viewed", "delivery0000001", "/t/powerzona/producto/bateria-12v"
        ));
        assertTrue(!StorefrontEventQueue.validEvent("destination_viewed", "delivery0000001", "/t/powerzona\nadmin"));
        assertEquals(64, StorefrontEventQueue.MAX_EVENTS);
        assertEquals(10, StorefrontEventQueue.MAX_ATTEMPTS);
        assertEquals(7L * 24L * 60L * 60L * 1000L, StorefrontEventQueue.MAX_AGE_MS);
    }

    @Test
    public void bootstrapCookieRequiresEverySecurityAttributeAndAtMostTwentyFourHours() {
        String token = "pzws_v1_" + "A".repeat(64);
        String valid = "pz_storefront_session=" + token
                + "; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax";
        assertTrue(StorefrontRegistrationClient.validSessionCookie(valid));
        assertTrue(!StorefrontRegistrationClient.validSessionCookie(
                "pz_storefront_session=" + token + "; Path=/; Max-Age=86400; Secure; SameSite=Lax"
        ));
        assertTrue(!StorefrontRegistrationClient.validSessionCookie(
                "pz_storefront_session=" + token
                        + "; Path=/; Max-Age=86401; HttpOnly; Secure; SameSite=Lax"
        ));
    }

    @Test
    public void rejectsManipulatedOrOutOfContractValues() {
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.register(
                "short", "123e4567-e89b-42d3-a456-426614174000", "0.1.0", 1,
                "16", "Pixel", "en-US", "UTC", "granted"
        ));
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.permission("allowed"));
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.resolveCampaignTarget("short"));
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.event(
                new StorefrontEventQueue.Event("delivered", "delivery0000001", "2026-08-15T12:00:00Z", "", 0)
        ));
        assertThrows(IllegalArgumentException.class, () -> StorefrontRegistrationPayload.heartbeat(
                "0.1.0", 1, "16", "Pixel\nInjected", "en-US", "UTC"
        ));
    }

    @Test
    public void escapesJsonCharactersDeterministically() {
        assertEquals("\"PowerZona \\\"A\\\"\\\\B\"", StorefrontRegistrationPayload.quote("PowerZona \"A\"\\B"));
    }

    @Test
    public void classifiesNestedFailuresWithoutLeakingRawDetails() {
        RuntimeException integrity = new RuntimeException(
                "wrapper containing secret-material",
                new IllegalStateException("PlayIntegrity attestation rejected token=private")
        );
        assertEquals(
                "App Check/Play Integrity no pudo emitir una atestación válida.",
                StorefrontRegistrationClient.safeFailure(integrity)
        );

        RuntimeException network = new RuntimeException(
                "wrapper",
                new java.net.UnknownHostException("private.staging.example")
        );
        assertEquals(
                "No fue posible conectar con los servicios de la aplicación.",
                StorefrontRegistrationClient.safeFailure(network)
        );
        assertEquals(
                "La operación falló de forma segura. Revisa la conectividad y la configuración de la aplicación.",
                StorefrontRegistrationClient.safeFailure(new RuntimeException("private detail"))
        );
    }

    @Test
    public void messagingCallbackCannotRegisterMessagingAgain() {
        assertTrue(StorefrontRegistrationClient.shouldRequestMessagingRegistration(
                StorefrontRegistrationClient.RegistrationOrigin.APP_START
        ));
        assertTrue(StorefrontRegistrationClient.shouldRequestMessagingRegistration(
                StorefrontRegistrationClient.RegistrationOrigin.USER_ACTION
        ));
        assertTrue(!StorefrontRegistrationClient.shouldRequestMessagingRegistration(
                StorefrontRegistrationClient.RegistrationOrigin.MESSAGING_CALLBACK
        ));
    }
}
