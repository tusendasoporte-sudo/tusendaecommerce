package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

public final class StorefrontPushPayloadTest {
    @Test
    public void parsesOnlyTheStorefrontContractForTheCompiledStore() {
        StorefrontPushPayload payload = StorefrontPushPayload.fromMap(validPayload(), "powerzona");
        assertEquals("powerzona", payload.storeKey);
        assertEquals("abc123def456ghi", payload.campaignId);
        assertEquals("product", payload.targetType);
        assertEquals("/t/powerzona/producto/bateria-12v", payload.targetPath);
    }

    @Test
    public void rejectsCrossTenantUnknownSchemaAndFreeUrlTypes() {
        Map<String, String> crossTenant = validPayload();
        crossTenant.put(StorefrontPushPayload.STORE_KEY, "otra");
        assertNull(StorefrontPushPayload.fromMap(crossTenant, "powerzona"));

        Map<String, String> schema = validPayload();
        schema.put(StorefrontPushPayload.SCHEMA_VERSION, "2");
        assertNull(StorefrontPushPayload.fromMap(schema, "powerzona"));

        Map<String, String> freeUrl = validPayload();
        freeUrl.put(StorefrontPushPayload.TARGET_TYPE, "url");
        freeUrl.put(StorefrontPushPayload.TARGET_PATH, "https://evil.example");
        assertNull(StorefrontPushPayload.fromMap(freeUrl, "powerzona"));
    }

    @Test
    public void allowsOrderWithoutLeakingAReceiptPath() {
        Map<String, String> order = validPayload();
        order.put(StorefrontPushPayload.TARGET_TYPE, "order");
        order.put(StorefrontPushPayload.TARGET_PATH, "");
        StorefrontPushPayload payload = StorefrontPushPayload.fromMap(order, "powerzona");
        assertEquals("", payload.targetPath);
    }

    private static Map<String, String> validPayload() {
        Map<String, String> value = new HashMap<>();
        value.put(StorefrontPushPayload.SCHEMA_VERSION, "1");
        value.put(StorefrontPushPayload.CHANNEL, "storefront");
        value.put(StorefrontPushPayload.STORE_KEY, "powerzona");
        value.put(StorefrontPushPayload.CAMPAIGN_ID, "abc123def456ghi");
        value.put(StorefrontPushPayload.TARGET_TYPE, "product");
        value.put(StorefrontPushPayload.TARGET_PATH, "/t/powerzona/producto/bateria-12v");
        value.put(StorefrontPushPayload.IMAGE_URL, "https://media.example/push/image.webp");
        return value;
    }
}
