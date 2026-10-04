package main

import (
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"time"
)

// cookieJar lets the relay carry a camera's session cookie across requests:
// seedCookiesFromParam primes it once from the page-supplied "cookie" query
// param, and from then on http.Client automatically attaches whatever the
// jar holds for that host AND updates it from any Set-Cookie the camera
// sends back (e.g. session renewal), all without the browser ever seeing or
// storing the camera's cookies itself.
var cookieJar, _ = cookiejar.New(nil)

// relayClient dials only through safeDialContext (see ssrf.go), and
// deliberately has no overall Timeout: MJPEG streams are unbounded by
// design, so the request must be allowed to run as long as the browser keeps
// reading. When the browser disconnects, r.Context() is canceled, which
// unblocks the upstream read below and lets Do() return.
var relayClient = &http.Client{
	Jar: cookieJar,
	Transport: &http.Transport{
		DialContext:           safeDialContext,
		ResponseHeaderTimeout: 8 * time.Second,
	},
}

var forwardedResponseHeaders = []string{
	"Content-Type",
	"Content-Length",
	"Content-Range",
	"Accept-Ranges",
}

// seedCookiesFromParam parses a raw "name=value; name2=value2" Cookie header
// string (as supplied by the page from a camera's JSON config) and loads it
// into cookieJar for target's host. Built via a throwaway *http.Request
// because that is the standard way to parse a Cookie header string in Go;
// there is no separate stdlib function for it.
func seedCookiesFromParam(target *url.URL, rawCookieHeader string) {
	if rawCookieHeader == "" {
		return
	}
	fake := &http.Request{Header: http.Header{"Cookie": {rawCookieHeader}}}
	if cookies := fake.Cookies(); len(cookies) > 0 {
		cookieJar.SetCookies(target, cookies)
	}
}

// relayHandler fetches cam.url server-side (from this machine, which sits on
// the user's own LAN) and streams the response straight back to the browser
// with this relay's own CORS headers attached, without ever buffering a full
// frame/stream in memory.
func relayHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	if !relayRateLimiter.allow() {
		http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
		return
	}
	select {
	case relaySemaphore <- struct{}{}:
		defer func() { <-relaySemaphore }()
	default:
		http.Error(w, "too many concurrent relays, try again shortly", http.StatusServiceUnavailable)
		return
	}

	raw := r.URL.Query().Get("url")
	target, err := url.Parse(raw)
	if raw == "" || err != nil || target.Hostname() == "" ||
		(target.Scheme != "http" && target.Scheme != "https") {
		http.Error(w, "invalid or missing url parameter", http.StatusBadRequest)
		return
	}
	if !isHostAllowlisted(target.Hostname()) {
		http.Error(w, "target host is not in the -allow-hosts list", http.StatusForbidden)
		return
	}

	if cookieParam := r.URL.Query().Get("cookie"); cookieParam != "" {
		seedCookiesFromParam(target, cookieParam)
	}

	outReq, err := http.NewRequestWithContext(r.Context(), http.MethodGet, target.String(), nil)
	if err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if target.User != nil {
		pass, _ := target.User.Password()
		outReq.SetBasicAuth(target.User.Username(), pass)
	}
	if rng := r.Header.Get("Range"); rng != "" {
		outReq.Header.Set("Range", rng)
	}

	resp, err := relayClient.Do(outReq)
	if err != nil {
		http.Error(w, "upstream fetch failed: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	for _, h := range forwardedResponseHeaders {
		if v := resp.Header.Get(h); v != "" {
			w.Header().Set(h, v)
		}
	}
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(resp.StatusCode)

	if r.Method == http.MethodHead {
		return
	}

	flusher, canFlush := w.(http.Flusher)
	buf := make([]byte, 32*1024)
	for {
		n, readErr := resp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := w.Write(buf[:n]); writeErr != nil {
				return // browser disconnected
			}
			if canFlush {
				flusher.Flush() // push each chunk immediately for MJPEG/MP4 streams
			}
		}
		if readErr != nil {
			return // upstream EOF or error; the page's own reconnect logic takes it from here
		}
	}
}
