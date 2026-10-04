package main

import "net/http"

// withCORS only ever echoes back an Origin that appears verbatim in allowed.
// It never emits a wildcard: this relay is meant to be usable exclusively by
// the ipCameraViewer page itself, not by arbitrary sites that happen to know
// a running instance's port.
//
// It also answers Private Network Access (PNA) preflights. Modern Chrome adds
// an extra permission gate, separate from CORS, for requests from a public
// origin into a private/loopback address space: the browser sends
// "Access-Control-Request-Private-Network: true" on the preflight, and
// without "Access-Control-Allow-Private-Network: true" in the response the
// browser blocks the actual request even if Origin matched.
func withCORS(allowed []string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		ok := false
		for _, a := range allowed {
			if a == origin {
				ok = true
				break
			}
		}

		if ok {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Range")
			w.Header().Set("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length")
			w.Header().Set("Access-Control-Max-Age", "600")
			if r.Header.Get("Access-Control-Request-Private-Network") == "true" {
				w.Header().Set("Access-Control-Allow-Private-Network", "true")
			}
		}

		if r.Method == http.MethodOptions {
			if !ok {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if !ok {
			http.Error(w, "forbidden origin", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
