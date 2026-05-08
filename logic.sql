-- RideFlow Business Logic (MySQL 8.x)
-- Run after schema.sql

USE rideflow_db;

-- Helper tables for automated flags/warnings.
CREATE TABLE IF NOT EXISTS driver_review_flags (
  flag_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id BIGINT UNSIGNED NOT NULL,
  current_average_rating DECIMAL(3,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_driver_review_flags_driver (driver_id),
  INDEX idx_driver_review_flags_resolved (is_resolved),
  CONSTRAINT fk_driver_review_flags_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rider_warnings (
  warning_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  rider_id BIGINT UNSIGNED NOT NULL,
  current_average_rating DECIMAL(3,2) NOT NULL,
  reason VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rider_warnings_rider (rider_id),
  CONSTRAINT fk_rider_warnings_rider
    FOREIGN KEY (rider_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admin_notifications (
  notification_id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  notification_type ENUM('driver_rating_alert', 'rider_rating_alert', 'payment_alert', 'system_alert') NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  driver_id BIGINT UNSIGNED NULL,
  message VARCHAR(500) NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_notifications_type (notification_type),
  INDEX idx_admin_notifications_read (is_read),
  CONSTRAINT fk_admin_notifications_user
    FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_admin_notifications_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(driver_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

DROP VIEW IF EXISTS ActiveRidesView;
DROP VIEW IF EXISTS TopDriversView;
DROP VIEW IF EXISTS vw_driver_leaderboard_city;
DROP VIEW IF EXISTS vw_revenue_by_city_day;
DROP VIEW IF EXISTS vw_revenue_by_payment_method;
DROP VIEW IF EXISTS vw_refund_dispute_totals;

DROP PROCEDURE IF EXISTS sp_calculate_fare;
DROP PROCEDURE IF EXISTS sp_request_ride;
DROP EVENT IF EXISTS ev_expire_promocodes_midnight;

DROP TRIGGER IF EXISTS trg_rides_bi_validate_assignment;
DROP TRIGGER IF EXISTS trg_rides_bu_validate_assignment;
DROP TRIGGER IF EXISTS trg_rides_au_archive;
DROP TRIGGER IF EXISTS trg_rides_au_driver_trip_count;
DROP TRIGGER IF EXISTS trg_payments_bi_set_driver_net;
DROP TRIGGER IF EXISTS trg_payments_ai_finalize_paid_payment;
DROP TRIGGER IF EXISTS trg_payments_au_finalize_paid_payment;
DROP TRIGGER IF EXISTS trg_ratings_ai_update_scores;

DELIMITER $$

CREATE PROCEDURE sp_calculate_fare (
  IN p_distance_km DECIMAL(8,2),
  IN p_duration_min DECIMAL(8,2),
  IN p_rule_surge_multiplier DECIMAL(5,2),
  IN p_base_rate DECIMAL(10,2),
  IN p_per_km_rate DECIMAL(10,2),
  IN p_per_min_rate DECIMAL(10,2),
  IN p_promo_code VARCHAR(50),
  IN p_reference_time DATETIME,
  OUT p_base_fare DECIMAL(10,2),
  OUT p_surge_multiplier DECIMAL(5,2),
  OUT p_discount_amount DECIMAL(10,2),
  OUT p_final_fare DECIMAL(10,2)
)
BEGIN
  DECLARE v_discount_type VARCHAR(20);
  DECLARE v_discount_value DECIMAL(10,2) DEFAULT 0;
  DECLARE v_min_fare DECIMAL(10,2) DEFAULT 0;
  DECLARE v_is_active BOOLEAN DEFAULT FALSE;
  DECLARE v_now DATETIME;
  DECLARE v_reference_time DATETIME;
  DECLARE v_gross_fare DECIMAL(10,2) DEFAULT 0;
  DECLARE v_peak_multiplier DECIMAL(5,2) DEFAULT 1.00;
  DECLARE v_reference_hour TINYINT UNSIGNED DEFAULT 0;
  DECLARE v_reference_day TINYINT UNSIGNED DEFAULT 0;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_is_active = FALSE;

  SET v_now = NOW();
  SET v_reference_time = COALESCE(p_reference_time, v_now);
  SET v_reference_hour = HOUR(v_reference_time);
  SET v_reference_day = DAYOFWEEK(v_reference_time);

  IF v_reference_hour BETWEEN 7 AND 9
     OR v_reference_hour BETWEEN 17 AND 20 THEN
    SET v_peak_multiplier = 1.25;
  ELSEIF v_reference_day IN (6, 7)
     AND v_reference_hour BETWEEN 20 AND 23 THEN
    SET v_peak_multiplier = 1.15;
  END IF;

  SET p_base_fare = ROUND(
    IFNULL(p_base_rate, 0) +
    (IFNULL(p_per_km_rate, 0) * IFNULL(p_distance_km, 0)) +
    (IFNULL(p_per_min_rate, 0) * IFNULL(p_duration_min, 0)),
    2
  );

  SET p_surge_multiplier = GREATEST(IFNULL(p_rule_surge_multiplier, 1.00), v_peak_multiplier, 1.00);
  SET v_gross_fare = ROUND(p_base_fare * p_surge_multiplier, 2);

  IF p_promo_code IS NOT NULL AND LENGTH(TRIM(p_promo_code)) > 0 THEN
    SELECT discount_type, discount_value, min_fare, is_active
      INTO v_discount_type, v_discount_value, v_min_fare, v_is_active
    FROM promocodes
    WHERE code = TRIM(p_promo_code)
      AND v_now BETWEEN start_date AND end_date
    LIMIT 1;

    IF v_is_active AND v_gross_fare >= IFNULL(v_min_fare, 0) THEN
      IF v_discount_type = 'percent' THEN
        SET p_discount_amount = ROUND((v_gross_fare * IFNULL(v_discount_value, 0)) / 100, 2);
      ELSE
        SET p_discount_amount = ROUND(IFNULL(v_discount_value, 0), 2);
      END IF;
    ELSE
      SET p_discount_amount = 0;
    END IF;
  ELSE
    SET p_discount_amount = 0;
  END IF;

  IF p_discount_amount > v_gross_fare THEN
    SET p_discount_amount = v_gross_fare;
  END IF;

  SET p_final_fare = ROUND(v_gross_fare - p_discount_amount, 2);
END$$

CREATE PROCEDURE sp_request_ride (
  IN p_rider_id BIGINT UNSIGNED,
  IN p_pickup_location_id BIGINT UNSIGNED,
  IN p_dropoff_location_id BIGINT UNSIGNED,
  IN p_scheduled_for DATETIME,
  OUT p_ride_id BIGINT UNSIGNED,
  OUT p_driver_id BIGINT UNSIGNED,
  OUT p_vehicle_id BIGINT UNSIGNED
)
BEGIN
  DECLARE v_driver_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE v_vehicle_id BIGINT UNSIGNED DEFAULT NULL;
  DECLARE CONTINUE HANDLER FOR NOT FOUND
  BEGIN
    SET v_driver_id = NULL;
    SET v_vehicle_id = NULL;
  END;

  SELECT
    d.driver_id,
    v.vehicle_id
  INTO
    v_driver_id,
    v_vehicle_id
  FROM drivers d
  JOIN vehicles v
    ON v.driver_id = d.driver_id
   AND v.verification_status = 'verified'
  JOIN locations driver_loc
    ON driver_loc.location_id = d.current_location_id
  JOIN locations pickup
    ON pickup.location_id = p_pickup_location_id
  WHERE d.verification_status = 'verified'
    AND d.availability_status = 'online'
    AND d.current_city = pickup.city
  ORDER BY
    POW(driver_loc.latitude - pickup.latitude, 2) +
    POW(driver_loc.longitude - pickup.longitude, 2),
    d.average_rating DESC,
    d.total_trips_completed DESC
  LIMIT 1;

  SET p_driver_id = v_driver_id;
  SET p_vehicle_id = v_vehicle_id;

  INSERT INTO rides (
    rider_id,
    driver_id,
    vehicle_id,
    pickup_location_id,
    dropoff_location_id,
    ride_status,
    scheduled_for
  ) VALUES (
    p_rider_id,
    v_driver_id,
    v_vehicle_id,
    p_pickup_location_id,
    p_dropoff_location_id,
    'requested',
    p_scheduled_for
  );

  SET p_ride_id = LAST_INSERT_ID();
END$$

CREATE TRIGGER trg_rides_bi_validate_assignment
BEFORE INSERT ON rides
FOR EACH ROW
BEGIN
  IF NEW.ride_status IN ('accepted', 'driver_en_route', 'in_progress', 'completed') THEN
    IF NEW.driver_id IS NULL OR NEW.vehicle_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Accepted/in-progress/completed rides require driver and vehicle.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.driver_id = NEW.driver_id
        AND d.verification_status = 'verified'
        AND d.availability_status IN ('online', 'on_trip')
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride must be assigned to a verified, available driver.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM vehicles v
      WHERE v.vehicle_id = NEW.vehicle_id
        AND v.driver_id = NEW.driver_id
        AND v.verification_status = 'verified'
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride must use a verified vehicle owned by the assigned driver.';
    END IF;
  END IF;

  IF NEW.scheduled_for IS NOT NULL AND NEW.scheduled_for < NEW.requested_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'scheduled_for cannot be earlier than requested_at.';
  END IF;
END$$

CREATE TRIGGER trg_rides_bu_validate_assignment
BEFORE UPDATE ON rides
FOR EACH ROW
BEGIN
  IF NEW.ride_status IN ('accepted', 'driver_en_route', 'in_progress', 'completed') THEN
    IF NEW.driver_id IS NULL OR NEW.vehicle_id IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Accepted/in-progress/completed rides require driver and vehicle.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM drivers d
      WHERE d.driver_id = NEW.driver_id
        AND d.verification_status = 'verified'
        AND d.availability_status IN ('online', 'on_trip')
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride must be assigned to a verified, available driver.';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM vehicles v
      WHERE v.vehicle_id = NEW.vehicle_id
        AND v.driver_id = NEW.driver_id
        AND v.verification_status = 'verified'
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Ride must use a verified vehicle owned by the assigned driver.';
    END IF;
  END IF;

  IF NEW.scheduled_for IS NOT NULL AND NEW.scheduled_for < NEW.requested_at THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'scheduled_for cannot be earlier than requested_at.';
  END IF;
END$$

CREATE TRIGGER trg_rides_au_archive
AFTER UPDATE ON rides
FOR EACH ROW
BEGIN
  IF NEW.ride_status <> OLD.ride_status
     AND NEW.ride_status IN ('completed', 'cancelled')
     AND NOT EXISTS (
       SELECT 1
       FROM ride_history rh
       WHERE rh.ride_id = NEW.ride_id
         AND rh.final_status = NEW.ride_status
     ) THEN
    INSERT INTO ride_history (
      ride_id,
      rider_id,
      driver_id,
      final_status,
      completed_or_cancelled_at
    ) VALUES (
      NEW.ride_id,
      NEW.rider_id,
      NEW.driver_id,
      NEW.ride_status,
      NOW()
    );
  END IF;
END$$

CREATE TRIGGER trg_rides_au_driver_trip_count
AFTER UPDATE ON rides
FOR EACH ROW
BEGIN
  IF NEW.ride_status <> OLD.ride_status THEN
    IF NEW.ride_status IN ('accepted', 'driver_en_route', 'in_progress')
       AND NEW.driver_id IS NOT NULL THEN
      UPDATE drivers
      SET availability_status = 'on_trip'
      WHERE driver_id = NEW.driver_id;
    END IF;

    IF NEW.ride_status = 'completed' AND NEW.driver_id IS NOT NULL THEN
      UPDATE drivers
      SET total_trips_completed = total_trips_completed + 1,
          availability_status = 'online'
      WHERE driver_id = NEW.driver_id;
    END IF;

    IF NEW.ride_status = 'cancelled' AND NEW.driver_id IS NOT NULL THEN
      UPDATE drivers
      SET availability_status = 'online'
      WHERE driver_id = NEW.driver_id
        AND availability_status = 'on_trip';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_payments_bi_set_driver_net
BEFORE INSERT ON payments
FOR EACH ROW
BEGIN
  DECLARE v_commission_rate DECIMAL(5,4) DEFAULT 0.2000;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_commission_rate = 0.2000;

  SELECT fr.commission_rate
    INTO v_commission_rate
  FROM rides r
  JOIN vehicles v
    ON v.vehicle_id = r.vehicle_id
  JOIN locations loc
    ON loc.location_id = r.pickup_location_id
  JOIN fare_rules fr
    ON fr.city = loc.city
   AND fr.vehicle_type = v.vehicle_type
   AND fr.is_active = TRUE
  WHERE r.ride_id = NEW.ride_id
  LIMIT 1;

  IF NEW.discount_applied IS NULL THEN
    SET NEW.discount_applied = 0;
  END IF;

  IF NEW.driver_net_earning IS NULL THEN
    SET NEW.driver_net_earning = ROUND(NEW.amount * (1 - v_commission_rate), 2);
  END IF;
END$$

CREATE TRIGGER trg_payments_ai_finalize_paid_payment
AFTER INSERT ON payments
FOR EACH ROW
BEGIN
  IF NEW.payment_status = 'paid' THEN
    UPDATE rides
    SET ride_status = 'completed',
        final_fare = COALESCE(final_fare, NEW.amount),
        fare = COALESCE(fare, NEW.amount)
    WHERE ride_id = NEW.ride_id
      AND ride_status <> 'completed';
  END IF;

  IF NEW.promo_code_id IS NOT NULL THEN
    UPDATE promocodes
    SET usage_count = usage_count + 1
    WHERE promo_code_id = NEW.promo_code_id;
  END IF;
END$$

CREATE TRIGGER trg_payments_au_finalize_paid_payment
AFTER UPDATE ON payments
FOR EACH ROW
BEGIN
  IF NEW.payment_status = 'paid'
     AND OLD.payment_status <> 'paid' THEN
    UPDATE rides
    SET ride_status = 'completed',
        final_fare = COALESCE(final_fare, NEW.amount),
        fare = COALESCE(fare, NEW.amount)
    WHERE ride_id = NEW.ride_id
      AND ride_status <> 'completed';
  END IF;

  IF NEW.promo_code_id IS NOT NULL
     AND (OLD.promo_code_id IS NULL OR OLD.promo_code_id <> NEW.promo_code_id) THEN
    UPDATE promocodes
    SET usage_count = usage_count + 1
    WHERE promo_code_id = NEW.promo_code_id;
  END IF;
END$$

CREATE TRIGGER trg_ratings_ai_update_scores
AFTER INSERT ON ratings
FOR EACH ROW
BEGIN
  DECLARE v_driver_id BIGINT UNSIGNED;
  DECLARE v_driver_avg DECIMAL(3,2);
  DECLARE v_driver_total_ratings INT DEFAULT 0;
  DECLARE v_driver_low_ratings INT DEFAULT 0;
  DECLARE v_rider_avg DECIMAL(3,2);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_driver_id = NULL;

  SELECT d.driver_id
    INTO v_driver_id
  FROM drivers d
  WHERE d.user_id = NEW.rated_user_id
  LIMIT 1;

  IF v_driver_id IS NOT NULL THEN
    SELECT
      ROUND(AVG(r.score), 2),
      COUNT(*),
      SUM(CASE WHEN r.score <= 3 THEN 1 ELSE 0 END)
      INTO v_driver_avg,
           v_driver_total_ratings,
           v_driver_low_ratings
    FROM ratings r
    WHERE r.rated_user_id = NEW.rated_user_id;

    UPDATE drivers
    SET average_rating = IFNULL(v_driver_avg, 0)
    WHERE driver_id = v_driver_id;

    IF v_driver_total_ratings >= 5
       AND v_driver_low_ratings > 3
       AND IFNULL(v_driver_avg, 0) < 3.00
       AND NOT EXISTS (
         SELECT 1
         FROM driver_review_flags f
         WHERE f.driver_id = v_driver_id
           AND f.is_resolved = FALSE
       ) THEN
      INSERT INTO driver_review_flags (
        driver_id,
        current_average_rating,
        reason
      ) VALUES (
        v_driver_id,
        v_driver_avg,
        'Driver has at least 5 ratings, more than 3 ratings at 3 stars or below, and an average below 3.0.'
      );

      INSERT INTO admin_notifications (
        notification_type,
        user_id,
        driver_id,
        message
      ) VALUES (
        'driver_rating_alert',
        NEW.rated_user_id,
        v_driver_id,
        CONCAT('Driver ', NEW.rated_user_id, ' flagged: average ', v_driver_avg, ', low ratings ', v_driver_low_ratings, ' of ', v_driver_total_ratings, '.')
      );
    END IF;
  ELSE
    SELECT ROUND(AVG(r.score), 2)
      INTO v_rider_avg
    FROM ratings r
    WHERE r.rated_user_id = NEW.rated_user_id;

    IF IFNULL(v_rider_avg, 0) < 3.00 THEN
      INSERT INTO rider_warnings (
        rider_id,
        current_average_rating,
        reason
      ) VALUES (
        NEW.rated_user_id,
        v_rider_avg,
        'Rider average rating fell below 3.0; warning generated.'
      );
    END IF;
  END IF;
END$$

CREATE EVENT ev_expire_promocodes_midnight
ON SCHEDULE EVERY 1 DAY
STARTS CURRENT_DATE + INTERVAL 1 DAY
DO
BEGIN
  UPDATE promocodes
  SET is_active = FALSE
  WHERE end_date < NOW()
    AND is_active = TRUE;
END$$

DELIMITER ;

CREATE VIEW ActiveRidesView AS
SELECT
  r.ride_id,
  r.ride_status,
  r.requested_at,
  r.scheduled_for,
  rider.user_id AS rider_id,
  rider.full_name AS rider_name,
  rider.phone AS rider_phone,
  d.driver_id,
  driver_user.full_name AS driver_name,
  driver_user.phone AS driver_phone,
  d.current_city AS driver_city,
  d.average_rating AS driver_average_rating,
  v.vehicle_id,
  CONCAT(v.make, ' ', v.model) AS vehicle_name,
  v.license_plate,
  v.vehicle_type,
  pickup.address AS pickup_address,
  pickup.city AS pickup_city,
  dropoff.address AS dropoff_address,
  dropoff.city AS dropoff_city,
  r.distance_km,
  r.duration_min,
  r.final_fare
FROM rides r
JOIN users rider
  ON rider.user_id = r.rider_id
JOIN drivers d
  ON d.driver_id = r.driver_id
JOIN users driver_user
  ON driver_user.user_id = d.user_id
JOIN vehicles v
  ON v.vehicle_id = r.vehicle_id
JOIN locations pickup
  ON pickup.location_id = r.pickup_location_id
JOIN locations dropoff
  ON dropoff.location_id = r.dropoff_location_id
WHERE r.ride_status IN ('accepted', 'driver_en_route', 'in_progress');

CREATE VIEW TopDriversView AS
SELECT
  d.driver_id,
  u.full_name AS driver_name,
  d.current_city AS city,
  d.total_trips_completed,
  ROUND(AVG(rt.score), 2) AS average_rating,
  COUNT(rt.rating_id) AS total_ratings
FROM drivers d
JOIN users u
  ON u.user_id = d.user_id
JOIN ratings rt
  ON rt.rated_user_id = u.user_id
WHERE d.verification_status = 'verified'
GROUP BY d.driver_id, u.full_name, d.current_city, d.total_trips_completed
HAVING AVG(rt.score) > 4.5;

CREATE VIEW vw_driver_leaderboard_city AS
SELECT
  d.driver_id,
  u.full_name AS driver_name,
  loc.city,
  ROUND(AVG(rt.score), 2) AS avg_rating,
  COUNT(rt.rating_id) AS total_ratings,
  DENSE_RANK() OVER (
    PARTITION BY loc.city
    ORDER BY AVG(rt.score) DESC, COUNT(rt.rating_id) DESC
  ) AS city_rank
FROM drivers d
JOIN users u
  ON u.user_id = d.user_id
JOIN rides rd
  ON rd.driver_id = d.driver_id
 AND rd.ride_status = 'completed'
JOIN locations loc
  ON loc.location_id = rd.pickup_location_id
LEFT JOIN ratings rt
  ON rt.ride_id = rd.ride_id
 AND rt.rated_user_id = d.user_id
GROUP BY d.driver_id, u.full_name, loc.city;

CREATE VIEW vw_revenue_by_city_day AS
SELECT
  DATE(p.transaction_date) AS revenue_date,
  loc.city,
  COUNT(p.payment_id) AS total_paid_rides,
  ROUND(SUM(p.amount), 2) AS gross_revenue,
  ROUND(SUM(IFNULL(p.driver_net_earning, 0)), 2) AS total_driver_earnings,
  ROUND(SUM(p.amount - IFNULL(p.driver_net_earning, 0)), 2) AS total_commission
FROM payments p
JOIN rides r
  ON r.ride_id = p.ride_id
JOIN locations loc
  ON loc.location_id = r.pickup_location_id
WHERE p.payment_status = 'paid'
GROUP BY DATE(p.transaction_date), loc.city;

CREATE VIEW vw_revenue_by_payment_method AS
SELECT
  p.payment_method,
  COUNT(*) AS payment_count,
  ROUND(SUM(p.amount), 2) AS gross_revenue,
  ROUND(SUM(IFNULL(p.driver_net_earning, 0)), 2) AS driver_earnings,
  ROUND(SUM(p.amount - IFNULL(p.driver_net_earning, 0)), 2) AS platform_commission
FROM payments p
WHERE p.payment_status = 'paid'
GROUP BY p.payment_method;

CREATE VIEW vw_refund_dispute_totals AS
SELECT
  (SELECT COUNT(*) FROM payments WHERE payment_status = 'refunded') AS refund_count,
  (SELECT ROUND(IFNULL(SUM(amount), 0), 2) FROM payments WHERE payment_status = 'refunded') AS refund_amount_total,
  (SELECT COUNT(*) FROM complaints WHERE complaint_status IN ('open', 'under_review')) AS active_dispute_count,
  (SELECT COUNT(*) FROM complaints WHERE complaint_status = 'resolved') AS resolved_dispute_count;
