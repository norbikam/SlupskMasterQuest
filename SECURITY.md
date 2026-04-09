# Supabase Security Plan

## What Was Unsafe

The app currently authenticates by querying `profiles` with `login + haslo` from the client.
That means anyone with the public API key can try direct REST calls and read/write data if RLS is open.

Public/publishable Supabase keys in a mobile app are normal. The real protection must be:

1. Users authenticated with Supabase Auth
2. Row Level Security enabled on every table
3. Strict policies based on `auth.uid()` and role checks in SQL

## What Was Added In This Repository

1. Environment-based Supabase config in [supabase.ts](supabase.ts)
2. Secret-safe template in [.env.example](.env.example)
3. SQL hardening baseline in [supabase/security_hardening.sql](supabase/security_hardening.sql)
4. `.env` ignored in [.gitignore](.gitignore)

## Required Supabase Dashboard Actions

1. Open SQL Editor and run [supabase/security_hardening.sql](supabase/security_hardening.sql)
2. Verify all used tables have RLS enabled and forced
3. Ensure `evidence` bucket is **private** (not public)
4. Rotate leaked keys if they were ever committed publicly
5. Move all users to Supabase Auth accounts and map `profiles.id = auth.uid()`

## Important Migration Note

The current app code still uses custom login (`profiles.login`, `profiles.haslo`) and local `user_id` session.
For full security, switch login/session to Supabase Auth (`signInWithPassword`, `getSession`, `onAuthStateChange`).

Until this migration is done, strict RLS will block or break parts of the app because there is no trusted auth identity.

## Minimum Next Refactor

1. Add `auth_user_id uuid` in `profiles` and fill it for each existing user
2. Replace direct password query with Supabase Auth sign-in
3. Fetch current user profile with `auth.uid()` instead of reading arbitrary `user_id` from local storage
4. Remove plaintext password usage from app and database reads
