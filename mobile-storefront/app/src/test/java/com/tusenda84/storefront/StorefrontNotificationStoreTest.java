package com.tusenda84.storefront;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StorefrontNotificationStoreTest {
    @Test
    public void acceptsOnlyTheChannelThatCanProduceEachReceiptState() {
        assertTrue(StorefrontNotificationStore.validDeliveryTrigger(
                "fcm_received",
                StorefrontNotificationStore.TRIGGER_FCM
        ));
        assertFalse(StorefrontNotificationStore.validDeliveryTrigger(
                "fcm_received",
                StorefrontNotificationStore.TRIGGER_WORKMANAGER
        ));
        assertTrue(StorefrontNotificationStore.validDeliveryTrigger(
                "native_delivered",
                StorefrontNotificationStore.TRIGGER_WEBSOCKET_SYNC
        ));
        assertTrue(StorefrontNotificationStore.validDeliveryTrigger(
                "native_delivered",
                StorefrontNotificationStore.TRIGGER_FOREGROUND_POLL
        ));
        assertTrue(StorefrontNotificationStore.validDeliveryTrigger(
                "native_delivered",
                StorefrontNotificationStore.TRIGGER_RESUME_SYNC
        ));
        assertTrue(StorefrontNotificationStore.validDeliveryTrigger(
                "native_delivered",
                StorefrontNotificationStore.TRIGGER_WORKMANAGER
        ));
        assertTrue(StorefrontNotificationStore.validDeliveryTrigger("read", ""));
        assertFalse(StorefrontNotificationStore.validDeliveryTrigger(
                "read",
                StorefrontNotificationStore.TRIGGER_FCM
        ));
        assertFalse(StorefrontNotificationStore.validDeliveryTrigger(
                "native_delivered",
                "unknown_transport"
        ));
    }
}
