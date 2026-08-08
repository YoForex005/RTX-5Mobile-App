# Backend/DevOps Fix Prompt: Broker Directory Times Out on Android

## Objective

Fix the network/CDN/DNS path for the public broker directory so the mobile app can reliably load:

`GET https://superbackend.orrnn.com/api/v2/broker/servers`

Do not change the response contract, broker routing fields, or authentication behavior. The endpoint is public and currently returns the correct data, but its dual-stack connection path intermittently stalls long enough for the mobile app's intentional 10-second safety timeout to fire.

## User-visible failure

On the `Login Account` screen, the Broker Server field shows:

`Broker list request timed out. Check this device's internet connection and retry.`

The saved broker is `achiever-financials`, and LOGIN remains disabled because the app cannot validate the saved broker against the public directory.

## Verified evidence - 2026-08-08, Asia/Calcutta

### Contract and origin availability

- The endpoint returns HTTP 200 and a valid raw-v2 top-level array.
- It returns four enabled/active brokers.
- `achiever-financials` is present and routes to `https://service.achieverfinancials.com`.
- `https://service.achieverfinancials.com/health` returns HTTP 200.
- Therefore, this is not a missing broker row, invalid JSON/schema, disabled broker, or Achiever outage.

### DNS and dual-stack transport

`superbackend.orrnn.com` currently advertises both IPv4 and IPv6 through Cloudflare:

- A: `104.21.57.102`, `172.67.162.241`
- AAAA: `2606:4700:3035::6815:3966`, `2606:4700:3036::ac43:a2f1`

On the affected Android device/network:

- IPv4 is reachable.
- IPv6 reports `Network is unreachable`.
- Android `curl` selects IPv4 and returns the directory successfully in about 0.89-1.23 seconds.
- A plain React Native `fetch()` to the directory hostname stayed pending for more than 45 seconds.
- In the same running React Native app, `fetch()` to the IPv4-only Achiever `/health` endpoint completed with HTTP 200.

Independent Windows dual-stack evidence shows the same pattern:

- Default request: HTTP 200 in 22.84 seconds.
- DNS: 0.02 seconds.
- TCP connect: 21.13 seconds.
- Forced IPv4: HTTP 200 in 0.63 seconds.
- Forced IPv6: connection timeout after 12 seconds.
- Cloudflare response header: `cf-cache-status: DYNAMIC`.

The delay occurs primarily before the HTTP request reaches the application origin. The mobile frontend should not hardcode Cloudflare IP addresses, bypass TLS hostname validation, or extend the login wait indefinitely.

## Required investigation and fix

1. Inspect Cloudflare DNS/proxy and IPv6 settings for `superbackend.orrnn.com`.
2. Reproduce from an IPv4-working / IPv6-unreachable mobile network, using both a native HTTP client and React Native/OkHttp - not only server-side curl.
3. Confirm why the hostname's advertised AAAA path can stall clients instead of falling back quickly to IPv4.
4. Apply a safe domain-side mitigation. Depending on the verified cause, this may be:
   - correcting the IPv6/Cloudflare route;
   - temporarily removing/turning off AAAA advertisement for this hostname;
   - or providing a dedicated IPv4-reachable HTTPS broker-directory hostname and updating the deployment value for `EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL`.
5. Evaluate safe edge caching for this public GET endpoint. It is currently `DYNAMIC`; a short TTL with revalidation/stale-on-error may reduce origin/cold-path exposure. Do not cache tenant-private or authenticated data.
6. Preserve HTTPS, CORS support, the public unauthenticated behavior, and the exact broker-directory payload fields.
7. Add latency and reachability monitoring from India/Asia mobile networks, including dual-stack and IPv4-only probes.

Do not mark the task complete by only showing that the origin eventually returns HTTP 200. The failure is the connection deadline seen by the mobile client.

## Acceptance criteria

- The affected Android React Native client receives HTTP 200 from `/api/v2/broker/servers` without a manual retry.
- Cold and warm mobile requests finish below the app's 10-second limit; target p95 <= 2 seconds and p99 <= 5 seconds.
- At least 20 consecutive Android React Native requests pass after an idle/cold period.
- Standard dual-stack, forced IPv4, and - if AAAA remains advertised - forced IPv6 checks all succeed. If IPv6 cannot be supported reliably, the hostname must not advertise an unusable AAAA path.
- The response remains valid raw-v2 broker-directory JSON with all enabled/active brokers, including the exact `achiever-financials` `server_url`.
- No mobile code may be asked to hardcode an IP address, weaken TLS, or accept an unvalidated fallback route.
- Provide before/after timing evidence, the exact Cloudflare/DNS/origin change, monitoring evidence, and a rollback plan.

## Reproduction commands

Run from Windows PowerShell:

```powershell
Resolve-DnsName superbackend.orrnn.com -Type A
Resolve-DnsName superbackend.orrnn.com -Type AAAA

curl.exe -4 --connect-timeout 10 --max-time 15 -sS -o NUL -w "ipv4 connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s remote=%{remote_ip} status=%{http_code}`n" "https://superbackend.orrnn.com/api/v2/broker/servers"

curl.exe -6 --connect-timeout 10 --max-time 15 -sS -o NUL -w "ipv6 connect=%{time_connect}s tls=%{time_appconnect}s ttfb=%{time_starttransfer}s total=%{time_total}s remote=%{remote_ip} status=%{http_code}`n" "https://superbackend.orrnn.com/api/v2/broker/servers"
```

Run against the connected Android device:

```powershell
adb shell "curl -sS --connect-timeout 10 --max-time 15 -o /dev/null -w 'status=%{http_code} connect=%{time_connect}s tls=%{time_appconnect}s first_byte=%{time_starttransfer}s total=%{time_total}s ip=%{remote_ip}\n' https://superbackend.orrnn.com/api/v2/broker/servers"

adb shell ping -c 2 -W 3 104.21.57.102
adb shell ping6 -c 2 -W 3 2606:4700:3035::6815:3966
```

## Required completion report

Return:

1. confirmed root cause;
2. exact DNS/CDN/origin changes;
3. before/after React Native and curl timings;
4. response-contract validation;
5. monitoring/alerting added;
6. rollback procedure;
7. any required deployment environment change, including the exact new `EXPO_PUBLIC_BROKER_DIRECTORY_BASE_URL` value if a new hostname is introduced.
