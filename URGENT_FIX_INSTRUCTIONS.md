# 🚨 URGENT: Fix Database Schema

## The Problem
Your app is failing because:
1. ❌ The `weights` table doesn't exist
2. ❌ The `workouts.date` column doesn't exist
3. ❌ Schema cache is outdated

## The Solution - DO THIS NOW:

### Step 1: Open Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Click **SQL Editor** in the left sidebar

### Step 2: Run the Fix Script
1. Open the file `FIX_SCHEMA_NOW.sql` in this folder
2. Copy **ALL** the contents
3. Paste into the Supabase SQL Editor
4. Click **Run** (or press Cmd/Ctrl + Enter)

### Step 3: Verify It Worked
After running, you should see:
- ✅ "Success. No rows returned" or similar success message
- ✅ No errors

### Step 4: Refresh Schema Cache
The script includes `NOTIFY pgrst, 'reload schema';` but you can also:
1. Go to **Database** > **Tables** in Supabase
2. Click the refresh icon
3. Wait a few seconds

### Step 5: Test the App
1. Close and reopen the app
2. Try to save a weight entry
3. Try to save a workout
4. Check that data is isolated per user

## What the Script Does:
- ✅ Creates `weights` table if missing
- ✅ Adds `date` column to `workouts` if missing
- ✅ Adds `exercises`, `duration`, `total_volume` columns if missing
- ✅ Creates `workout_exercises` table
- ✅ Enables Row Level Security (RLS)
- ✅ Creates RLS policies so users only see their own data
- ✅ Creates indexes for performance
- ✅ Refreshes schema cache

## After Running:
- Each user will only see their own workouts
- Each user will only see their own weight logs
- Data is completely isolated per account
- All queries will work correctly

## If You Still Get Errors:
1. Check Supabase logs: **Logs** > **Postgres Logs**
2. Verify tables exist: Run `VERIFY_SCHEMA.sql`
3. Make sure you're logged in to the correct Supabase project

