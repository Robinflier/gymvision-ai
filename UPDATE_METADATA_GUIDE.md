# How to Update User Metadata in Supabase

## Method 1: Via Supabase Dashboard (Easiest)

1. Go to: https://supabase.com/dashboard/project/jugdkqzhcbqbjbvktqlz/auth/users
2. Click on the user you want to update
3. Click on the **"Raw JSON"** tab
4. Find the `raw_user_meta_data` field
5. Edit it directly, for example:
```json
{
  "is_gym_account": true,
  "gym_name": "SportCity Kampen",
  "contact_name": "John Doe",
  "contact_phone": "+31 6 12345678",
  "is_verified": false
}
```
6. Click **"Save"**

## Method 2: Via SQL in Supabase SQL Editor

1. Go to: https://supabase.com/dashboard/project/jugdkqzhcbqbjbvktqlz/sql
2. Run this SQL (replace `USER_ID` and values):

```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{is_gym_account}',
    'true'::jsonb
)
WHERE id = 'USER_ID_HERE';

-- Or update multiple fields at once:
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
    jsonb_set(
        jsonb_set(
            jsonb_set(
                COALESCE(raw_user_meta_data, '{}'::jsonb),
                '{is_gym_account}',
                'true'::jsonb
            ),
            '{gym_name}',
            '"SportCity Kampen"'::jsonb
        ),
        '{contact_name}',
        '"John Doe"'::jsonb
    ),
    '{is_verified}',
    'false'::jsonb
)
WHERE id = 'USER_ID_HERE';
```

## Method 3: Via Python Code (app.py)

The code already does this in several places. Example:

```python
from supabase import create_client

admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# Update metadata
admin_client.auth.admin.update_user_by_id(user_id, {
    "user_metadata": {
        "is_gym_account": True,
        "gym_name": "SportCity Kampen",
        "contact_name": "John Doe",
        "contact_phone": "+31 6 12345678",
        "is_verified": False
    }
})
```

## Common Metadata Fields for Gym Accounts

- `is_gym_account`: `true` (marks account as gym account)
- `gym_name`: Name of the gym (e.g., "SportCity Kampen")
- `contact_name`: Contact person name
- `contact_phone`: Contact phone number
- `is_verified`: `true` or `false` (admin approval status)

## To Approve a Gym Account

Set `is_verified` to `true` in the metadata. This allows the gym to access their dashboard.
