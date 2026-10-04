package main

import (
	"encoding/json"
	"net/http"
)

const companionName = "ipcam-companion"
const companionVersion = "1.0.0"

type statusResp struct {
	OK      bool   `json:"ok"`
	Name    string `json:"name"`
	Version string `json:"version"`
	Port    int    `json:"port"`
}

// statusHandler lets the browser page confirm both that something is
// listening on this port AND that it is actually this relay (via the "name"
// field), not some unrelated local service that happens to answer 200 here.
func statusHandler(port int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Cache-Control", "no-store")
		json.NewEncoder(w).Encode(statusResp{
			OK:      true,
			Name:    companionName,
			Version: companionVersion,
			Port:    port,
		})
	}
}
