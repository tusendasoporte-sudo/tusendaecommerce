package com.tusenda84.storefront;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

public final class StorefrontEventQueueTest {
    private static StorefrontEventQueue.Event event(String deliveryId, int attempts) {
        return new StorefrontEventQueue.Event(
                "opened", deliveryId, "2026-08-15T12:00:00Z", "", attempts
        );
    }

    @Test
    public void deduplicatesAndKeepsOnlyTheNewestSixtyFourEvents() {
        List<StorefrontEventQueue.Event> events = new ArrayList<>();
        for (int index = 0; index < 70; index += 1) {
            events = StorefrontEventQueue.withEvent(
                    events,
                    event("deliver" + String.format("%08d", index), 0)
            );
        }
        assertEquals(StorefrontEventQueue.MAX_EVENTS, events.size());
        assertEquals("deliver00000006", events.get(0).deliveryId);
        List<StorefrontEventQueue.Event> duplicate = StorefrontEventQueue.withEvent(
                events,
                event("deliver00000069", 0)
        );
        assertEquals(StorefrontEventQueue.MAX_EVENTS, duplicate.size());
        assertEquals("deliver00000069", duplicate.get(duplicate.size() - 1).deliveryId);
    }

    @Test
    public void expiresAfterSevenDaysAndDropsTheTenthFailedAttempt() {
        long daySeven = Instant.parse("2026-08-22T12:00:00Z").toEpochMilli();
        assertTrue(StorefrontEventQueue.pruned(List.of(
                event("deliver00000001", 0),
                event("deliver00000002", StorefrontEventQueue.MAX_ATTEMPTS - 1)
        ), daySeven).isEmpty());

        List<StorefrontEventQueue.Event> attempted = StorefrontEventQueue.withRecordedAttempt(
                List.of(event("deliver00000002", StorefrontEventQueue.MAX_ATTEMPTS - 1)),
                "opened:deliver00000002"
        );
        assertTrue(attempted.isEmpty());
        List<StorefrontEventQueue.Event> retained = StorefrontEventQueue.withRecordedAttempt(
                List.of(event("deliver00000003", 0)),
                "opened:deliver00000003"
        );
        assertEquals(1, retained.size());
        assertEquals(1, retained.get(0).attempts);
    }
}
