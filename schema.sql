-- 24I-2513 Muhammad Umar Nadeem, 24I-2603 Muhammad Rafay Mir Khattak
-- RideFlow MySQL Schema


CREATE DATABASE IF NOT EXISTS rideflow_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rideflow_db;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS ride_history;
DROP TABLE IF EXISTS admin_notifications;
DROP TABLE IF EXISTS driver_payout_requests;
DROP TABLE IF EXISTS rider_warnings;
DROP TABLE IF EXISTS driver_review_flags;
DROP TABLE IF EXISTS complaints;
DROP TABLE IF EXISTS ratings;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS ride_driver_rejections;
DROP TABLE IF EXISTS rides;
DROP TABLE IF EXISTS vehicles;
DROP TABLE IF EXISTS drivers;
DROP TABLE IF EXISTS promocodes;
DROP TABLE IF EXISTS fare_rules;
DROP TABLE IF EXISTS location_distances;
DROP TABLE IF EXISTS locations;
DROP TABLE IF EXISTS wallet_transactions;
DROP TABLE IF EXISTS user_wallets;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  user_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'super_admin', 'rider', 'driver') NOT NULL,
  account_status ENUM('active', 'suspended', 'banned') NOT NULL DEFAULT 'active',
  registration_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone)
) ENGINE=InnoDB;

CREATE TABLE user_wallets (
  wallet_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  balance DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_user_wallets_user_id (user_id),
  CONSTRAINT fk_user_wallets_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_user_wallets_balance CHECK (balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE wallet_transactions (
  wallet_transaction_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  wallet_id BIGINT UNSIGNED NOT NULL,
  ride_id BIGINT UNSIGNED NULL,
  transaction_type ENUM('top_up', 'ride_payment', 'refund', 'adjustment', 'driver_earning', 'payout') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  balance_after DECIMAL(10,2) NOT NULL,
  description VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wallet_transactions_wallet_id (wallet_id),
  INDEX idx_wallet_transactions_ride_id (ride_id),
  INDEX idx_wallet_transactions_type (transaction_type),
  CONSTRAINT fk_wallet_transactions_wallet
    FOREIGN KEY (wallet_id) REFERENCES user_wallets(wallet_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_wallet_transactions_amount CHECK (amount >= 0),
  CONSTRAINT chk_wallet_transactions_balance CHECK (balance_after >= 0)
) ENGINE=InnoDB;

CREATE TABLE locations (
  location_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  INDEX idx_locations_city (city),
  INDEX idx_locations_lat_lng (latitude, longitude)
) ENGINE=InnoDB;

CREATE TABLE location_distances (
  distance_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  pickup_location_id BIGINT UNSIGNED NOT NULL,
  dropoff_location_id BIGINT UNSIGNED NOT NULL,
  distance_km DECIMAL(8,2) NOT NULL,
  duration_min DECIMAL(8,2) NOT NULL,
  UNIQUE KEY uq_location_distances_route (pickup_location_id, dropoff_location_id),
  INDEX idx_location_distances_city (city),
  INDEX idx_location_distances_pickup (pickup_location_id),
  INDEX idx_location_distances_dropoff (dropoff_location_id),
  CONSTRAINT fk_location_distances_pickup
    FOREIGN KEY (pickup_location_id) REFERENCES locations(location_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_location_distances_dropoff
    FOREIGN KEY (dropoff_location_id) REFERENCES locations(location_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT chk_location_distances_positive CHECK (
    distance_km > 0 AND
    duration_min > 0
  )
) ENGINE=InnoDB;

CREATE TABLE fare_rules (
  fare_rule_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  city VARCHAR(100) NOT NULL,
  vehicle_type ENUM('economy', 'premium', 'bike') NOT NULL,
  base_rate DECIMAL(10,2) NOT NULL,
  per_km_rate DECIMAL(10,2) NOT NULL,
  per_min_rate DECIMAL(10,2) NOT NULL,
  surge_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.2000,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fare_rules_city_vehicle_active (city, vehicle_type, is_active),
  INDEX idx_fare_rules_city (city),
  CONSTRAINT chk_fare_rules_rates CHECK (
    base_rate >= 0 AND
    per_km_rate >= 0 AND
    per_min_rate >= 0 AND
    surge_multiplier >= 1 AND
    commission_rate >= 0 AND
    commission_rate <= 1
  )
) ENGINE=InnoDB;

CREATE TABLE promocodes (
  promo_code_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL,
  discount_type ENUM('percent', 'fixed') NOT NULL,
  discount_value DECIMAL(10,2) NOT NULL,
  min_fare DECIMAL(10,2) NOT NULL DEFAULT 0,
  usage_limit INT UNSIGNED NULL,
  usage_count INT UNSIGNED NOT NULL DEFAULT 0,
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE KEY uq_promocodes_code (code),
  CONSTRAINT chk_promocodes_value_non_negative CHECK (discount_value >= 0),
  CONSTRAINT chk_promocodes_usage_count CHECK (usage_count >= 0),
  CONSTRAINT chk_promocodes_date_range CHECK (end_date > start_date)
) ENGINE=InnoDB;

CREATE TABLE drivers (
  driver_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  license_number VARCHAR(60) NOT NULL,
  national_id VARCHAR(30) NOT NULL,
  profile_photo VARCHAR(255) NULL,
  current_city VARCHAR(100) NOT NULL,
  current_location_id BIGINT UNSIGNED NULL,
  location_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  verification_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  availability_status ENUM('online', 'offline', 'on_trip') NOT NULL DEFAULT 'offline',
  total_trips_completed INT UNSIGNED NOT NULL DEFAULT 0,
  average_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  UNIQUE KEY uq_drivers_user_id (user_id),
  UNIQUE KEY uq_drivers_license_number (license_number),
  UNIQUE KEY uq_drivers_national_id (national_id),
  INDEX idx_drivers_current_city (current_city),
  INDEX idx_drivers_current_location_id (current_location_id),
  INDEX idx_drivers_availability_status (availability_status),
  INDEX idx_drivers_verification_status (verification_status),
  CONSTRAINT fk_drivers_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_drivers_current_location
    FOREIGN KEY (current_location_id) REFERENCES locations(location_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_drivers_average_rating CHECK (average_rating >= 0 AND average_rating <= 5)
) ENGINE=InnoDB;

CREATE TABLE driver_payout_requests (
  payout_request_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'paid', 'rejected') NOT NULL DEFAULT 'pending',
  notes VARCHAR(255) NULL,
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  processed_by_user_id BIGINT UNSIGNED NULL,
  INDEX idx_driver_payout_requests_driver (driver_id),
  INDEX idx_driver_payout_requests_status (status),
  INDEX idx_driver_payout_requests_requested_at (requested_at),
  CONSTRAINT fk_driver_payout_requests_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_driver_payout_requests_processed_by
    FOREIGN KEY (processed_by_user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_driver_payout_requests_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE vehicles (
  vehicle_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id BIGINT UNSIGNED NOT NULL,
  make VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  color VARCHAR(40) NOT NULL,
  license_plate VARCHAR(25) NOT NULL,
  vehicle_type ENUM('economy', 'premium', 'bike') NOT NULL,
  verification_status ENUM('pending', 'verified', 'rejected') NOT NULL DEFAULT 'pending',
  UNIQUE KEY uq_vehicles_license_plate (license_plate),
  INDEX idx_vehicles_driver_id (driver_id),
  INDEX idx_vehicles_verification_status (verification_status),
  CONSTRAINT fk_vehicles_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_vehicles_year CHECK (year >= 1980 AND year <= 2100)
) ENGINE=InnoDB;

CREATE TABLE rides (
  ride_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rider_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NULL,
  vehicle_id BIGINT UNSIGNED NULL,
  pickup_location_id BIGINT UNSIGNED NOT NULL,
  dropoff_location_id BIGINT UNSIGNED NOT NULL,
  ride_status ENUM(
    'requested',
    'accepted',
    'driver_en_route',
    'in_progress',
    'completed',
    'cancelled'
  ) NOT NULL DEFAULT 'requested',
  requested_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scheduled_for DATETIME NULL,
  distance_km DECIMAL(8,2) NULL,
  duration_min DECIMAL(8,2) NULL,
  fare DECIMAL(10,2) NULL,
  final_fare DECIMAL(10,2) NULL,
  promo_code_id BIGINT UNSIGNED NULL,
  payment_method ENUM('cash', 'wallet', 'card') NOT NULL DEFAULT 'cash',
  INDEX idx_rides_rider_id (rider_id),
  INDEX idx_rides_driver_id (driver_id),
  INDEX idx_rides_vehicle_id (vehicle_id),
  INDEX idx_rides_status (ride_status),
  INDEX idx_rides_requested_at (requested_at),
  INDEX idx_rides_scheduled_for (scheduled_for),
  CONSTRAINT fk_rides_rider
    FOREIGN KEY (rider_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_rides_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_rides_vehicle
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(vehicle_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_rides_pickup_location
    FOREIGN KEY (pickup_location_id) REFERENCES locations(location_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_rides_dropoff_location
    FOREIGN KEY (dropoff_location_id) REFERENCES locations(location_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_rides_promo
    FOREIGN KEY (promo_code_id) REFERENCES promocodes(promo_code_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_rides_positive_distance CHECK (distance_km IS NULL OR distance_km >= 0),
  CONSTRAINT chk_rides_positive_duration CHECK (duration_min IS NULL OR duration_min >= 0),
  CONSTRAINT chk_rides_positive_fare CHECK (
    (fare IS NULL OR fare >= 0) AND
    (final_fare IS NULL OR final_fare >= 0)
  )
) ENGINE=InnoDB;

CREATE TABLE ride_driver_rejections (
  rejection_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NOT NULL,
  rejected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_ride_driver_rejections (ride_id, driver_id),
  INDEX idx_ride_driver_rejections_ride (ride_id),
  INDEX idx_ride_driver_rejections_driver (driver_id),
  CONSTRAINT fk_ride_driver_rejections_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_ride_driver_rejections_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE payments (
  payment_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  rider_id BIGINT UNSIGNED NOT NULL,
  promo_code_id BIGINT UNSIGNED NULL,
  amount DECIMAL(10,2) NOT NULL,
  discount_applied DECIMAL(10,2) NOT NULL DEFAULT 0,
  driver_net_earning DECIMAL(10,2) NULL,
  payment_method ENUM('cash', 'wallet', 'card') NOT NULL,
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  transaction_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_payments_ride_id (ride_id),
  INDEX idx_payments_rider_id (rider_id),
  INDEX idx_payments_status (payment_status),
  INDEX idx_payments_method (payment_method),
  INDEX idx_payments_txn_date (transaction_date),
  CONSTRAINT fk_payments_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_payments_rider
    FOREIGN KEY (rider_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_payments_promo
    FOREIGN KEY (promo_code_id) REFERENCES promocodes(promo_code_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_payments_non_negative CHECK (
    amount >= 0 AND
    discount_applied >= 0 AND
    (driver_net_earning IS NULL OR driver_net_earning >= 0)
  )
) ENGINE=InnoDB;

CREATE TABLE ratings (
  rating_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  rated_by_user_id BIGINT UNSIGNED NOT NULL,
  rated_user_id BIGINT UNSIGNED NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  comment VARCHAR(500) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ratings_ride_id (ride_id),
  INDEX idx_ratings_rated_by (rated_by_user_id),
  INDEX idx_ratings_rated_user (rated_user_id),
  INDEX idx_ratings_score (score),
  UNIQUE KEY uq_ratings_per_pair_per_ride (ride_id, rated_by_user_id, rated_user_id),
  CONSTRAINT fk_ratings_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_ratings_rated_by
    FOREIGN KEY (rated_by_user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_ratings_rated_user
    FOREIGN KEY (rated_user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_ratings_score CHECK (score BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE complaints (
  complaint_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  complainant_user_id BIGINT UNSIGNED NOT NULL,
  respondent_user_id BIGINT UNSIGNED NOT NULL,
  complaint_text TEXT NOT NULL,
  complaint_status ENUM('open', 'under_review', 'resolved', 'rejected') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_complaints_ride_id (ride_id),
  INDEX idx_complaints_complainant (complainant_user_id),
  INDEX idx_complaints_respondent (respondent_user_id),
  INDEX idx_complaints_status (complaint_status),
  CONSTRAINT fk_complaints_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_complainant
    FOREIGN KEY (complainant_user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_complaints_respondent
    FOREIGN KEY (respondent_user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE ride_history (
  history_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ride_id BIGINT UNSIGNED NOT NULL,
  rider_id BIGINT UNSIGNED NOT NULL,
  driver_id BIGINT UNSIGNED NULL,
  final_status ENUM('completed', 'cancelled') NOT NULL,
  completed_or_cancelled_at DATETIME NOT NULL,
  archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ride_history_ride_id (ride_id),
  INDEX idx_ride_history_rider_id (rider_id),
  INDEX idx_ride_history_driver_id (driver_id),
  CONSTRAINT fk_ride_history_ride
    FOREIGN KEY (ride_id) REFERENCES rides(ride_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_ride_history_rider
    FOREIGN KEY (rider_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_ride_history_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;
