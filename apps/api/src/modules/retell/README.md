# Retell Voice Integration

Retell live-call custom functions call these Fastify endpoints with `Payload: args only`.
Requests are verified against the raw JSON body using `x-retell-signature` when `RETELL_CUSTOM_FUNCTION_SECRET` is set, falling back to `RETELL_API_KEY` when no custom-function secret is configured.
For local tunnel testing only, you can set `RETELL_CUSTOM_FUNCTION_SKIP_SIGNATURE_VERIFICATION=true` to bypass signature verification temporarily. Do not enable this outside controlled development use.

All functions accept shared context fields: `tenantId`, `billingAccountId`, `contactId`, `communicationAttemptId`, `providerCallId`, plus optional inline `account`, `contact`, `invoices`, and `promisesToPay`.

## Local Setup

1. Start the API:

   ```bash
   pnpm dev:api
   ```

2. Expose it through an HTTPS tunnel, for example:

   ```bash
   cloudflared tunnel --url http://127.0.0.1:3001
   ```

   or:

   ```bash
   ngrok http 3001
   ```

3. Put the public HTTPS tunnel URL in `.env`:

   ```bash
   RETELL_CUSTOM_FUNCTION_BASE_URL=https://your-tunnel.example
   RETELL_CUSTOM_FUNCTION_SECRET=<same secret configured in Retell>
   ```

4. Restart the API after editing `.env`, then open:

   ```text
   GET /retell/functions
   ```

   The response returns the exact full `endpointUrl` values to paste into Retell. You can also call `GET /retell/functions?baseUrl=https://your-tunnel.example` to generate URLs for a one-off tunnel without changing `.env`.

5. In Retell, create each function as an HTTP custom function:

   - Method: `POST`
   - URL: the matching `endpointUrl`
   - Payload: `args only`
   - Signature secret: the same value as `RETELL_CUSTOM_FUNCTION_SECRET`, or `RETELL_API_KEY` if no custom-function-specific secret is set

| Function | Endpoint | Call-flow node | Required function args | Sample compact response |
| --- | --- | --- | --- | --- |
| `get-account-snapshot` | `POST /retell/functions/get-account-snapshot` | opening context after right-party check | shared context | `{ "ok": true, "status": "ok", "groupSummaries": [] }` |
| `get-group-invoice-details` | `POST /retell/functions/get-group-invoice-details` | invoice group treatment | `groupName` | `{ "ok": true, "status": "ok", "invoices": [] }` |
| `create-promise-to-pay` | `POST /retell/functions/create-promise-to-pay` | promise capture | `invoiceIds`, `promisedDate` | `{ "ok": true, "status": "captured", "promiseToPay": { "id": "ptp_1" } }` |
| `update-promise-to-pay` | `POST /retell/functions/update-promise-to-pay` | promise confirmation or recovery | `promiseToPayId`, `invoiceIds`, `status` | `{ "ok": true, "status": "captured" }` |
| `capture-partial-payment-commitment` | `POST /retell/functions/capture-partial-payment-commitment` | partial payment commitment capture | `invoiceIds`, `promisedAmountCents` | `{ "ok": true, "status": "captured", "metadata": { "remainingBalanceCents": 100000 } }` |
| `request-payment-plan-review` | `POST /retell/functions/request-payment-plan-review` | payment plan request capture | `invoiceIds`, `summary` | `{ "ok": true, "status": "needs_follow_up" }` |
| `capture-non-commitment` | `POST /retell/functions/capture-non-commitment` | non-commitment capture | `invoiceIds` | `{ "ok": true, "status": "captured" }` |
| `log-paid-already` | `POST /retell/functions/log-paid-already` | paid-already claim | `invoiceIds` | `{ "ok": true, "status": "captured" }` |
| `mark-dispute` | `POST /retell/functions/mark-dispute` | dispute capture | `invoiceIds`, `disputeType`, `summary`, optional `disputeScope`, `groupName`, `groupInvoiceIds` | `{ "ok": true, "status": "captured", "metadata": { "dispute_scope": "invoice_subset", "next_action_after_dispute": "continue_with_remaining_groups" } }` |
| `request-callback` | `POST /retell/functions/request-callback` | callback scheduling | `dueAt` or `requestedAt` | `{ "ok": true, "status": "captured" }` |
| `capture-handler-handoff` | `POST /retell/functions/capture-handler-handoff` | handler handoff before bucket handling | `newHandlerName` | `{ "ok": true, "status": "needs_follow_up" }` |
| `send-invoice-copy` | `POST /retell/functions/send-invoice-copy` | document request | `invoiceIds` | `{ "ok": true, "status": "queued" }` |
| `send-soa` | `POST /retell/functions/send-soa` | document request | `statementSnapshotId` optional, email destination optional, `callSummary` optional | `{ "ok": true, "status": "queued", "metadata": { "automationAction": "send_statement_of_account" } }` |
| `finalize-call-outcome` | `POST /retell/functions/finalize-call-outcome` | post-call finalization | shared context, `communicationAttemptId`, `disposition`, optional captured outcomes | `{ "ok": true, "status": "recorded", "taskCount": 2 }` |
| `send-payment-link` | `POST /retell/functions/send-payment-link` | payment link offer after authorization | `invoiceIds` | `{ "ok": true, "status": "queued" }` |

Safety behavior is intentionally conservative: newly discovered contacts are not auto-sent to, disputed invoices are not auto-chased, billing account and branch context are echoed in responses, and each accepted function call emits a structured audit entry. When `mark-dispute` is called, the disputed scope is frozen for the rest of the call. Narrow `invoice_subset` or `current_group_only` disputes may continue only with clearly separate remaining groups; `whole_account_or_balance` and `unclear` disputes stop automated group handling; `routing_or_handler_issue` switches the live flow to handler handoff.

Task creation is intentionally centralized in `POST /v1/retell/collections/call-outcome` and the webhook-backed post-call automation described below. `finalize-call-outcome` remains available as a manual/legacy fallback, but the default low-latency Retell flow should not call it synchronously during the conversation.

## Recommended Post-Call Automation

For low-latency Retell calls, do not put `send-soa` or `finalize-call-outcome` in the live call path. The outbound Retell payload now marks Yield-originated collections calls with:

```json
{
  "post_call_automation": "email_recap_and_soa",
  "post_call_email_recap": true,
  "post_call_send_soa": true
}
```

When Retell later posts a terminal `call_ended`, `call_analyzed`, or equivalent webhook to `POST /v1/retell/webhooks/calls`, the API first normalizes the call into Call Inbox, then queues `RetellPostCallAutomationService` behind the webhook response. The background automation:

- retrieves/enriches the Retell call when API credentials are available
- upserts the normalized Call Inbox record
- records a post-call outcome through the existing Retell outcome workflow
- creates linked follow-up tasks through the task module
- generates a customer-facing call recap from the Retell summary/transcript
- sends the recap plus SOA PDF through the existing outbound email workflow
- logs automation start, outcome recording, email result, and completion audit entries

Safety gates stay in the existing email workflow. The SOA email is sent only through the configured outbound email service, and unverified or unsafe contacts are routed to approval/blocked states rather than auto-sent. Missed calls, voicemail, and wrong-contact outcomes do not auto-send the recap/SOA.

The live custom-function endpoints remain available for manual fallback, testing, or agent flows that still need synchronous capture. Production Retell flows should prefer webhook post-call automation for recap/SOA work to avoid delaying the actual call.

See `docs/retell_low_latency_flow.md` for the recommended flow map. In short: live nodes gather facts, live functions are reserved for immediate caller-facing actions, and terminal webhooks persist outcomes, tasks, activities, and recap/SOA after the call.

## Retell Test Import

To promote operator-console imported invoice snapshots into canonical `parent_account`, `billing_account`, `contact`, and canonicalized `invoice` rows for local Retell testing, call:

```text
POST /v1/retell/testing/import-operator-console-read-model
```

Sample request:

```json
{
  "customerName": "Metro Group - Makati",
  "defaultPhoneNumber": "+639171234567",
  "markContactsVerified": true
}
```

Notes:

- `customerName` and `customerReference` are optional filters. Without them, the endpoint imports up to `25` account groups by default.
- `defaultPhoneNumber` is optional, but it is useful when the operator-console read model has email contacts but no dialable phone number yet.
- `markContactsVerified` defaults to `false`. Set it to `true` only for deliberate local Retell test imports when you want the imported contacts to pass the current pre-call safety gate.
