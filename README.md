# Freshers'26 — Civil Engineering

Standalone Freshers collection portal for the Civil Engineering department at Shri Mata Vaishno Devi University.

## Separation from M&C

This repository is intentionally independent from `freshers26-mnc`.

- Separate GitHub repository: `utkraa9/freshers26-civil`
- Separate Supabase project: to be created for Civil
- Separate database tables and Row Level Security policies
- Separate Storage bucket for Civil payment proofs
- Separate organizer/admin authentication
- Separate UPI/payment configuration
- Separate registration/reference IDs

No M&C Supabase URL, key, table, storage bucket, organizer account, ticket data, or payment configuration should be copied into this project.

## Current site

The site is a static HTML/CSS/JS app and is ready for deployment. The backend integration points are deliberately left as Civil-only configuration placeholders.

Before accepting real registrations, create the Civil Supabase project and connect these values:

- `CIVIL_SUPABASE_URL`
- `CIVIL_SUPABASE_ANON_KEY`
- `CIVIL_UPI_ID`
- `CIVIL_CONTRIBUTION`

Never commit a Supabase service-role key or private credential to this repository.

## Next backend layer

The production version should add Civil-only tables for registrations, payment proofs, organizer verification, and event passes; plus a Civil-only Storage bucket and organizer authentication policies.
