package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.HashMap;
import java.util.Map;

import org.junit.Test;

public final class StorefrontPushPayloadTest {
    @Test
    public void parsesOnlyTheStorefrontContractForTheCompiledStore() {
        StorefrontPushPayload payload = StorefrontPushPayload.fromMap(validPayload(), "powerzona-storefront-staging");
        assertEquals("ok", StorefrontPushPayload.diagnosticCode(validPayload(), "powerzona-storefront-staging"));
        assertEquals("powerzona-storefront-staging", payload.storeKey);
        assertEquals("abc123def456ghi", payload.campaignId);
        assertEquals("delivery0000001", payload.deliveryId);
        assertEquals("Oferta PowerZona", payload.title);
        assertEquals("Producto disponible por tiempo limitado.", payload.body);
        assertEquals("product", payload.targetType);
        assertEquals("/t/powerzona/producto/bateria-12v", payload.targetPath);
    }

    @Test
    public void rejectsCrossTenantUnknownSchemaAndFreeUrlTypes() {
        Map<String, String> crossTenant = validPayload();
        crossTenant.put(StorefrontPushPayload.STORE_KEY, "otra");
        assertEquals("invalid_store", StorefrontPushPayload.diagnosticCode(crossTenant, "powerzona-storefront-staging"));
        assertNull(StorefrontPushPayload.fromMap(crossTenant, "powerzona-storefront-staging"));

        Map<String, String> schema = validPayload();
        schema.put(StorefrontPushPayload.SCHEMA_VERSION, "2");
        assertNull(StorefrontPushPayload.fromMap(schema, "powerzona-storefront-staging"));

        Map<String, String> freeUrl = validPayload();
        freeUrl.put(StorefrontPushPayload.TARGET_TYPE, "url");
        freeUrl.put(StorefrontPushPayload.TARGET_PATH, "https://evil.example");
        assertNull(StorefrontPushPayload.fromMap(freeUrl, "powerzona-storefront-staging"));
    }

    @Test
    public void allowsOrderWithoutLeakingAReceiptPath() {
        Map<String, String> order = validPayload();
        order.put(StorefrontPushPayload.TARGET_TYPE, "order");
        order.put(StorefrontPushPayload.TARGET_PATH, "");
        StorefrontPushPayload payload = StorefrontPushPayload.fromMap(order, "powerzona-storefront-staging");
        assertEquals("", payload.targetPath);
    }

    @Test
    public void rejectsOversizedNotificationCopy() {
        Map<String, String> title = validPayload();
        title.put(StorefrontPushPayload.TITLE, "x".repeat(121));
        assertEquals("invalid_title", StorefrontPushPayload.diagnosticCode(title, "powerzona-storefront-staging"));
        assertNull(StorefrontPushPayload.fromMap(title, "powerzona-storefront-staging"));

        Map<String, String> body = validPayload();
        body.put(StorefrontPushPayload.BODY, "x".repeat(1001));
        assertNull(StorefrontPushPayload.fromMap(body, "powerzona-storefront-staging"));
    }

    private static Map<String, String> validPayload() {
        Map<String, String> value = new HashMap<>();
        value.put(StorefrontPushPayload.SCHEMA_VERSION, "1");
        value.put(StorefrontPushPayload.CHANNEL, "storefront");
        value.put(StorefrontPushPayload.STORE_KEY, "powerzona-storefront-staging");
        value.put(StorefrontPushPayload.CAMPAIGN_ID, "abc123def456ghi");
        value.put(StorefrontPushPayload.DELIVERY_ID, "delivery0000001");
        value.put(StorefrontPushPayload.TITLE, "Oferta PowerZona");
        value.put(StorefrontPushPayload.BODY, "Producto disponible por tiempo limitado.");
        value.put(StorefrontPushPayload.TARGET_TYPE, "product");
        value.put(StorefrontPushPayload.TARGET_PATH, "/t/powerzona/producto/bateria-12v");
        value.put(StorefrontPushPayload.IMAGE_URL, "https://media.example/push/image.webp");
        return value;
    }
}
