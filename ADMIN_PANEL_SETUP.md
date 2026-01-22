# Admin Panel Setup Guide

## Overview
The admin panel allows you to:
1. **Approve/Reject** gym accounts (verification)
2. **Enable/Disable Premium** access for gym accounts
3. View all gym accounts and their status

## Setup Instructions

### 1. Set Your User ID as Admin

To access the admin panel, you need to add your Supabase user ID to the `ADMIN_USER_IDS` environment variable.

1. **Find your User ID:**
   - Log in to your app
   - Open browser console (F12)
   - Run: `(await supabase.auth.getSession()).data.session.user.id`
   - Copy the UUID that's returned

2. **Add to Render Environment Variables:**
   - Go to your Render dashboard
   - Navigate to your service → Environment
   - Add a new variable:
     - **Key:** `ADMIN_USER_IDS`
     - **Value:** Your user ID (e.g., `12345678-1234-1234-1234-123456789abc`)
   - For multiple admins, use comma-separated: `id1,id2,id3`
   - Save and redeploy

### 2. Access the Admin Panel

Once your user ID is set as admin:
1. Navigate to: `https://your-app-url.onrender.com/admin-panel`
2. Log in with your Supabase account
3. You should see the admin panel with all gym accounts

## Features

### Approve/Reject Gym Accounts
- **Approve:** Click "Approve" button to verify a gym account (gives them access to dashboard)
- **Reject:** Click "Reject" button to unverify a gym account (removes dashboard access)

### Premium Access
- **Enable Premium:** Check the "Premium Access" checkbox to give a gym full data access
- **Disable Premium:** Uncheck to give basic access only

### Data Access Levels

**Basic Accounts (not premium):**
- ✅ Total users, workouts, exercises counts
- ✅ Top 5 machines and muscles
- ✅ Basic weekday and hour charts
- ❌ No recent users list
- ❌ No monthly growth
- ❌ No daily time series
- ❌ No volume tracking
- ❌ No active users tracking
- ❌ No category breakdown

**Premium Accounts:**
- ✅ All basic features
- ✅ Full recent users list
- ✅ Monthly growth data
- ✅ All charts (daily time series, volume, active users, categories)
- ✅ Complete analytics

## Security Notes

- Only users listed in `ADMIN_USER_IDS` can access the admin panel
- Gym accounts must be verified (`is_verified: true`) before they can see any dashboard data
- Premium status is separate from verification - both are required for full access

## Troubleshooting

**"Admin access required" error:**
- Make sure your user ID is in `ADMIN_USER_IDS` environment variable
- Restart your Render service after adding the variable
- Check that you're logged in with the correct account

**Gym accounts not showing:**
- Make sure gym accounts have `is_gym_account: true` in their metadata
- Check Supabase auth.users table to verify gym accounts exist
