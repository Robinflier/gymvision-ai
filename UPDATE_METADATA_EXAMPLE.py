# Example: How to update user metadata in Supabase
# This is how it's done in app.py

from supabase import create_client
import os

# Get Supabase credentials
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

# Create admin client (service role key has full access)
admin_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# User ID to update (get this from Supabase dashboard)
user_id = "YOUR_USER_ID_HERE"

# Update metadata
admin_client.auth.admin.update_user_by_id(user_id, {
    "user_metadata": {
        "is_gym_account": True,
        "gym_name": "SportCity Kampen",
        "contact_name": "John Doe",
        "contact_phone": "+31 6 12345678",
        "is_verified": False  # Set to True to approve gym account
    }
})

print(f"Metadata updated for user {user_id}")
