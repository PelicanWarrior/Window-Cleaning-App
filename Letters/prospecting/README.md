# Outreach Tracking System

This folder contains your cold-outreach operating system for daily sends and follow-up tracking.

## Files

- `manchester_day1_leads_100.csv`: raw mixed scrape (includes some UK-wide spillover rows).
- `manchester_day1_leads_local.csv`: cleaned local list for Manchester and surrounding areas (recommended start file).
- `send_log.csv`: one row per outbound email sent.
- `response_log.csv`: one row per inbound reply.
- `daily_plan.csv`: daily campaign plan by area and target.
- `prepare_daily_batch.ps1`: creates a daily batch from the lead file and marks rows as `queued`.

## Recommended Daily Workflow (100/day)

1. Open `manchester_day1_leads_local.csv`.
2. Fill `email` and `owner_name` where available.
3. Prioritize rows with real company domains over generic contact forms.
4. Run batch prep:
   - `./prepare_daily_batch.ps1 -Area manchester-lancashire -Count 100 -MasterFile ./manchester_day1_leads_local.csv`
5. Send your emails from the batch file.
6. Log each send in `send_log.csv`.
7. Update lead `status` in master file:
   - `sent_e1`, `sent_e2`, `sent_e3`, `replied`, `won`, `closed`
8. Log every reply in `response_log.csv` and set `next_action_date`.

## Status Definitions

- `new`: not contacted yet
- `queued`: selected for today
- `sent_e1`: first email sent
- `sent_e2`: second email sent
- `sent_e3`: third email sent
- `replied`: any response received
- `won`: trial started / positive conversion
- `closed`: no further action

## Follow-up Timing

- E1: Day 0
- E2: Day 3
- E3: Day 7

## Important Notes

- Use only publicly listed business contact details.
- Include a simple opt-out line in every email.
- Keep outreach relevant to the business service offered.
