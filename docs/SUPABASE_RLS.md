# Supabase Row Level Security (RLS) Configuration

## Overview
Row Level Security is enabled on all tables. Access is controlled based on user roles (customer, rider, admin) stored in the profiles/users table.

**Current state:** RLS is enabled on every table and there are **zero policies** (see the RLS block in `backend/supabase/schema.sql`). The backend uses the service role key, which bypasses RLS, so every read and write goes through the API. The per-table policy list further down describes the intended end state, not what is deployed today - nothing depends on it yet.

## Role Definition
- **customer**: Regular customers who place orders
- **rider**: Delivery riders
- **admin**: Platform administrators

## Security Principles
1. Users cannot change their own role
2. Customers can only access their own data
3. Riders can only access their assigned orders and related data
4. Admins have full access via `is_admin()` check
5. Service role key is never used in client applications

## Helper Functions
\`\`\`sql
-- Check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users 
    WHERE _id = auth.uid()::uuid 
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
\`\`\`

## RLS Policies

### users table
- **SELECT**: Users can read their own record; admins can read all
- **UPDATE**: Users can update their own record (except role); admins can update all
- **INSERT**: Handled by backend/auth system
- **DELETE**: Only admins or via account deletion flow

### orders table
- **SELECT**: Customer sees own orders; rider sees assigned orders; admin sees all
- **INSERT**: Customers can create orders
- **UPDATE**: Admin can update all; restaurant/rider can update assigned orders with restrictions
- **DELETE**: Admin only

### rider_profiles table
- **SELECT**: Rider sees own profile; admin sees all; customers may see limited info
- **UPDATE**: Rider can update own profile (with restrictions); admin can update all
- **INSERT**: Via registration flow

### restaurants table
- **SELECT**: Public read for approved/open restaurants
- **UPDATE/DELETE/INSERT**: Admin only

### payments table
- **SELECT**: Customer sees own payments; rider sees related; admin sees all
- **INSERT/UPDATE**: Controlled by backend

### Storage Buckets
All storage buckets must have RLS enabled with policies restricting uploads to authenticated users and access based on context.

## Admin Web Security
- The admin web panel signs in through the backend API (email + password, then the emailed code) and holds the API's own session token - it does not use Supabase Auth
- The publishable/anon key is not shipped to the panel, so it can neither select nor insert anything
- All admin operations go through backend API with role verification against the `users` row
- No direct database access bypassing RLS

## Notes
- Service role key bypasses RLS and must only be used server-side
- All policies are enforced at database level
- Regular audits of RLS policies required
