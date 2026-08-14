package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class StorefrontDeepLinkTest {
    private static final String STORE = "https://tusenda84.com/t/powerzona";

    @Test
    public void keepsNormalNavigationInsideOneConfiguredStore() {
        assertTrue(StorefrontDeepLink.isAllowedInternalNavigation(STORE, STORE));
        assertTrue(StorefrontDeepLink.isAllowedInternalNavigation(
                STORE + "/producto/bateria-12v?variant=blue#details",
                STORE
        ));
        assertTrue(StorefrontDeepLink.isAllowedInternalNavigation(
                "https://www.tusenda84.com/t/powerzona/checkout",
                STORE
        ));
        assertTrue(StorefrontDeepLink.isAllowedInternalNavigation(
                "https://tusenda84.com/orden/ORDER_12345/TOKEN_123456",
                STORE
        ));
    }

    @Test
    public void blocksOtherTenantsPrivilegedRoutesAndAmbiguousPaths() {
        assertFalse(StorefrontDeepLink.isAllowedInternalNavigation(
                "https://tusenda84.com/t/otra",
                STORE
        ));
        assertFalse(StorefrontDeepLink.isAllowedInternalNavigation(
                "https://tusenda84.com/admin",
                STORE
        ));
        assertFalse(StorefrontDeepLink.isAllowedInternalNavigation(
                "https://tusenda84.com/api/storefront/v1/installations/register",
                STORE
        ));
        assertFalse(StorefrontDeepLink.isAllowedInternalNavigation(
                "https://tusenda84.com/t/powerzona%2f..%2fadmin",
                STORE
        ));
        assertFalse(StorefrontDeepLink.isAllowedInternalNavigation(
                "http://tusenda84.com/t/powerzona",
                STORE
        ));
    }

    @Test
    public void classifiesOnlyExplicitExternalNavigation() {
        assertEquals(
                StorefrontDeepLink.NavigationDecision.EXTERNAL,
                StorefrontDeepLink.classifyNavigation("mailto:ventas@example.com", STORE)
        );
        assertEquals(
                StorefrontDeepLink.NavigationDecision.EXTERNAL,
                StorefrontDeepLink.classifyNavigation("https://payments.example/checkout", STORE)
        );
        assertEquals(
                StorefrontDeepLink.NavigationDecision.BLOCKED,
                StorefrontDeepLink.classifyNavigation("javascript:alert(1)", STORE)
        );
        assertEquals(
                StorefrontDeepLink.NavigationDecision.BLOCKED,
                StorefrontDeepLink.classifyNavigation("intent://unsafe#Intent;end", STORE)
        );
    }

    @Test
    public void resolvesTypedPushTargetsAndFallsBackClosed() {
        assertEquals(
                STORE + "/producto/bateria-12v",
                StorefrontDeepLink.resolvePushTarget(
                        STORE,
                        "powerzona",
                        "product",
                        "/t/powerzona/producto/bateria-12v"
                )
        );
        assertEquals(
                STORE + "?coupon=AHORRA%2020",
                StorefrontDeepLink.resolvePushTarget(
                        STORE,
                        "powerzona",
                        "coupon",
                        "/t/powerzona?coupon=AHORRA%2020"
                )
        );
        assertEquals(STORE, StorefrontDeepLink.resolvePushTarget(
                STORE,
                "powerzona",
                "product",
                "/t/otra/producto/privado"
        ));
        assertEquals(STORE, StorefrontDeepLink.resolvePushTarget(
                STORE,
                "powerzona",
                "order",
                ""
        ));
        assertEquals(STORE, StorefrontDeepLink.resolvePushTarget(
                STORE,
                "powerzona",
                "section",
                "/t/powerzona/admin"
        ));
    }
}
