package main

import (
	"context"
	"fmt"
	"net"
	"strings"
	"time"
)

// allowedHostsOnly, when non-empty, restricts /relay to exactly these
// hostnames/IPs (case-insensitive), checked against the literal host in the
// request URL before DNS resolution. It is an opt-in, stricter mode on top of
// (not instead of) the private-IP check below: populated from the
// -allow-hosts flag in main.go. Left nil/empty by default, meaning "any
// private/loopback/link-local address is allowed" as before.
var allowedHostsOnly map[string]bool

func isHostAllowlisted(host string) bool {
	if len(allowedHostsOnly) == 0 {
		return true
	}
	return allowedHostsOnly[strings.ToLower(host)]
}

// isAllowedTargetIP reports whether ip is safe to relay to: loopback, private
// (RFC1918/RFC4193), or link-local only. This keeps the relay usable purely as
// a LAN camera helper and prevents it from becoming a general-purpose open
// proxy to the public internet.
func isAllowedTargetIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	if ip.IsUnspecified() || ip.IsMulticast() {
		return false
	}
	return ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast()
}

// safeDialContext resolves addr and validates the resolved IP immediately
// before dialing it, inside a single call. Validating a hostname earlier and
// dialing it later would allow a DNS-rebinding attacker to swap the answer
// between the check and the connect; doing both here closes that gap.
func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}

	var ips []net.IP
	if literal := net.ParseIP(host); literal != nil {
		ips = []net.IP{literal}
	} else {
		ips, err = net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil {
			return nil, err
		}
	}

	var chosen net.IP
	for _, ip := range ips {
		if isAllowedTargetIP(ip) {
			chosen = ip
			break
		}
	}
	if chosen == nil {
		return nil, fmt.Errorf("target %q did not resolve to an allowed private/loopback/link-local address", host)
	}

	d := net.Dialer{Timeout: 5 * time.Second}
	return d.DialContext(ctx, network, net.JoinHostPort(chosen.String(), port))
}
