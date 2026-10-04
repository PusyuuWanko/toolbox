package main

import (
	"sync"
	"time"
)

// tokenBucket is a minimal dependency-free rate limiter (no external module
// needed, keeping the build a single "go build ." with no go.sum to manage).
// It exists to blunt abuse/LAN-scanning bursts against /relay even from an
// already-Origin-approved caller; it is defense in depth, not the primary
// access control (Origin + private-IP-only dialing are).
type tokenBucket struct {
	mu         sync.Mutex
	tokens     float64
	max        float64
	refillRate float64 // tokens per second
	last       time.Time
}

func newTokenBucket(max, refillRate float64) *tokenBucket {
	return &tokenBucket{tokens: max, max: max, refillRate: refillRate, last: time.Now()}
}

func (b *tokenBucket) allow() bool {
	b.mu.Lock()
	defer b.mu.Unlock()

	now := time.Now()
	b.tokens += now.Sub(b.last).Seconds() * b.refillRate
	b.last = now
	if b.tokens > b.max {
		b.tokens = b.max
	}
	if b.tokens >= 1 {
		b.tokens--
		return true
	}
	return false
}

// Burst 40 / sustained 20 per second comfortably covers many cameras each
// polling roughly once a second, while still capping how fast a caller could
// otherwise hammer the relay (e.g. to sweep the LAN).
var relayRateLimiter = newTokenBucket(40, 20)

// relaySemaphore caps concurrent in-flight relays (mostly long-lived MJPEG/MP4
// streams) so a burst of requests can't pile up unbounded goroutines/sockets.
var relaySemaphore = make(chan struct{}, 32)
