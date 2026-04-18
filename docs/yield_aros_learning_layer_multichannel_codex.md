# Yield AROS Learning Layer PRD (Multi-Channel-Ready)

## Purpose
Learn customer payment behavior, channel preference, document requirements, and reconciliation patterns across **email, SMS, and voice/call**.

## Design stance
Email-complete for MVP; architected for later integrations with **Twilio**, **Vapi**, **Retell**, **ElevenLabs**, or equivalent providers.

## Goals
- Improve who to contact
- Improve which channel to use
- Improve when to contact
- Improve how to group invoices
- Improve which documents to send
- Improve how likely a promise-to-pay is to be kept
- Improve how to score invoice-payment matches
- Improve exception routing
- Improve next-best-action ranking

## Channel architecture principles
- **Provider-agnostic design**: learning and memory must not depend on vendor-specific payloads.
- **Three-layer model**:
  - **Intent**: remind, request remittance, resend docs, follow up on PTP, escalate
  - **Channel**: email, SMS, call
  - **Provider**: Twilio, Vapi, Retell, ElevenLabs, other
- Normalize transcripts, dispositions, delivery events, replies, and opt-outs into one learning framework.

## Scope
### In scope
- Unified multi-channel event model
- Account/contact memory with channel preferences
- Channel-aware derived features
- Next-best-action scoring across email/SMS/call
- Provider-agnostic delivery abstraction
- Operator feedback across channels
- Channel-specific safety constraints
- Call outcome and transcript-ready ingestion model

### Out of scope for v1
- Autonomous high-risk voice negotiation
- Advanced voice emotion detection
- Fully self-optimizing policy without approval
- Deep channel-specific ML beyond lightweight scoring

## New objects
### communication_attempt
Canonical outbound or inbound communication object:
- channel: `email | sms | call`
- provider: `internal | twilio | vapi | retell | elevenlabs | other`
- direction: `outbound | inbound`
- intent_type: reminder, overdue follow-up, request remittance, resend documents, PTP follow-up, escalation, exception resolution
- status: queued, sent, delivered, opened, clicked, replied, failed, bounced, connected, missed, voicemail_left, completed, blocked

### channel_behavior_profile
Learned channel performance per account/contact:
- response_rate
- avg_response_latency_hours
- payment_conversion_rate
- ptp_capture_rate
- ptp_kept_rate
- wrong_contact_rate
- doc_request_rate
- opt_out_rate
- connect_rate
- voicemail_rate
- right_party_contact_rate
- best_for_intent

### call_outcome
- answered
- duration_seconds
- disposition
- promised_amount_minor
- promised_date
- transcript_uri
- transcript_summary
- sentiment_label
- operator_review_required

### sms_outcome
- delivered
- replied
- clicked
- opt_out_received
- extracted_ptp
- extracted_remittance_signal

### email_outcome
- delivered
- opened
- replied
- bounced
- attachments_sent
- docs_requested
- extracted_ptp
- extracted_remittance_signal

## Event taxonomy
### Channel-agnostic
- communication_attempt_created
- communication_blocked
- communication_completed
- customer_response_received
- payment_outcome_after_communication

### Email
- email_sent
- email_delivered
- email_opened
- email_replied
- email_bounced
- email_link_clicked
- invoice_bundle_resent

### SMS
- sms_sent
- sms_delivered
- sms_failed
- sms_replied
- sms_link_clicked
- sms_opt_out_received

### Call
- call_placed
- call_connected
- call_failed
- call_missed
- voicemail_left
- call_disposition_logged
- call_transcript_ingested
- call_ptp_captured
- call_wrong_contact
- callback_requested

## What the system should learn
### Payment behavior
- Average days late
- Statement-cycle tendencies
- Partial/full payment behavior
- Short-pay and overpayment patterns
- Centralized payer behavior
- Remittance timing quality
- Branch-vs-parent payment behavior

### Communication behavior
- Best contact
- Best channel
- Best send window
- Grouped-vs-invoice-level preference
- Resend-before-pay likelihood
- Whether AP mailbox or named contact performs better

### Documentation behavior
- Whether invoice alone is enough
- Whether SOA / DR / PO / OR are usually required
- Whether resend leads to payment

### Promise-to-pay behavior
- Kept vs broken rate
- Average slip from promised date
- Reliable contacts
- Approval needs

### Cash application behavior
- Reference quality
- Remittance timing
- Bundling patterns
- Cross-branch matching behavior
- Common amount variance patterns

### Exception behavior
- Recurring exception types
- Resolution times
- Best playbooks
- Whether "already paid" is usually true

## Memory and scoring additions
### Account memory
- preferred_channel
- fallback_channel
- channel_priority_order
- best_channel_for_reminders
- best_channel_for_ptp_followup
- best_channel_for_resend_requests
- best_channel_for_remittance_requests
- do_not_sms
- do_not_call
- voice_agent_allowed

### Contact memory
- preferred_channel
- sms_number_verified
- phone_number_verified
- email_verified
- call_connect_rate
- sms_reply_rate
- email_reply_rate

### Derived features
- Email/SMS/call payment conversion rates
- Email/SMS/call response speed
- Right-party-contact probability
- Channel fatigue score
- Sequencing success rates
- Best channel by intent

### Next-best-action actions
- send_email_grouped_reminder
- send_email_invoice_level_reminder
- send_sms_reminder
- send_sms_ptp_followup
- place_collection_call
- place_manual_review_call
- send_email_resend_bundle
- send_sms_payment_link_or_prompt
- request_remittance_via_email
- request_remittance_via_sms
- follow_up_ptp_via_email
- follow_up_ptp_via_sms
- escalate_to_owner
- route_to_exception
- hold_for_review

## Safety and policy rules
- No SMS if opt-out exists
- No call outside allowed hours
- No auto-call to unverified numbers
- No autonomous voice negotiation for discounts, settlements, or payment plans
- No voice escalation on strategic accounts without approval
- No sensitive document bundles over SMS unless via secure-link policy
- Transcripts and summaries must be reviewable when used as learning inputs

## Provider abstraction
### SMS provider interface
- send_sms
- fetch_delivery_status
- receive_inbound_sms
- fetch_click_events
- mark_opt_out

### Voice provider interface
- place_call
- receive_call_status
- receive_transcript
- receive_disposition
- fetch_recording_metadata
- terminate_call

### Email provider interface
- send_email
- fetch_delivery_status
- fetch_reply_events
- fetch_open_events
- fetch_bounce_events

Learning consumes **normalized outcomes**; provider adapters convert Twilio/Vapi/Retell/ElevenLabs or other payloads into canonical events.

## UI surfaces this powers
- **Account Workspace**: preferred channel, best channel by intent, right-party-contact rate, PTP capture rate by channel, call readiness
- **Collections Queue**: recommended channel, reason summary, approval-needed badge, channel history
- **Contact detail panel**: performance by channel, verified status, opt-out flags
- **Approvals Queue**: voice outreach requested, first SMS outreach, strategic-account call review, SMS blocked due to opt-out

## Metrics
### Primary learning metrics
- Payment conversion by channel
- Response rate by channel
- Right-party-contact rate for calls
- PTP kept rate by channel
- Resend-to-payment conversion by channel
- Opt-out rate
- Call-to-payment conversion
- SMS-to-payment conversion

### Operational safety metrics
- Wrong-contact calls
- SMS opt-out events
- Blocked unsafe channel actions
- Transcript-review exception rate

## Phased rollout
### Phase 1
Email-complete, multi-channel schema and provider abstractions in place, normalized communication events implemented.

### Phase 2
SMS integration via Twilio or equivalent.

### Phase 3
Voice integration via Twilio / Vapi / Retell / ElevenLabs adapter layer.

### Phase 4
Channel sequencing optimization and best-channel-by-intent policies.

## Codex-ready add-on prompt
```text
Revise the Learning Layer implementation to be explicitly multi-channel-ready.

Requirements:
- support email, sms, and call as first-class channels
- keep provider integrations abstract and vendor-agnostic
- make the learning layer consume normalized communication outcomes rather than provider-specific payloads
- add support for future providers such as Twilio, Vapi, Retell, and ElevenLabs via adapter interfaces
- add these objects:
  - communication_attempt
  - channel_behavior_profile
  - call_outcome
  - sms_outcome
  - email_outcome
- expand account/contact behavior profiles with channel preference and channel-specific performance fields
- expand next-best-action actions to include email, sms, and call variants
- add policy support for sms opt-out, call allowed hours, voice-agent enablement, per-channel approval requirements, and provider preference
- make transcripts and call dispositions usable as structured learning signals
- keep all learned behavior explainable and reversible
- do not weaken hard safety rules

At the end, summarize:
1. new schema added
2. provider abstraction model
3. channel-specific safety rules
4. what is email-complete now vs sms/call-ready for later
```
