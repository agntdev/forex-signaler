# Forex Signal Generator — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A Telegram bot that delivers algorithmic Forex trading signals to users' private chats for manual approval. Signals include pair, side, entry/exit levels, confidence score, and optional rationale with interactive buttons for acceptance, dismissal, or snoozing. Users can customize preferences and access historical signals.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- Retail Forex traders
- Algorithmic trading enthusiasts

## Success criteria

- Users receive and manually act on signals within 90% accuracy of delivery timing
- Users can customize preferences without errors

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Initiate onboarding and collect user preferences
- **/history** (command, actor: user, command: /history) — Retrieve recent signals with optional filters
  - inputs: timeframe (24h/7d), pair filter, status filter
  - outputs: Signal history summary
- **/settings** (command, actor: user, command: /settings) — Modify user preferences and subscription status
  - inputs: preferred pairs, notification hours, max signals/day, unsubscribe
  - outputs: Updated preference confirmation

## Flows

### Onboarding
_Trigger:_ /start

1. Request timezone
2. Collect preferred major pairs (default all majors)
3. Set notification window (default 24/5)
4. Confirm subscription status

_Data touched:_ User profile

### Signal Delivery
_Trigger:_ Algo signal generation

1. Filter users by preferences
2. Send signal message with [Accept][Dismiss][Snooze 1h] buttons
3. Log delivery event
4. Update signal status based on user action

_Data touched:_ Signal, Delivery log

### Signal Retrieval
_Trigger:_ /history

1. Validate timeframe parameter
2. Filter signals by pair/status if specified
3. Display timestamped signal list with key metrics

_Data touched:_ Signal

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **User profile** _(retention: persistent)_ — User preferences and subscription status
  - fields: Telegram ID, timezone, preferred pairs, notification hours, max signals/day, subscription status
- **Signal** _(retention: persistent)_ — Algorithmic trading signal details
  - fields: id, timestamp, pair, side, entry price, stop-loss, take-profit, confidence, rationale, expiry time, status, tags
- **Delivery log** _(retention: persistent)_ — Signal delivery and user interaction history
  - fields: signal ID, Telegram ID, delivery timestamp, action (accepted/dismissed/snoozed)

## Integrations

- **Telegram** (required) — Bot API messaging and interactive buttons
- **Webhook/Email** (optional) — Admin alerts for system errors and subscription events
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Configure subscription tiers
- Set signal generation parameters
- Monitor delivery logs
- Manage admin alert endpoints

## Notifications

- Admin alerts for system errors
- Admin alerts for subscription status changes

## Permissions & privacy

- Secure storage of user preferences
- Anonymous signal delivery (no PII shared)
- User-controlled notification frequency

## Edge cases

- Expired signals in active delivery queue
- Users changing preferences during active signal window
- Signal generation during non-trading hours for some users

## Required tests

- End-to-end signal delivery with button interactions
- Preference update validation during active signals
- Signal expiry and suppression logic

## Assumptions

- Payment integration exists externally
- Signal generation algorithm is pre-implemented
- Users understand Forex trading risks
