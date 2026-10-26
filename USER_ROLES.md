# User Roles & Permissions

| Action              |  Customer   |      Restaurant       |     Rider      |      Admin      |
| ------------------- | :---------: | :-------------------: | :------------: | :-------------: |
| Place order         |     Yes     |          No           |       No       | Yes (on behalf) |
| View own orders     |     Yes     |    Own restaurant     |    Assigned    |       All       |
| Update order status | Cancel only | Confirm/Prepare/Ready | Pickup/Deliver |       All       |
| Edit menu           |     No      |          Own          |       No       |       All       |
| Issue refund        |     No      |          No           |       No       |       Yes       |
| Manage users        |     No      |          No           |       No       |       Yes       |

## Rules

- Enforce roles on the server for every endpoint.
- Check ownership (resource belongs to the user), not only the role.
- Admin actions are written to an audit log.

## Restaurant owner (`restaurant` role)

- Self-registers with `POST /auth/register/restaurant`: the account and the
  restaurant record are created together, the account verifies by email code
  and the restaurant starts **unapproved** (hidden from customers).
- Signs in on the web panel (`admin-web`). The panel routes `restaurant` accounts
  to the owner portal (`/portal/*`) — orders, menu and profile only; all admin
  pages are unreachable by role from the router, and every portal endpoint is
  additionally scoped to the owner's own restaurant on the server.
- May advance an order to `confirmed`, `preparing` or `ready`; may reject or
  cancel an order (with a reason) only while it is pending/confirmed/preparing.
- May edit their own profile fields, dishes, prices, availability and photos.
  Platform decisions — `featured`, rating, `isApproved`, linking the owner —
  stay admin-only.

## Mobile app split

The mobile APK carries **customer and rider only**. Admin screens are not
shipped in the app; restaurant owners use the web portal.
