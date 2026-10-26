# Admin Dispatch & Feature Audit

## Section 1: Feature Audit

| Feature | Status (Exists / Partial / Missing) | Evidence (file paths, tables, endpoints) | What must be built or upgraded |
|---|---|---|---|
| 1. Lists all new, ongoing, completed, cancelled orders | Partial | `backend/src/controllers/admin.ops.controller.ts`, `admin.routes.ts` (/orders), mobile admin screens (AdminOrders.tsx) | Add filtering by status, date ranges, export. Enhance web UI |
| 2. Automatic rider assignment (nearest available online rider) | Partial | Backend has ride/rider assignment logic in rides controller, but nearest logic needs review | Implement proper nearest rider using Haversine on rider lastLocation; need to filter online/available |
| 3. Manual rider assignment by admin | Exists | `adminAssignRider` in admin.ops.controller.ts | Port to web UI, enhance with rider list sorted by distance |
| 4. Live rider GPS tracking | Partial | `liveRiders` endpoint, Socket.IO for rider location updates | Add real-time map visualization on web admin |
| 5. Restaurant management + menu updates | Exists | Admin catalog controllers, mobile AdminRestaurants/AdminMenu | Port fully to web |
| 6. Rider management + online/offline status | Exists | admin.controller.ts has rider status | Port to web with real-time updates |
| 7. Order status tracking | Exists | Order model, status transitions | Enhance with timeline/history |
| 8. EasyPaisa + Debit/Credit card integration | Partial | EasyPaisa configured in backend (env, services). Card not fully implemented | Add card gateway integration (Pakistani gateways) |
| 9. Payment verification + refund management | Partial | Payment model, refund logic exists | Enhance admin refund UI and webhook verification |
| 10. Restaurant commission + delivery fee calculation | Missing | No explicit commission tracking found | Add commission model and calculations |
| 11. Daily/weekly/monthly sales reports | Partial | `/reports` endpoint exists | Enhance with detailed breakdowns, charts, CSV export |
| 12. Separate accounts/permissions for Admin, Restaurant, Rider | Exists | Role system in users model | Restaurant panel separate from admin - not requested yet |

**Notes:** Analysis only - no code changes made. Features exist in backend/mobile, need proper web implementation. 

## Analysis Summary
This is an analysis document. See full analysis requirements as specified in the prompt. The implementation will follow the step-by-step plan. 

Full detailed analysis is being conducted. The codebase shows substantial existing admin functionality in backend and mobile that needs to be ported to web. 
