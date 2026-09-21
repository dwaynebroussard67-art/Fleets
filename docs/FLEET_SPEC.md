# FLEET — Full Concept Spec

This is the complete original concept. Not all of it is in scope for the MVP — see README.md for what to build first. This doc exists so the full picture is preserved and nobody has to guess at intent later.

## Core problems being solved

1. **Reputation trap** — ratings owned by the platform, lost on deactivation
2. **Vehicle trap** — can't earn without a car, can't buy a car without earning
3. **Isolation trap** — contractor status = no collective voice

## The Fleet Score

Portable, cross-platform, driver-owned reputation aggregated from every platform a driver works on.

- Range: 0–1000
- Five weighted components:
  - Reliability — 25%
  - Safety — 20%
  - Customer rating — 25%
  - Community — 15%
  - Experience — 15%

(Original spec included IPFS/Polygon blockchain anchoring for permanence — cut from MVP, revisit only if a real need for tamper-proof history emerges.)

## Tiers

Four tiers, automatic advancement, marketplace fee drops as tier rises:

| Tier | Fee |
|---|---|
| Recruit | 12% |
| Operative | — |
| Specialist | — |
| Captain | 8% |

## Vehicle Ownership Program (Phase 3+, not MVP)

- Chapter captain matches driver to a Fleet-negotiated rental partner
- 15–20% of every gig earning auto-deducted toward ownership
- Title transfers after ~36–52 weeks
- No credit check, no down payment

## Chapters (Phase 3+, not MVP)

City/metro chapters led by Tier-4 Captains, plus co-captains and officers. Captains approve vehicle applications, authorize collective actions, manage chapter funds, earn a share of chapter revenue.

## Other pillars (Phase 2+, not MVP)

- **Intelligence Feed** — real-time, community-verified: surge zones, hot zones, checkpoints, outages, rate changes. Widened beyond delivery drivers to ALL drivers — dump truck/gravel haulers, garbage truck drivers — sharing road conditions, closures, dangerous areas.
- **Marketplace** — local-business direct-hire, 8% fee via Stripe Connect
- **Collective-action tooling** — petitions, slowdowns, negotiations, solidarity funds
- **Benefits Pool** — negotiated group benefits

## The social/recognition layer (MVP — this ships first)

This is the non-negotiable core feature. The driver-facing problems this solves, in the founder's words:

- Vehicle wear (tires, mileage) goes uncompensated and drivers are told to "just do your taxes right" — unhelpful for people who don't know how and don't earn enough for it to matter
- Unjustified status demotions (platinum→gold→silver) triggered by e.g. a false customer claim — read as a deliberate lever to suppress pay
- No coordination or unity among drivers
- No one — ever — tells them they did a good job

### Design for the recognition feature

- Driver logs a delivery/shift: time, date, duration
- The app generates a short, original, non-repeating acknowledgment grounded in what was actually logged — not generic praise. Example: "You got six people their food who had no way to get it themselves."
- Framing is about **meaning**, not flattery
- Optional, long-form, private self-disclosure log so drivers can share as much about themselves as they want — privacy is paramount here
- Fallback if generated messages feel dry/hollow: surface ~8 candidate drivers per day for a human (the founder, initially) to personally reach out to directly

### Social/venting space (Phase 2, design now, build later)

A place for drivers to vent about the platforms and share grievances — the "break room" no gig platform gives them. Open vs. private visibility not yet decided. Care must be taken that drivers face no repercussions for what they post.

## Original tech stack (full, not MVP-scoped)

- Next.js + React Native/Expo
- Node/Express
- Postgres (Supabase) + Redis + PostGIS
- Socket.io
- Stripe Connect
- Mapbox

## Known defects flagged in prior refactor pass — fix before or during build, don't reintroduce

- Broken template literals
- Unparameterized SQL
- Unsafe-inline CSP

Recommended swap: Fastify + BullMQ over raw Express, if/when a job queue is needed.

## Explicit non-goals

- Not competing with Uber/DoorDash/Lyft directly
- Not primarily a revenue project — validation and real usage matter more than monetization at this stage
- Patentability/IP protection is explicitly NOT a priority for this project
