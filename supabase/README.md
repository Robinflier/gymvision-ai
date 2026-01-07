# Supabase Types

This directory contains TypeScript type definitions for the Supabase database schema.

## Files

- `types.ts` - TypeScript type definitions matching the database schema

## Schema Tables

### `weights`
User weight tracking data
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key to auth.users)
- `date` (date)
- `weight` (numeric)
- `inserted_at` (timestamp)

### `workouts`
User workout sessions
- `id` (uuid, primary key)
- `user_id` (uuid, foreign key to auth.users)
- `date` (date)
- `name` (text, nullable)
- `exercises` (jsonb, nullable) - Array of exercises stored as JSON
- `duration` (numeric, nullable) - Duration in milliseconds
- `total_volume` (numeric, nullable)
- `inserted_at` (timestamp)

### `workout_exercises`
Exercises within a workout (normalized structure for future use)
- `id` (uuid, primary key)
- `workout_id` (uuid, foreign key to workouts)
- `name` (text, nullable)
- `sets` (jsonb, nullable)
- `inserted_at` (timestamp)

## Regenerating Types

If the database schema changes, you can regenerate the types using one of these methods:

### Method 1: Using Supabase CLI (Recommended)

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Login to Supabase:
   ```bash
   supabase login
   ```

3. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

4. Generate types:
   ```bash
   supabase gen types typescript --linked > supabase/types.ts
   ```

### Method 2: Using Supabase Dashboard

1. Go to your Supabase project dashboard
2. Navigate to **Settings** > **API**
3. Scroll down to **TypeScript types**
4. Copy the generated types
5. Paste into `supabase/types.ts`

### Method 3: Manual Update

If the schema changes, manually update `types.ts` to match:
- Update table definitions in the `Database` interface
- Ensure all columns match the SQL schema
- Update helper types if needed

## Usage

If using TypeScript in your project:

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from './supabase/types'

const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
)

// Now you get full type safety
const { data } = await supabase
  .from('workouts')
  .select('*')
  .eq('user_id', userId)
```

## Current Schema Version

Last updated: Based on `supabase_schema_migration.sql`
- Weights table: ✅
- Workouts table: ✅ (with exercises JSONB for backward compatibility)
- Workout_exercises table: ✅

