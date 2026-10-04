package main

import (
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// candidatePorts must stay in sync with COMPANION_PORTS in
// ipCameraViewer/assets/scripts/script.js - the browser side probes exactly
// this list to find whichever one this process managed to bind.
var candidatePorts = []string{"58712", "58713", "58714"}

const defaultAllowedOrigin = "https://toolbox.pusyuuwanko.com"

func main() {
	originsFlag := flag.String("allow-origin", defaultAllowedOrigin,
		"comma-separated list of exact origins allowed to use this relay")
	allowHostsFlag := flag.String("allow-hosts", "",
		"optional comma-separated list of exact camera hostnames/IPs to allow (in addition to the private-IP check); empty means any private/loopback/link-local address is allowed")
	flag.Parse()

	allowed := splitAndTrim(*originsFlag)
	if len(allowed) == 0 {
		fmt.Fprintln(os.Stderr, "no allowed origins configured, refusing to start")
		os.Exit(1)
	}

	if hostList := splitAndTrim(*allowHostsFlag); len(hostList) > 0 {
		allowedHostsOnly = make(map[string]bool, len(hostList))
		for _, h := range hostList {
			allowedHostsOnly[strings.ToLower(h)] = true
		}
	}

	ln, port, err := listenFirstAvailable(candidatePorts)
	if err != nil {
		fmt.Fprintln(os.Stderr, "could not bind to any candidate port ("+strings.Join(candidatePorts, ", ")+"): "+err.Error())
		os.Exit(1)
	}

	mux := http.NewServeMux()
	mux.Handle("/status", withCORS(allowed, statusHandler(port)))
	mux.Handle("/relay", withCORS(allowed, http.HandlerFunc(relayHandler)))

	fmt.Println("ipcam-companion " + companionVersion)
	fmt.Println("listening on http://127.0.0.1:" + strconv.Itoa(port) + " (loopback only)")
	fmt.Println("allowed origin(s): " + strings.Join(allowed, ", "))
	if len(allowedHostsOnly) > 0 {
		fmt.Println("relay restricted to allow-listed hosts only (-allow-hosts is set)")
	}
	fmt.Println("this window must stay open while you use motion detection. press Ctrl+C to stop.")

	if err := http.Serve(ln, mux); err != nil {
		fmt.Fprintln(os.Stderr, "server stopped: "+err.Error())
		os.Exit(1)
	}
}

// listenFirstAvailable binds strictly to the 127.0.0.1 loopback literal (never
// "localhost", never an empty/all-interfaces address) so this relay can never
// become reachable from anywhere else on the LAN.
func listenFirstAvailable(ports []string) (net.Listener, int, error) {
	for _, p := range ports {
		ln, err := net.Listen("tcp", "127.0.0.1:"+strings.TrimSpace(p))
		if err == nil {
			_, portStr, splitErr := net.SplitHostPort(ln.Addr().String())
			if splitErr != nil {
				ln.Close()
				continue
			}
			port, convErr := strconv.Atoi(portStr)
			if convErr != nil {
				ln.Close()
				continue
			}
			return ln, port, nil
		}
	}
	return nil, 0, errors.New("all candidate ports are already in use")
}

func splitAndTrim(s string) []string {
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
