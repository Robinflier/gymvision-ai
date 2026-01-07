# Supabase Schema Migration Instructions

## Overview
This migration updates the Supabase database schema to match the GymVision AI app structure.

## Files
- `supabase_schema_migration.sql` - Complete SQL migration script

## Steps to Apply Migration

### 1. Open Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**

### 2. Run the Migration Script
1. Open the `supabase_schema_migration.sql` file
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **Run** to execute

### 3. Verify Tables Created
After running the migration, verify these tables exist:
- ✅ `weights` - User weight tracking
- ✅ `workouts` - Workout sessions
- ✅ `workout_exercises` - Exercises within workouts (for future use)

### 4. Verify Row Level Security (RLS)
1. Go to **Authentication** > **Policies** in Supabase dashboard
2. Verify RLS is enabled on all three tables
3. Verify policies exist for:
   - SELECT (view own data)
   - INSERT (create own data)
   - UPDATE (update own data)
   - DELETE (delete own data)

### 5. Refresh Schema Cache
After migration, refresh the Supabase schema cache:
1. Go to **Database** > **Tables**
2. Click the refresh icon or reload the page
3. Verify all tables appear correctly

## Important Notes

### Current App Structure
The app currently stores exercises as a JSON array in the `workouts.exercises` column. The migration includes:
- `exercises` JSONB column in `workouts` table (for current app compatibility)
- `workout_exercises` table (for future normalized structure)

### Data Migration
⚠️ **WARNING**: The migration script drops and recreates the `workouts` table, which will **DELETE ALL EXISTING WORKOUT DATA**.

If you have existing data to preserve:
1. Export existing data first
2. Run the migration
3. Import data back (may need transformation)

### Testing After Migration
After applying the migration, test:
1. ✅ User can create a workout
2. ✅ User can save weight logs
3. ✅ User can view only their own workouts
4. ✅ User can view only their own weight history
5. ✅ User A cannot see User B's data

## Troubleshooting

### Error: "relation already exists"
- The table already exists. The script uses `DROP TABLE IF EXISTS` to handle this.
- If issues persist, manually drop tables in this order:
  1. `workout_exercises`
  2. `workouts`
  3. `weights`

### Error: "permission denied"
- Ensure you're running as the database owner or have proper permissions
- Check that RLS policies are correctly created

### Error: "foreign key constraint"
- Ensure `auth.users` table exists (created by Supabase Auth)
- Check that user_id references are correct

## Next Steps
After successful migration:
1. Test the app with a new user account
2. Verify data isolation between users
3. Check that all CRUD operations work correctly
4. Monitor Supabase logs for any errors

