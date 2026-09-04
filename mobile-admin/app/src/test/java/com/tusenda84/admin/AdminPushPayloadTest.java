package com.tusenda84.admin;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import org.junit.Test;

import java.util.HashMap;
import java.util.Map;

public final class AdminPushPayloadTest {
    private static Map<String, String> validPayload() {
        Map<String, String> payload = new HashMap<>();
        payload.put("notification_id", "notif0000000001");
        payload.put("store_id", "store0000000001");
        payload.put("type", "new_order");
        payload.put("title", "Pedido nuevo");
        payload.put("body", "Hay un pedido pendiente.");
        payload.put("target_url", "/admin/orders/order000000001");
        payload.put("priority", "critical");
        return payload;
    }

    @Test
    public void acceptsOnlyTheExactAdminDataContract() {
        AdminPushPayload parsed = AdminPushPayload.fromFcm(validPayload());
        assertNotNull(parsed);
        assertEquals("notif0000000001", parsed.notificationId);
        assertEquals("store0000000001", parsed.storeId);
        assertEquals("/admin/orders/order000000001", parsed.targetUrl);

        Map<String, String> extra = validPayload();
        extra.put("external_url", "https://example.test");
        assertNull(AdminPushPayload.fromFcm(extra));

        Map<String, String> missing = validPayload();
        missing.remove("store_id");
        assertNull(AdminPushPayload.fromFcm(missing));
    }

    @Test
    public void rejectsExternalTargetsControlsAndUnknownPriorities() {
        Map<String, String> external = validPayload();
        external.put("target_url", "https://example.test/phishing");
        assertNull(AdminPushPayload.fromFcm(external));

        Map<String, String> control = validPayload();
        control.put("title", "Pedido\nforjado");
        assertNull(AdminPushPayload.fromFcm(control));

        Map<String, String> priority = validPayload();
        priority.put("priority", "urgent");
        assertNull(AdminPushPayload.fromFcm(priority));
    }
}
