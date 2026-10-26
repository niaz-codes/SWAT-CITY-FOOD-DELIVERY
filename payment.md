Act as a senior payment integration engineer. Update my Swat City Food Delivery app to use **Easypaisa as the only payment method**.

Requirements:
1. **Customer Payments:** Customers pay for food orders using Easypaisa. All verified payments must be credited to my configured Easypaisa merchant account.
2. **Rider Payments:** Riders can request their earnings withdrawals from the app. The admin can review, approve, or reject withdrawal requests and process approved payments through Easypaisa.
3. **Admin Web Panel:** Manage Easypaisa payments, customer orders, rider earnings, withdrawal requests, payment status, and transaction history from the existing web-based admin panel.
4. **Secure Verification:** Verify every payment on the backend using the official Easypaisa payment gateway or merchant API. Never mark an order as paid based only on the frontend callback.
5. **No Fake Payments:** Remove JazzCash, Cash on Delivery, and all other payment methods. Do not use mock payments or fake transaction confirmations.
6. **Security:** Never expose Easypaisa credentials in the APK or frontend. Store credentials in backend environment variables and verify transactions server-side.
7. **Payment Flow:** Customers pay my merchant account. Riders request withdrawals, and the admin processes approved withdrawals through Easypaisa. Do not allow direct customer-to-customer or rider-to-customer money transfers.
8. **Testing:** Test successful payments, failed payments, duplicate callbacks, withdrawal requests, and payment verification before deployment.

**Important:** Inspect my existing codebase first. Reuse my current Supabase database and existing web admin panel. Implement only payment flows supported by my Easypaisa merchant account and its official API. If merchant API access or credentials are missing, identify what is required instead of simulating successful payments. 
and 

Act as a senior payment integration engineer. Update my Swat City Food Delivery app to use **Easypaisa as the only payment method**.

Requirements:
1. **Customer Payments:** Customers pay for food orders using Easypaisa. All verified payments must be credited to my configured Easypaisa merchant account.
2. **Rider Payments:** Riders can request their earnings withdrawals from the app. The admin can review, approve, or reject withdrawal requests and process approved payments through Easypaisa.
3. **Admin Web Panel:** Manage Easypaisa payments, customer orders, rider earnings, withdrawal requests, payment status, and transaction history from the existing web-based admin panel.
4. **Secure Verification:** Verify every payment on the backend using the official Easypaisa payment gateway or merchant API. Never mark an order as paid based only on the frontend callback.
5. **No Fake Payments:** Remove JazzCash, Cash on Delivery, and all other payment methods. Do not use mock payments or fake transaction confirmations.
6. **Security:** Never expose Easypaisa credentials in the APK or frontend. Store credentials in backend environment variables and verify transactions server-side.
7. **Payment Flow:** Customers pay my merchant account. Riders request withdrawals, and the admin processes approved withdrawals through Easypaisa. Do not allow direct customer-to-customer or rider-to-customer money transfers.
8. **Testing:** Test successful payments, failed payments, duplicate callbacks, withdrawal requests, and payment verification before deployment.

**Important:** Inspect my existing codebase first. Reuse my current Supabase database and existing web admin panel. Implement only payment flows supported by my Easypaisa merchant account and its official API. If merchant API access or credentials are missing, identify what is required instead of simulating successful payments.