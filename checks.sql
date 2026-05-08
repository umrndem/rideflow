-- RideFlow Trigger, Event, View, and Index Verification
-- Run after schema.sql, logic.sql, bootstrap.sql, and optionally security.sql.

USE rideflow_db;

-- Trigger: paid payments automatically completed rides and archived them.
SELECT
  r.ride_id,
  r.ride_status,
  p.payment_status,
  rh.final_status,
  rh.archived_at
FROM rides r
JOIN payments p
  ON p.ride_id = r.ride_id
LEFT JOIN ride_history rh
  ON rh.ride_id = r.ride_id
ORDER BY r.ride_id;

-- Trigger: promo usage count increments when a promo is applied to a payment.
SELECT
  code,
  usage_limit,
  usage_count,
  is_active
FROM promocodes
ORDER BY code;

-- Trigger: low driver ratings create review flags and admin notifications.
SELECT
  f.flag_id,
  u.full_name AS driver_name,
  f.current_average_rating,
  f.reason,
  f.is_resolved,
  n.message AS admin_notification
FROM driver_review_flags f
JOIN drivers d
  ON d.driver_id = f.driver_id
JOIN users u
  ON u.user_id = d.user_id
LEFT JOIN admin_notifications n
  ON n.driver_id = f.driver_id
 AND n.notification_type = 'driver_rating_alert'
ORDER BY f.created_at DESC;

-- Event Scheduler object: expires promo codes past end_date nightly.
SELECT
  event_name,
  status,
  interval_value,
  interval_field,
  starts
FROM information_schema.events
WHERE event_schema = 'rideflow_db'
  AND event_name = 'ev_expire_promocodes_midnight';

-- Required indexes.
SHOW INDEX FROM rides WHERE Key_name IN ('idx_rides_rider_id', 'idx_rides_driver_id', 'idx_rides_status');
SHOW INDEX FROM locations WHERE Key_name = 'idx_locations_city';
SHOW INDEX FROM location_distances WHERE Key_name IN ('idx_location_distances_city', 'uq_location_distances_route');
SHOW INDEX FROM drivers WHERE Key_name = 'idx_drivers_current_city';
