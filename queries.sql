-- RideFlow Rubric Queries and Reports
-- Run after schema.sql, logic.sql, bootstrap.sql, and after creating your own application data.

USE rideflow_db;

-- 1. Basic SQL Queries
SET @rider_id = 0; -- Replace with a real rider_id after creating your own test data.

SELECT
  r.ride_id,
  rider.full_name AS rider_name,
  driver_user.full_name AS driver_name,
  pickup.address AS pickup_location,
  dropoff.address AS dropoff_location,
  r.final_fare,
  r.requested_at
FROM rides r
JOIN users rider
  ON rider.user_id = r.rider_id
JOIN drivers d
  ON d.driver_id = r.driver_id
JOIN users driver_user
  ON driver_user.user_id = d.user_id
JOIN locations pickup
  ON pickup.location_id = r.pickup_location_id
JOIN locations dropoff
  ON dropoff.location_id = r.dropoff_location_id
WHERE r.rider_id = @rider_id
  AND r.ride_status = 'completed'
ORDER BY r.requested_at DESC;

SET @city = 'Lahore';

SELECT
  d.driver_id,
  u.full_name AS driver_name,
  d.current_city AS city,
  d.average_rating,
  d.availability_status,
  d.total_trips_completed
FROM drivers d
JOIN users u
  ON u.user_id = d.user_id
WHERE d.current_city = @city
  AND d.verification_status = 'verified'
ORDER BY d.average_rating DESC, d.total_trips_completed DESC, u.full_name ASC;

-- 2. Aggregate Functions and HAVING Clause
SELECT
  pickup.city,
  ROUND(SUM(p.amount), 2) AS total_revenue
FROM payments p
JOIN rides r
  ON r.ride_id = p.ride_id
JOIN locations pickup
  ON pickup.location_id = r.pickup_location_id
WHERE p.payment_status = 'paid'
GROUP BY pickup.city
ORDER BY total_revenue DESC;

SELECT
  d.driver_id,
  u.full_name AS driver_name,
  ROUND(AVG(rt.score), 2) AS average_driver_rating,
  COUNT(rt.rating_id) AS rating_count
FROM drivers d
JOIN users u
  ON u.user_id = d.user_id
JOIN ratings rt
  ON rt.rated_user_id = u.user_id
GROUP BY d.driver_id, u.full_name
HAVING AVG(rt.score) < 3.5
ORDER BY average_driver_rating ASC;

SELECT
  d.driver_id,
  u.full_name AS driver_name,
  COUNT(r.ride_id) AS completed_trip_count
FROM drivers d
JOIN users u
  ON u.user_id = d.user_id
LEFT JOIN rides r
  ON r.driver_id = d.driver_id
 AND r.ride_status = 'completed'
GROUP BY d.driver_id, u.full_name
ORDER BY completed_trip_count DESC, u.full_name ASC;

-- 3. Joins for Reports
SELECT
  r.ride_id,
  rider.full_name AS rider_name,
  driver_user.full_name AS driver_name,
  CONCAT(v.make, ' ', v.model) AS vehicle,
  v.license_plate,
  pickup.city AS pickup_city,
  dropoff.city AS dropoff_city,
  r.ride_status,
  r.distance_km,
  r.duration_min,
  r.final_fare,
  r.requested_at
FROM rides r
INNER JOIN users rider
  ON rider.user_id = r.rider_id
INNER JOIN drivers d
  ON d.driver_id = r.driver_id
INNER JOIN users driver_user
  ON driver_user.user_id = d.user_id
INNER JOIN vehicles v
  ON v.vehicle_id = r.vehicle_id
INNER JOIN locations pickup
  ON pickup.location_id = r.pickup_location_id
INNER JOIN locations dropoff
  ON dropoff.location_id = r.dropoff_location_id
ORDER BY r.requested_at DESC;

SELECT
  rider.user_id AS rider_id,
  rider.full_name AS rider_name,
  COUNT(r.ride_id) AS completed_rides,
  ROUND(IFNULL(SUM(r.final_fare), 0), 2) AS total_completed_fare,
  MAX(r.requested_at) AS latest_completed_ride
FROM users rider
LEFT JOIN rides r
  ON r.rider_id = rider.user_id
 AND r.ride_status = 'completed'
WHERE rider.role = 'rider'
GROUP BY rider.user_id, rider.full_name
ORDER BY completed_rides DESC, rider.full_name ASC;

SELECT
  r.ride_id,
  rider.full_name AS rider_name,
  p.payment_method,
  p.payment_status,
  p.amount,
  IFNULL(pc.code, 'No promo') AS promo_code,
  IFNULL(pc.discount_type, 'none') AS discount_type,
  p.discount_applied,
  IFNULL(pc.usage_count, 0) AS promo_usage_count
FROM rides r
JOIN users rider
  ON rider.user_id = r.rider_id
JOIN payments p
  ON p.ride_id = r.ride_id
LEFT JOIN promocodes pc
  ON pc.promo_code_id = p.promo_code_id
ORDER BY r.ride_id ASC;

-- 4. Views, Indexes, and Stored Procedure Checks
SELECT * FROM ActiveRidesView ORDER BY requested_at DESC;
SELECT * FROM TopDriversView ORDER BY average_rating DESC, total_ratings DESC;

CALL sp_calculate_fare(
  12.50,
  30.00,
  1.50,
  120.00,
  45.00,
  8.00,
  NULL,
  NOW(),
  @base_fare,
  @surge_multiplier,
  @discount_amount,
  @final_fare
);

SELECT
  @base_fare AS base_fare,
  @surge_multiplier AS surge_multiplier,
  @discount_amount AS discount_amount,
  @final_fare AS final_fare;

-- Financial report views
SELECT * FROM vw_revenue_by_city_day ORDER BY revenue_date DESC, city ASC;
SELECT * FROM vw_revenue_by_payment_method ORDER BY gross_revenue DESC;
SELECT * FROM vw_refund_dispute_totals;
