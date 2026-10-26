# Database Schema (template)

| Table       | Key fields                                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------------------------------- |
| users       | id, name, phone, role, password_hash, created_at                                                                      |
| addresses   | id, user_id, label, area, street, lat, lng                                                                            |
| restaurants | id, name, owner_id, area, is_open, rating                                                                             |
| menu_items  | id, restaurant_id, name, price, category, available                                                                   |
| orders      | id, customer_id, restaurant_id, rider_id, status, subtotal, delivery_fee, discount, total, payment_method, created_at |
| order_items | id, order_id, menu_item_id, qty, unit_price                                                                           |
| payments    | id, order_id, method, provider_txn_id, amount, status, created_at                                                     |
| coupons     | id, code, type, value, expires_at, usage_limit                                                                        |
| reviews     | id, order_id, rating, comment                                                                                         |

## Rules

- Money stored as integer PKR (or DECIMAL), never float.
- Snapshot item price into `order_items` at order time.
- Index: orders(customer_id, status), orders(restaurant_id, status), payments(provider_txn_id UNIQUE).
- Use migrations; never edit schema manually in production.
