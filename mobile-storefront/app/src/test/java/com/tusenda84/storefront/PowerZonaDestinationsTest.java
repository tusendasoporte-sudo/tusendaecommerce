package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class PowerZonaDestinationsTest {
    private static final String HOME = "https://tusenda84.com/t/powerzona";

    private static String resolve(String type, String path) {
        return StorefrontDeepLink.resolvePushTarget(HOME, "powerzona", type, path);
    }

    @Test
    public void compiledVariantUsesTheSelectedValidatedIdentity() {
        assertTrue(!StorefrontConfig.storeKey().isEmpty());
        assertTrue(!StorefrontConfig.appKey().isEmpty());
        assertTrue(!StorefrontConfig.displayName().isEmpty());
        assertTrue(StorefrontConfig.storeUrl().endsWith("/t/" + StorefrontConfig.storeKey()));
        if ("debug".equals(BuildConfig.BUILD_TYPE)) {
            assertTrue(BuildConfig.APPLICATION_ID.endsWith(".debug"));
            assertTrue(BuildConfig.VERSION_NAME.endsWith("-debug"));
        } else {
            assertTrue("staging".equals(BuildConfig.BUILD_TYPE) || "release".equals(BuildConfig.BUILD_TYPE));
        }
    }

    @Test
    public void resolvesHomeProductAndCategory() {
        assertEquals(HOME, resolve("home", "/t/powerzona"));
        assertEquals(HOME + "/producto/bateria-12v", resolve(
                "product", "/t/powerzona/producto/bateria-12v"
        ));
        assertEquals(HOME + "/categoria/energia-solar", resolve(
                "category", "/t/powerzona/categoria/energia-solar"
        ));
    }

    @Test
    public void resolvesEveryClosedSection() {
        assertEquals(HOME + "/buscar", resolve("section", "/t/powerzona/buscar"));
        assertEquals(HOME + "/links", resolve("section", "/t/powerzona/links"));
        assertEquals(HOME + "/regalos", resolve("section", "/t/powerzona/regalos"));
        assertEquals(HOME + "/rifa", resolve("section", "/t/powerzona/rifa"));
        assertEquals(HOME + "/checkout", resolve("section", "/t/powerzona/checkout"));
    }

    @Test
    public void resolvesRaffleAndCouponWithoutTrustingDiscountData() {
        assertEquals(HOME + "/rifa/sorteo-agosto", resolve(
                "raffle", "/t/powerzona/rifa/sorteo-agosto"
        ));
        assertEquals(HOME + "/rifa", resolve("raffle", "/t/powerzona/rifa"));
        assertEquals(HOME + "?coupon=AHORRA%2020", resolve(
                "coupon", "/t/powerzona?coupon=AHORRA%2020"
        ));
        assertEquals(HOME, resolve("coupon", "/t/powerzona?coupon=AHORRA20&discount=100"));
    }

    @Test
    public void orderRequiresTheAuthenticatedServerResolver() {
        String configuredHome = StorefrontConfig.storeUrl();
        String configuredOrigin = configuredHome.substring(0, configuredHome.indexOf("/t/"));
        assertEquals(HOME, resolve("order", ""));
        assertEquals(
                configuredOrigin + "/orden/PZ-84/AbCdEfGhIjKlMnOp",
                StorefrontDeepLink.resolveServerOrderTarget(
                        configuredHome,
                        "/orden/PZ-84/AbCdEfGhIjKlMnOp"
                )
        );
        assertEquals(configuredHome, StorefrontDeepLink.resolveServerOrderTarget(
                configuredHome,
                "/orden/PZ-84/short"
        ));
        assertEquals(configuredHome, StorefrontDeepLink.resolveServerOrderTarget(
                configuredHome,
                "/t/otra/admin"
        ));
    }

    @Test
    public void everyInvalidOrCrossTenantPushFallsBackToHome() {
        assertEquals(HOME, resolve("product", "/t/otra/producto/secreto"));
        assertEquals(HOME, resolve("category", "/t/powerzona/categoria/uno/dos"));
        assertEquals(HOME, resolve("section", "/t/powerzona/admin"));
        assertEquals(HOME, resolve("raffle", "/t/powerzona/rifa/../admin"));
        assertEquals(HOME, resolve("url", "https://evil.example/phishing"));
    }
}
