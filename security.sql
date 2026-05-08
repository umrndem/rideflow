-- RideFlow Security / DCL Script (MySQL 8.x)
-- Run after schema.sql and logic.sql

USE rideflow_db;

-- Optional cleanup so reruns are deterministic.
DROP USER IF EXISTS 'rideflow_admin'@'localhost';
DROP USER IF EXISTS 'rideflow_rider'@'localhost';
DROP USER IF EXISTS 'rideflow_driver'@'localhost';
DROP USER IF EXISTS 'rideflow_support'@'localhost';

DROP ROLE IF EXISTS 'rideflow_admin_role';
DROP ROLE IF EXISTS 'rideflow_rider_role';
DROP ROLE IF EXISTS 'rideflow_driver_role';
DROP ROLE IF EXISTS 'rideflow_support_role';

-- Create roles.
CREATE ROLE 'rideflow_admin_role';
CREATE ROLE 'rideflow_rider_role';
CREATE ROLE 'rideflow_driver_role';
CREATE ROLE 'rideflow_support_role';

-- Admin role: full DB control for system operations.
GRANT ALL PRIVILEGES ON rideflow_db.* TO 'rideflow_admin_role';

-- Rider role: request rides, make payments, leave ratings, and file complaints.
GRANT SELECT, UPDATE ON rideflow_db.users TO 'rideflow_rider_role';
GRANT SELECT, UPDATE ON rideflow_db.user_wallets TO 'rideflow_rider_role';
GRANT SELECT, INSERT ON rideflow_db.wallet_transactions TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.drivers TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.vehicles TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.locations TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.location_distances TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.fare_rules TO 'rideflow_rider_role';
GRANT SELECT, INSERT ON rideflow_db.rides TO 'rideflow_rider_role';
GRANT SELECT, INSERT ON rideflow_db.payments TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.promocodes TO 'rideflow_rider_role';
GRANT SELECT, INSERT ON rideflow_db.ratings TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.driver_review_flags TO 'rideflow_rider_role';
GRANT SELECT, INSERT ON rideflow_db.complaints TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.ride_history TO 'rideflow_rider_role';
GRANT EXECUTE ON PROCEDURE rideflow_db.sp_calculate_fare TO 'rideflow_rider_role';
GRANT EXECUTE ON PROCEDURE rideflow_db.sp_request_ride TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.ActiveRidesView TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.TopDriversView TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.vw_driver_leaderboard_city TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.vw_revenue_by_city_day TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.vw_revenue_by_payment_method TO 'rideflow_rider_role';
GRANT SELECT ON rideflow_db.vw_refund_dispute_totals TO 'rideflow_rider_role';

-- Driver role: manage availability/vehicles, handle assigned rides, and view earnings context.
GRANT SELECT, UPDATE ON rideflow_db.users TO 'rideflow_driver_role';
GRANT SELECT, UPDATE ON rideflow_db.drivers TO 'rideflow_driver_role';
GRANT SELECT, INSERT, UPDATE ON rideflow_db.vehicles TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.locations TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.location_distances TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.fare_rules TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.rides TO 'rideflow_driver_role';
GRANT UPDATE (ride_status, driver_id, vehicle_id) ON rideflow_db.rides TO 'rideflow_driver_role';
GRANT SELECT, INSERT, UPDATE ON rideflow_db.ride_driver_rejections TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.payments TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.wallet_transactions TO 'rideflow_driver_role';
GRANT SELECT, INSERT ON rideflow_db.ratings TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.complaints TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.ride_history TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.ActiveRidesView TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.TopDriversView TO 'rideflow_driver_role';
GRANT SELECT ON rideflow_db.vw_driver_leaderboard_city TO 'rideflow_driver_role';

-- Support role: read and resolve support cases, but never delete operational records.
GRANT SELECT ON rideflow_db.* TO 'rideflow_support_role';
GRANT UPDATE ON rideflow_db.complaints TO 'rideflow_support_role';
GRANT DELETE ON rideflow_db.complaints TO 'rideflow_support_role';
REVOKE DELETE ON rideflow_db.complaints FROM 'rideflow_support_role';

-- Create sample local users.
CREATE USER 'rideflow_admin'@'localhost' IDENTIFIED BY 'RideflowAdmin@123';
CREATE USER 'rideflow_rider'@'localhost' IDENTIFIED BY 'RideflowRider@123';
CREATE USER 'rideflow_driver'@'localhost' IDENTIFIED BY 'RideflowDriver@123';
CREATE USER 'rideflow_support'@'localhost' IDENTIFIED BY 'RideflowSupport@123';

-- Assign roles.
GRANT 'rideflow_admin_role' TO 'rideflow_admin'@'localhost';
GRANT 'rideflow_rider_role' TO 'rideflow_rider'@'localhost';
GRANT 'rideflow_driver_role' TO 'rideflow_driver'@'localhost';
GRANT 'rideflow_support_role' TO 'rideflow_support'@'localhost';

-- Make roles active by default at login.
SET DEFAULT ROLE 'rideflow_admin_role' TO 'rideflow_admin'@'localhost';
SET DEFAULT ROLE 'rideflow_rider_role' TO 'rideflow_rider'@'localhost';
SET DEFAULT ROLE 'rideflow_driver_role' TO 'rideflow_driver'@'localhost';
SET DEFAULT ROLE 'rideflow_support_role' TO 'rideflow_support'@'localhost';

FLUSH PRIVILEGES;
