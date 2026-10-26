Act as a Senior Full-Stack Engineer, Mobile App Developer, Security Engineer, QA Automation Engineer, and UI/UX Designer. Fully audit, fix, test, and prepare my existing Swat City Food Delivery project for production release.

**1. Complete Project Audit**
- Inspect the entire frontend, backend, Supabase database, authentication, APIs, notifications, payments, and admin website.
- Identify and fix actual bugs without breaking existing working functionality.
- Use the existing architecture and real backend APIs. Never replace working features with mock data or fake success responses.

**2. Test Accounts and Data**
- Create one test customer and one test rider using a safe, repeatable development-only seed script.
- Seed realistic restaurants, food categories, menus, prices, and sample orders.
- Test the complete customer-to-rider delivery workflow.
- Keep test data separate from production data and never expose real credentials.

**3. Firebase Cloud Messaging (FCM) Notifications**
- Audit and correctly implement FCM for Android push notifications.
- Verify notifications for new orders, rider order requests, order acceptance, rejection where supported, preparation, pickup, delivery, cancellations, and relevant status changes.
- Send notifications to the correct customer, eligible rider, or admin according to the existing workflow.
- Handle foreground, background, and terminated-app notification behavior, notification permissions, token registration/refresh, and notification tap deep links.
- Prevent duplicate notifications and unauthorized access to order information.
- Trigger notifications from trusted backend events, not just frontend actions.
- Test actual delivery on physical devices using valid FCM configuration. Clearly report anything that cannot be verified.

**4. Rider Registration — Profile Image**
- Inspect the actual rider registration screen and backend upload implementation.
- Verify that rider profile images are uploaded to Cloudinary and that the resulting secure image URL is correctly saved in the database.
- Add a clear image-selection and upload-progress indicator.
- Display helpful status messages such as Selecting image, Uploading, Upload successful, and Upload failed.
- Add a Crop Image button and preview so the rider can crop and confirm the image before uploading.
- Add a Save/Continue button that works only after the required image upload succeeds.
- Handle cancellation, network failures, retries, oversized images, and invalid formats.
- Restrict these UI changes to rider registration/profile images; do not unintentionally change customer image handling.
- Ensure the registration flow works end to end with the real backend.

**5. Premium Admin Panel Website**
- Create a polished, responsive, professional admin dashboard.
- Improve admin login and OTP verification with six separate OTP boxes, paste support, keyboard navigation, resend countdown, and clear error/loading states.
- Implement and verify all existing required admin features, including restaurant/menu management, customer and rider management, rider approval, orders, delivery tracking, notifications, and relevant reports.
- Use real database records and functional backend APIs. Do not add decorative buttons that do nothing.
- Keep admin access protected by server-side authentication and role-based authorization.

**6. Security Audit**
- Hash passwords using bcrypt or the project's appropriate secure password-hashing implementation.
- Never store plaintext passwords or expose secrets in frontend code, logs, GitHub, or API responses.
- Secure JWT/session handling, OTP expiry and rate limits, authorization checks, input validation, file uploads, database access, and API endpoints.
- Verify Supabase Row Level Security (RLS) policies and ensure users can access only permitted records.
- Store credentials in environment variables and rotate any secrets found exposed.
- Prevent customers and riders from changing their roles, approving themselves, modifying unauthorized orders, or manipulating wallet balances.
- Protect payment verification, wallet transactions, and rider payouts against duplicate requests and unauthorized changes.
- Never disable authentication, OTP, or security checks merely to make tests pass.

**7. Complete Automated and Manual Testing**
- Use the appropriate testing tools for the existing project. Consider Maestro for mobile end-to-end tests, plus the project's existing unit, integration, API, and web UI testing tools.
- Test registration, login, OTP, rider image cropping/upload, rider approval, restaurant browsing, cart, checkout, order creation, rider order requests, FCM notifications, order status changes, payments, wallet operations, and admin permissions.
- Test loading states, network failures, expired OTPs, invalid inputs, duplicate submissions, and unauthorized requests.
- Run type checks, linting, production builds, security checks, database checks, and relevant automated tests.
- Test Android behavior on an emulator and, where available, a physical device.
- Fix discovered issues and rerun the affected tests. Do not report unexecuted tests as passed.

**8. Play Store and Production Readiness**
- Check Android permissions, app signing configuration, release build, package ID, versioning, privacy policy requirements, notification permission behavior, and Google Play policy-sensitive features.
- Verify that production builds use production configuration without development accounts, test data, debug secrets, or mock services.
- Check that the admin website is deployed securely and is not accidentally embedded as an unrestricted admin interface in the customer app.
- Do not publish or deploy changes without my explicit approval.

**Working Rules**
- First inspect the project and create a prioritized implementation plan.
- Back up or commit the current working state before risky changes.
- Implement fixes in manageable stages and preserve existing functionality.
- Use real integrations and real data wherever appropriate.
- Never claim something is fixed, secure, functional, or tested without evidence.
- At the end, provide a concise report of changes, test results, remaining blockers, required environment variables, and exact steps needed before release.

**Final goal:** A secure, fully functional, thoroughly tested Swat City Food Delivery app with reliable rider/customer notifications, verified Cloudinary image uploads, a premium admin website, and a production-ready Android release.  or new_update_prompt.md read and use this skills



Act as a senior full-stack engineer, mobile app developer, security engineer, QA automation engineer, and UI/UX designer.

My project is Swat City Food Delivery, built with React Native Expo, a backend API, Supabase, Cloudinary, and Firebase Cloud Messaging (FCM).

Your mission is to audit, fix, test, and prepare the existing project for production release.

1. Inspect the complete codebase, architecture, database schema, environment configuration, and Git status before making changes.
2. Fix customer and rider registration, login, OTP verification, and authentication issues using the existing backend APIs.
3. Verify rider profile image selection, cropping, upload progress, Cloudinary upload, image URL persistence, error handling, and save/continue functionality.
4. Verify FCM token registration and real notifications for eligible riders, customers, and admins throughout the order lifecycle. Test foreground, background, and notification tap behavior.
5. Test restaurant browsing, menus, cart, checkout, order creation, rider acceptance, delivery status, cancellations, and order history.
6. Audit the admin website. Improve its visual design, responsive layout, OTP input experience, and dashboard usability. Ensure all controls use real APIs and work correctly.
7. Audit password hashing, OTP expiry and rate limiting, JWT/session handling, authorization, Supabase RLS, file uploads, API validation, payment verification, and wallet security.
8. Create clearly identified test accounts and sample restaurants, food items, and orders using a safe, repeatable development-only seed process. Never contaminate production data.
9. Use suitable automated testing tools, including Maestro for mobile end-to-end tests where appropriate. Run available type checks, linting, builds, API tests, and security checks.
10. Fix verified defects, rerun relevant tests, and report exact results. Never claim a test passed unless it was actually executed.
11. Preserve existing working features. Never expose secrets, bypass authentication, replace real APIs with mock responses, or change production data without authorization.
12. Check Android release configuration and Google Play readiness. Do not publish, deploy, delete data, or perform irreversible actions without my explicit approval.

Work in small, reviewable stages. Start with an audit and prioritized plan, then implement fixes and test them. Finish with a report of completed changes, passed and failed tests, remaining blockers, and required manual steps.

Important: Do not rewrite the entire project unnecessarily. Follow the existing architecture and make the smallest safe changes needed for a reliable production release.

eslint par clean code hona chhie 