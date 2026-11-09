# Browser checklist

Fill in PASS/FAIL and observed counts/statuses. Use the existing owner and org only; do not create users or payments for this check.

| Check | Exact steps | Result |
|---|---|---|
| Workspace restore under normal refresh | Start/restart `npm start`; sign in as the existing owner; open DevTools → Network, enable Preserve log, filter `api`; hard-refresh once. Confirm `/api/onboarding` succeeds and restores the existing org, with no “Create your workspace” screen. Record total `/api/*` request count and onboarding status. | UNVERIFIED |
| No workspace false-negative on transient error | In DevTools Network, throttle/offline briefly or use an existing test proxy to make onboarding return 429/503; reload once. Confirm the last known org remains selected, UI says “Server busy, retrying…” / offers Retry, and no workspace-create POST fires. Restore network and click Retry; confirm workspace recovers. | UNVERIFIED |
| Dashboard and module request budget | With Network log preserved, count requests on one full dashboard load, then separately open Dashboard, Transactions, Ledger, Invoices, Reports, Approvals and Notifications. Optional modules should be opened only when their server flags are enabled. Record per-view request totals and status/error codes. Reopen each view within 20 seconds and confirm GETs are deduplicated/cached; no tight retry loop. | UNVERIFIED |
| Existing transaction/ledger persistence | On Transactions, record the existing sandbox payment row; on Ledger, record its corresponding journal entry. Restart the server, sign out and sign back in, hard-refresh, revisit Transactions and Ledger. Confirm both rows remain and match the existing org's API responses. No capture/payment required. | UNVERIFIED |
| Retry-After behavior | If a 429 is observed, inspect response headers for `Retry-After`; confirm the client waits and does not immediately repeat the request. Record endpoint, HTTP status, error code and delay only (no tokens/data). | UNVERIFIED |
