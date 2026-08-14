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
}
