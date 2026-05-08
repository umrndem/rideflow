-- RideFlow Bootstrap Data (run after schema.sql and logic.sql)
-- Keeps only the admin account plus reference location data.

USE rideflow_db;

SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE admin_notifications;
TRUNCATE TABLE rider_warnings;
TRUNCATE TABLE driver_review_flags;
TRUNCATE TABLE ride_history;
TRUNCATE TABLE complaints;
TRUNCATE TABLE ratings;
TRUNCATE TABLE payments;
TRUNCATE TABLE ride_driver_rejections;
TRUNCATE TABLE rides;
TRUNCATE TABLE vehicles;
TRUNCATE TABLE drivers;
TRUNCATE TABLE promocodes;
TRUNCATE TABLE fare_rules;
TRUNCATE TABLE location_distances;
TRUNCATE TABLE locations;
TRUNCATE TABLE wallet_transactions;
TRUNCATE TABLE user_wallets;
TRUNCATE TABLE users;

SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO users (
  full_name,
  email,
  phone,
  password_hash,
  role,
  account_status,
  registration_date
) VALUES
  ('Sara Admin', 'admin@rideflow.test', '+92-300-0000001', SHA2('admin123', 256), 'super_admin', 'active', NOW());

INSERT INTO locations (
  address,
  city,
  latitude,
  longitude
) VALUES
  ('Gulberg Main Boulevard', 'Lahore', 31.5204000, 74.3587000),
  ('DHA Phase 5', 'Lahore', 31.4624000, 74.4094000),
  ('Johar Town Emporium Mall', 'Lahore', 31.4697000, 74.2728000),
  ('Allama Iqbal International Airport', 'Lahore', 31.5216000, 74.4036000),
  ('Liberty Market', 'Lahore', 31.5098000, 74.3441000),
  ('Model Town Park', 'Lahore', 31.4832000, 74.3239000),
  ('Lahore Railway Station', 'Lahore', 31.5773000, 74.3367000),
  ('Fortress Stadium', 'Lahore', 31.5313000, 74.3622000),
  ('Thokar Niaz Baig', 'Lahore', 31.4653000, 74.2389000),
  ('Bahria Town Lahore', 'Lahore', 31.3709000, 74.1863000),
  ('Clifton Block 5', 'Karachi', 24.8138000, 67.0305000),
  ('DHA Phase 6 Karachi', 'Karachi', 24.7909000, 67.0644000),
  ('Jinnah International Airport', 'Karachi', 24.9065000, 67.1608000),
  ('Saddar Karachi', 'Karachi', 24.8607000, 67.0104000),
  ('Gulshan-e-Iqbal', 'Karachi', 24.9204000, 67.0883000),
  ('North Nazimabad', 'Karachi', 24.9387000, 67.0422000),
  ('Bahadurabad', 'Karachi', 24.8849000, 67.0679000),
  ('Tariq Road', 'Karachi', 24.8733000, 67.0608000),
  ('Sea View Karachi', 'Karachi', 24.7850000, 67.0400000),
  ('Malir Cantt', 'Karachi', 24.9436000, 67.2056000),
  ('F-7 Markaz', 'Islamabad', 33.7215000, 73.0433000),
  ('Blue Area', 'Islamabad', 33.7294000, 73.0931000),
  ('Centaurus Mall', 'Islamabad', 33.7077000, 73.0498000),
  ('Islamabad International Airport', 'Islamabad', 33.5607000, 72.8516000),
  ('DHA Phase 2 Islamabad', 'Islamabad', 33.5274000, 73.1518000),
  ('G-11 Markaz', 'Islamabad', 33.6673000, 73.0007000),
  ('I-8 Markaz', 'Islamabad', 33.6667000, 73.0771000),
  ('Pakistan Secretariat', 'Islamabad', 33.7320000, 73.0992000),
  ('Bahria Enclave', 'Islamabad', 33.7042000, 73.2128000),
  ('Rawal Lake View Park', 'Islamabad', 33.7006000, 73.1261000),
  ('D Ground Faisalabad', 'Faisalabad', 31.4180000, 73.0790000),
  ('Clock Tower Faisalabad', 'Faisalabad', 31.4187000, 73.0791000),
  ('Jinnah Garden Faisalabad', 'Faisalabad', 31.4259000, 73.0911000),
  ('Kohinoor City', 'Faisalabad', 31.4504000, 73.1350000),
  ('People Colony', 'Faisalabad', 31.4376000, 73.1216000),
  ('Madina Town', 'Faisalabad', 31.4097000, 73.1185000),
  ('Susan Road', 'Faisalabad', 31.4116000, 73.1052000),
  ('Faisalabad Railway Station', 'Faisalabad', 31.4217000, 73.0704000),
  ('Canal Road Faisalabad', 'Faisalabad', 31.3951000, 73.1142000),
  ('Faisalabad International Airport', 'Faisalabad', 31.3650000, 72.9948000),
  ('University Road Peshawar', 'Peshawar', 34.0025000, 71.4851000),
  ('Saddar Peshawar', 'Peshawar', 34.0033000, 71.5636000),
  ('Hayatabad Phase 3', 'Peshawar', 33.9861000, 71.4346000),
  ('Qissa Khwani Bazaar', 'Peshawar', 34.0081000, 71.5785000),
  ('Bacha Khan International Airport', 'Peshawar', 33.9939000, 71.5151000),
  ('Peshawar Railway Station', 'Peshawar', 34.0151000, 71.5703000),
  ('Ring Road Peshawar', 'Peshawar', 34.0291000, 71.5066000),
  ('Town University Campus', 'Peshawar', 34.0010000, 71.4700000),
  ('Board Bazaar Peshawar', 'Peshawar', 33.9985000, 71.4466000),
  ('Warsak Road Peshawar', 'Peshawar', 34.0525000, 71.5142000);

INSERT INTO location_distances (
  city,
  pickup_location_id,
  dropoff_location_id,
  distance_km,
  duration_min
)
SELECT
  p.city,
  p.location_id,
  d.location_id,
  ROUND(
    GREATEST(
      1.20,
      (
        111.045 * DEGREES(
          ACOS(
            LEAST(
              1,
              GREATEST(
                -1,
                COS(RADIANS(p.latitude)) *
                COS(RADIANS(d.latitude)) *
                COS(RADIANS(p.longitude) - RADIANS(d.longitude)) +
                SIN(RADIANS(p.latitude)) *
                SIN(RADIANS(d.latitude))
              )
            )
          )
        )
      ) * 1.28
    ),
    2
  ) AS distance_km,
  ROUND(
    GREATEST(
      8,
      (
        GREATEST(
          1.20,
          (
            111.045 * DEGREES(
              ACOS(
                LEAST(
                  1,
                  GREATEST(
                    -1,
                    COS(RADIANS(p.latitude)) *
                    COS(RADIANS(d.latitude)) *
                    COS(RADIANS(p.longitude) - RADIANS(d.longitude)) +
                    SIN(RADIANS(p.latitude)) *
                    SIN(RADIANS(d.latitude))
                  )
                )
              )
            )
          ) * 1.28
        ) / 24.0
      ) * 60
    ),
    0
  ) AS duration_min
FROM locations p
JOIN locations d
  ON d.city = p.city
 AND d.location_id <> p.location_id;
