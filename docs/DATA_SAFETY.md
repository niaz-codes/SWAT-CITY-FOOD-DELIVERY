# Data Safety Document

This document provides information for the Google Play Console Data Safety form based on the actual code analysis of the Swat City Food Delivery app.

## Data Collection

### Personal Information
- **Name**: Collected during account registration (customers, riders)
- **Email address**: Collected for authentication and communication
- **Phone number**: Collected for account verification and delivery coordination
- **Address/Delivery addresses**: Stored for order delivery
- **CNIC**: Collected for rider verification (riders only)

### Location Data
- **Precise location**: Collected only while the app is in use (foreground), for order placement and rider tracking during deliveries
- **Approximate location**: Collected for restaurant discovery and delivery area calculation
- **No background location**: The app does not request `ACCESS_BACKGROUND_LOCATION` (Android) or "Always" location (iOS). Rider positions are sent while the rider app is active.

### Financial Information
- **Payment information**: Payment method details (not stored as full card numbers; processed by third-party payment gateways: Easypaisa, JazzCash). Cash on Delivery (COD) is also supported.

### App Activity
- **Order history**: Orders placed, status, delivery details
- **Account activity**: Login sessions

### Device Information
- **Device identifiers**: Device push tokens for notifications

## Data Sharing

### With Third Parties
- **Supabase**: Authentication, database, file storage
- **Easypaisa**: Payment processing
- **JazzCash**: Payment processing
- **Expo Push Notifications**: Push notification delivery

**No data is sold to third parties.**

## Data Encryption
- Data is encrypted in transit using HTTPS/TLS
- Data is encrypted at rest on Supabase servers

## Data Deletion
- Users can delete their account via in-app button or web deletion request
- Upon account deletion, user data and related records are removed or anonymized

## Security Practices
- Row Level Security is enabled on every table, but there are currently **zero
  per-user policies**. All database access goes through the backend API using
  the service-role key server-side; the mobile app and admin website have no
  direct database access. This is secure-by-default (nothing is exposed without
  an API) but it is not per-user RLS - see `docs/SUPABASE_RLS.md`.
- Session tokens are stored in the app's private AsyncStorage on the device.
  This is app-sandboxed storage, not the OS keychain/keystore.
- Role-based access control
- Input validation and sanitization
- No service role keys in client apps

## Categories for Play Console
- **Personal info**: Email, name, phone number, user IDs
- **Location**: Approximate and precise location
- **Financial info**: Payment methods (handled by gateways)
- **App activity**: Order history
- **Device or other IDs**: Push notification tokens
