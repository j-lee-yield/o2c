# Retell Low-Latency Collections Flow

This build treats Retell as the live conversation adapter, not the system of record for collections outcomes.

Recommended flow:

1. Live conversation nodes gather facts from the customer.
2. Live function calls are used only for immediate caller-facing needs:
   - `get-account-snapshot`
   - `get-group-invoice-details`
   - `send-invoice-copy` when the caller explicitly asks and immediate send is required
   - `send-soa` only as a manual fallback
   - handler handoff or call transfer only when it changes the active conversation
   - `mark-dispute` only when dispute scope must change live branching
3. Final live nodes should not call backend persistence functions such as `create-promise-to-pay`, `update-promise-to-pay`, or `finalize-call-outcome`.
4. End the call quickly once the conversation is complete.
5. Retell posts a terminal webhook such as `call_ended` or `call_analyzed` to `POST /v1/retell/webhooks/calls`.
6. The backend normalizes the call into Collections Call Inbox.
7. The backend records post-call outcome, persists safe promise updates, creates linked tasks, updates activity, and sends recap/SOA when configured.

Retell dynamic variables are strings. Branching checks should use string-safe comparisons such as `{{overdue_without_promise_count}} != "0"` rather than native boolean assumptions.

Legacy/manual fallback functions remain available for compatibility and local testing, but the happy path is webhook-first so the customer does not wait on persistence, tasking, PDF generation, or email sending during the call.
