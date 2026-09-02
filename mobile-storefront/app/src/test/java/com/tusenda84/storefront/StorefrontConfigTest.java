package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StorefrontConfigTest {
    @Test
    public void acceptsOnlyCanonicalHttpsOrigins() {
        assertEquals("https://staging.example", StorefrontConfig.normalizeHttpsOrigin("https://Staging.Example/"));
        assertEquals("", StorefrontConfig.normalizeHttpsOrigin("http://staging.example"));
        assertEquals("", StorefrontConfig.normalizeHttpsOrigin("https://user@staging.example"));
        assertEquals("", StorefrontConfig.normalizeHttpsOrigin("https://staging.example/api"));
        assertEquals("", StorefrontConfig.normalizeHttpsOrigin("https://staging.example?token=value"));
    }

    @Test
    public void comparesOriginsWithoutTrustingPaths() {
        assertTrue(StorefrontConfig.sameOrigin(
                "https://staging.example/api/storefront/v1/session/bootstrap/code",
                "https://staging.example"
        ));
        assertFalse(StorefrontConfig.sameOrigin("https://evil.example/path", "https://staging.example"));
        assertFalse(StorefrontConfig.sameOrigin("http://staging.example/path", "https://staging.example"));
    }

    @Test
    public void validatesDeclarativeStoreConfiguration() {
        assertEquals("powerzona", StorefrontConfig.normalizeStoreKey("powerzona"));
        assertEquals("", StorefrontConfig.normalizeStoreKey("Power Zona"));
        assertEquals(
                "powerzona-storefront-staging",
                StorefrontConfig.normalizeAppKey("powerzona-storefront-staging")
        );
        assertEquals("powerzona_runtime", StorefrontConfig.normalizeAppKey("powerzona_runtime"));
        assertEquals("", StorefrontConfig.normalizeAppKey("Power Zona"));
        assertEquals(
                "https://tusenda84.com/t/powerzona",
                StorefrontConfig.normalizeStoreUrl(
                        "https://TuSenda84.com/t/powerzona",
                        "powerzona"
                )
        );
        assertEquals("", StorefrontConfig.normalizeStoreUrl(
                "https://tusenda84.com/t/otra",
                "powerzona"
        ));
        assertEquals("", StorefrontConfig.normalizeStoreUrl(
                "https://tusenda84.com/t/powerzona?admin=1",
                "powerzona"
        ));
    }

    @Test
    public void acceptsOnlyTheDedicatedSecureWebSocketEndpoint() {
        assertEquals(
                "wss://realtime.tusenda84.com/v1/connect",
                StorefrontConfig.normalizeWebSocketUrl(
                        "wss://Realtime.TuSenda84.com/v1/connect"
                )
        );
        assertEquals("", StorefrontConfig.normalizeWebSocketUrl(
                "ws://realtime.tusenda84.com/v1/connect"
        ));
        assertEquals("", StorefrontConfig.normalizeWebSocketUrl(
                "wss://realtime.tusenda84.com/v1/connect?ticket=secret"
        ));
        assertEquals("", StorefrontConfig.normalizeWebSocketUrl(
                "wss://user@realtime.tusenda84.com/v1/connect"
        ));
        assertEquals("", StorefrontConfig.normalizeWebSocketUrl(
                "wss://realtime.tusenda84.com/otra-ruta"
        ));
    }
}
