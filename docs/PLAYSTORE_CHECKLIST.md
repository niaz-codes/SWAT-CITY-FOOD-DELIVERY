# Google Play Store Publishing Checklist

## Pre-Submission Requirements

### App Information
- [ ] App name: "Swat City Food Delivery"
- [ ] Short description (80 chars max)
- [ ] Full description (4000 chars max)
- [ ] App category: Food & Drink
- [ ] Content rating completed
- [ ] Target SDK version meets latest requirements
- [ ] App signing configured

### Legal & Policies
- [ ] Privacy Policy published at public URL (`/privacy-policy`)
- [ ] Terms & Conditions published at public URL (`/terms`)
- [ ] Data Safety form completed based on actual data collection
- [ ] Account deletion mechanism implemented (in-app + web page)

### Technical Requirements
- [ ] Signed AAB file generated
- [ ] Version code incremented
- [ ] Version name updated
- [ ] ProGuard/R8 enabled for release builds
- [ ] No debug logs in release build
- [ ] All API calls use HTTPS
- [ ] Secure token storage implemented
- [ ] App works on target API level

### Permissions
- [ ] AndroidManifest reviewed - removed unused permissions
- [ ] Location permission requested only when in use (with rationale)
- [ ] Camera permission explained (rider registration)
- [ ] POST_NOTIFICATIONS permission handled
- [ ] Runtime permission dialogs implemented

### Security
- [ ] No secrets in code (API keys, service keys)
- [ ] All payment flows use secure backend verification
- [ ] RLS enabled on all database tables
- [ ] Input validation on all forms
- [ ] Certificate pinning considered (if needed)

### Testing
- [ ] Tested on real devices
- [ ] Customer flow tested end-to-end
- [ ] Rider flow tested end-to-end
- [ ] Payment flows tested (COD, Easypaisa, JazzCash)
- [ ] Admin functionality removed from mobile app verified
- [ ] Account deletion tested

### Store Listing Assets
- [ ] App icon (512x512)
- [ ] Feature graphic (1024x500)
- [ ] Screenshots (phone: 2-8 screenshots)
- [ ] Screenshots (tablet: optional but recommended)

## Data Safety Answers
Based on code audit:
- **Personal info collected**: Name, phone number, email address, address
- **Location**: Approximate/precise location (for delivery and rider tracking)
- **Financial info**: Payment information (processed by payment gateways)
- **App activity**: Order history
- **Device or other IDs**: Device tokens for notifications

Data is encrypted in transit and at rest. Users can request account deletion.
