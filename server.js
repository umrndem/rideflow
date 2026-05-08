import cors from 'cors';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import express from 'express';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const app = express();
const port = Number(process.env.PORT || 3000);
const sessionTtlMs = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 8);
const allowedOrigins = new Set(
  (process.env.CORS_ORIGINS || `http://localhost:${port},http://127.0.0.1:${port}`)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);
const sessions = new Map();
const sslCaContent = process.env.DB_SSL_CA_CONTENT
  ? process.env.DB_SSL_CA_CONTENT.replace(/\\n/g, '\n')
  : null;
const sslCaPath = process.env.DB_SSL_CA;
const sslOptions = sslCaContent
  ? { ca: sslCaContent }
  : sslCaPath
    ? { ca: fs.readFileSync(path.join(__dirname, sslCaPath)) }
    : null;

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'rideflow_db',
  ...(sslOptions ? { ssl: sslOptions } : {}),
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true
});

app.disable('x-powered-by');
app.use((request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(appError('Origin is not allowed.', 403));
  }
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api', (request, response, next) => {
  response.setHeader('Cache-Control', 'no-store');
  next();
});

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

async function transaction(work) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

function asyncRoute(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function appError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function cleanString(value, fieldName, maxLength = 120) {
  const cleaned = String(value || '').trim();

  if (!cleaned) {
    throw appError(`${fieldName} is required.`);
  }

  if (cleaned.length > maxLength) {
    throw appError(`${fieldName} must be ${maxLength} characters or less.`);
  }

  return cleaned;
}

function cleanNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanPositiveInt(value, fieldName) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw appError(`${fieldName} must be a positive number.`);
  }

  return parsed;
}

function cleanEnum(value, allowed, fieldName) {
  const cleaned = String(value || '').trim();

  if (!allowed.includes(cleaned)) {
    throw appError(`Invalid ${fieldName}.`);
  }

  return cleaned;
}

function cleanEmail(value) {
  const email = cleanString(value, 'Email', 180).toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw appError('Enter a valid email address.');
  }

  return email;
}

function cleanPassword(value) {
  const password = String(value || '');

  if (password.length < 6 || password.length > 128) {
    throw appError('Password must be between 6 and 128 characters.');
  }

  return password;
}

function publicUser(row) {
  const dashboardRole = row.role === 'admin' || row.role === 'super_admin' ? 'admin' : row.role;

  return {
    userId: row.user_id,
    driverId: row.driver_id || null,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    dashboardRole,
    accountStatus: row.account_status,
    verificationStatus: row.verification_status || null
  };
}

function roleAllowed(user, roles) {
  return roles.some((role) => {
    if (role === 'admin') {
      return user.role === 'admin' || user.role === 'super_admin';
    }

    return user.role === role;
  });
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    user,
    expiresAt: Date.now() + sessionTtlMs
  });
  return token;
}

function readSession(token) {
  const session = token ? sessions.get(token) : null;

  if (!session) {
    return null;
  }

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  session.expiresAt = Date.now() + sessionTtlMs;
  return session.user;
}

function requestHost(request) {
  const forwarded = request.headers['x-forwarded-host'];
  const rawHost = Array.isArray(forwarded)
    ? forwarded[0]
    : forwarded || request.headers.host || request.hostname || '';

  return String(rawHost)
    .split(',')[0]
    .trim()
    .replace(/:\d+$/, '')
    .toLowerCase();
}

function siteAudienceForRequest(request) {
  const host = requestHost(request);

  if (/^admin(\.|$)/.test(host)) {
    return 'admin';
  }

  if (/^driver(\.|$)/.test(host)) {
    return 'driver';
  }

  return 'rider';
}

function siteFileForAudience(audience) {
  if (audience === 'admin') {
    return path.join(publicDir, 'admin', 'index.html');
  }

  if (audience === 'driver') {
    return path.join(publicDir, 'driver', 'index.html');
  }

  return path.join(publicDir, 'index.html');
}

function servePage(filePath) {
  return (request, response) => {
    response.sendFile(filePath);
  };
}

function serveRootPage(request, response) {
  response.sendFile(siteFileForAudience(siteAudienceForRequest(request)));
}

function requireAuth(...roles) {
  return (request, response, next) => {
    const token = request.get('X-Session-Token');
    const user = readSession(token);

    if (!user) {
      response.status(401).json({ error: 'Login required.' });
      return;
    }

    if (roles.length > 0 && !roleAllowed(user, roles)) {
      response.status(403).json({ error: 'This dashboard is not available for your role.' });
      return;
    }

    request.user = user;
    request.token = token;
    next();
  };
}

const sessionCleanup = setInterval(() => {
  const now = Date.now();

  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
    }
  }
}, Math.min(sessionTtlMs, 1000 * 60 * 30));

sessionCleanup.unref?.();

async function issueSessionForUser(userId) {
  const rows = await query(`
    SELECT
      u.user_id,
      u.full_name,
      u.email,
      u.role,
      u.account_status,
      d.driver_id,
      d.verification_status
    FROM users u
    LEFT JOIN drivers d
      ON d.user_id = u.user_id
    WHERE u.user_id = ?
    LIMIT 1
  `, [userId]);

  const user = publicUser(rows[0]);
  const token = createSession(user);
  return { token, user };
}

async function getFare(connection, rideInput) {
  const {
    pickupLocationId,
    dropoffLocationId,
    vehicleType,
    promoCode
  } = rideInput;

  if (!pickupLocationId || !dropoffLocationId || !vehicleType) {
    throw appError('Pickup, drop-off, and vehicle type are required.');
  }

  const [routeRows] = await connection.execute(`
    SELECT
      ld.distance_id,
      ld.city,
      ld.distance_km,
      ld.duration_min,
      pickup.address AS pickup_address,
      dropoff.address AS dropoff_address
    FROM location_distances ld
    JOIN locations pickup
      ON pickup.location_id = ld.pickup_location_id
    JOIN locations dropoff
      ON dropoff.location_id = ld.dropoff_location_id
    WHERE ld.pickup_location_id = ?
      AND ld.dropoff_location_id = ?
    LIMIT 1
  `, [pickupLocationId, dropoffLocationId]);

  if (routeRows.length === 0) {
    throw appError('Select two different locations within the same city.');
  }

  const route = routeRows[0];

  const [rules] = await connection.execute(`
    SELECT
      fr.*
    FROM fare_rules fr
    WHERE fr.city = ?
      AND fr.vehicle_type = ?
      AND fr.is_active = TRUE
    LIMIT 1
  `, [route.city, vehicleType]);

  if (rules.length === 0) {
    throw appError('No active fare rule exists for that pickup city and vehicle type.');
  }

  const rule = rules[0];

  await connection.query(
    `CALL sp_calculate_fare(?, ?, ?, ?, ?, ?, ?, @base_fare, @surge_multiplier, @discount_amount, @final_fare)`,
    [
      route.distance_km,
      route.duration_min,
      rule.surge_multiplier,
      rule.base_rate,
      rule.per_km_rate,
      rule.per_min_rate,
      promoCode || null
    ]
  );

  const [fareRows] = await connection.query(`
    SELECT
      @base_fare AS baseFare,
      @surge_multiplier AS surgeMultiplier,
      @discount_amount AS discountAmount,
      @final_fare AS finalFare
  `);

  return { rule, route, fare: fareRows[0] };
}

async function inferVehicleTypeForRide(connection, ride) {
  const vehicleTypes = ['economy', 'premium', 'bike'];
  const targetFinal = cleanNumber(ride.final_fare);
  const targetBase = cleanNumber(ride.fare);
  let bestType = null;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const type of vehicleTypes) {
    try {
      const result = await getFare(connection, {
        pickupLocationId: ride.pickup_location_id,
        dropoffLocationId: ride.dropoff_location_id,
        vehicleType: type,
        promoCode: ride.promo_code || null
      });

      const baseDelta = Math.abs(cleanNumber(result.fare.baseFare) - targetBase);
      const finalDelta = Math.abs(cleanNumber(result.fare.finalFare) - targetFinal);
      const delta = baseDelta + finalDelta;

      if (delta < bestDelta) {
        bestDelta = delta;
        bestType = type;
      }
    } catch (error) {
      // Ignore missing rule combinations.
    }
  }

  if (bestDelta > 1) {
    return null;
  }

  return bestType;
}

async function findNearestDriver(connection, pickupLocationId, vehicleType, excludedDriverId = null, rejectedRideId = null) {
  const params = [vehicleType, pickupLocationId];
  let excludedSql = '';
  let rejectedSql = '';

  if (excludedDriverId) {
    excludedSql = 'AND d.driver_id <> ?';
    params.push(excludedDriverId);
  }

  if (rejectedRideId) {
    rejectedSql = `
      AND NOT EXISTS (
        SELECT 1
        FROM ride_driver_rejections rdr
        WHERE rdr.ride_id = ?
          AND rdr.driver_id = d.driver_id
      )
    `;
    params.push(rejectedRideId);
  }

  const [rows] = await connection.execute(`
    SELECT
      d.driver_id,
      v.vehicle_id
    FROM drivers d
    JOIN vehicles v
      ON v.driver_id = d.driver_id
     AND v.verification_status = 'verified'
     AND v.vehicle_type = ?
    JOIN locations driver_loc
      ON driver_loc.location_id = d.current_location_id
    JOIN locations pickup
      ON pickup.location_id = ?
    WHERE d.verification_status = 'verified'
      AND d.availability_status = 'online'
      AND d.current_city = pickup.city
      ${excludedSql}
      ${rejectedSql}
    ORDER BY
      POW(driver_loc.latitude - pickup.latitude, 2) +
      POW(driver_loc.longitude - pickup.longitude, 2),
      d.average_rating DESC,
      d.total_trips_completed DESC
    LIMIT 1
  `, params);

  return rows[0] || null;
}

async function createWalletTransaction(connection, userId, type, amount, description, rideId = null) {
  const [walletRows] = await connection.execute(
    'SELECT wallet_id, balance FROM user_wallets WHERE user_id = ? FOR UPDATE',
    [userId]
  );

  if (walletRows.length === 0) {
    throw appError('Wallet was not found.', 404);
  }

  const wallet = walletRows[0];
  const signedAmount = type === 'ride_payment' ? -amount : amount;
  const nextBalance = cleanNumber(wallet.balance) + signedAmount;

  if (nextBalance < 0) {
    throw appError('Insufficient wallet balance.', 409);
  }

  await connection.execute(
    'UPDATE user_wallets SET balance = ? WHERE wallet_id = ?',
    [nextBalance, wallet.wallet_id]
  );

  await connection.execute(`
    INSERT INTO wallet_transactions (
      wallet_id,
      ride_id,
      transaction_type,
      amount,
      balance_after,
      description
    ) VALUES (?, ?, ?, ?, ?, ?)
  `, [wallet.wallet_id, rideId, type, amount, nextBalance, description]);

  return { balance: nextBalance };
}

async function completeRideWithPayment(connection, ride, paymentStatus = 'paid') {
  if (ride.payment_method === 'wallet') {
    await createWalletTransaction(
      connection,
      ride.rider_id,
      'ride_payment',
      cleanNumber(ride.final_fare),
      `Ride #${ride.ride_id} wallet payment`,
      ride.ride_id
    );
  }

  await connection.execute(`
    INSERT INTO payments (
      ride_id,
      rider_id,
      promo_code_id,
      amount,
      discount_applied,
      payment_method,
      payment_status,
      transaction_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    ON DUPLICATE KEY UPDATE
      amount = VALUES(amount),
      payment_method = VALUES(payment_method),
      payment_status = VALUES(payment_status),
      transaction_date = VALUES(transaction_date)
  `, [
    ride.ride_id,
    ride.rider_id,
    ride.promo_code_id || null,
    cleanNumber(ride.final_fare),
    cleanNumber(ride.discount_applied),
    ride.payment_method,
    paymentStatus
  ]);
}

app.get('/', serveRootPage);
app.get('/index.html', serveRootPage);
app.get('/driver', servePage(path.join(publicDir, 'driver', 'index.html')));
app.get('/driver/', servePage(path.join(publicDir, 'driver', 'index.html')));
app.get('/driver/index.html', servePage(path.join(publicDir, 'driver', 'index.html')));
app.get('/admin', servePage(path.join(publicDir, 'admin', 'index.html')));
app.get('/admin/', servePage(path.join(publicDir, 'admin', 'index.html')));
app.get('/admin/index.html', servePage(path.join(publicDir, 'admin', 'index.html')));

app.use(express.static(publicDir));

app.get('/api/health', asyncRoute(async (request, response) => {
  await query('SELECT 1 AS ok');
  response.json({ ok: true, database: 'connected' });
}));

app.get('/api/public/lookups', asyncRoute(async (request, response) => {
  const [locations, cities] = await Promise.all([
    query(`
      SELECT
        location_id,
        CONCAT(address, ', ', city) AS label,
        address,
        city
      FROM locations
      ORDER BY city, address
    `),
    query(`
      SELECT DISTINCT city
      FROM locations
      ORDER BY city
    `)
  ]);

  response.json({ locations, cities });
}));

app.post('/api/auth/signup/rider', asyncRoute(async (request, response) => {
  const fullName = cleanString(request.body.fullName, 'Full name');
  const email = cleanEmail(request.body.email);
  const phone = cleanString(request.body.phone, 'Phone', 30);
  const password = cleanPassword(request.body.password);

  const result = await transaction(async (connection) => {
    const [userResult] = await connection.execute(`
      INSERT INTO users (full_name, email, phone, password_hash, role, account_status)
      VALUES (?, ?, ?, SHA2(?, 256), 'rider', 'active')
    `, [fullName, email, phone, password]);

    await connection.execute(
      'INSERT INTO user_wallets (user_id, balance) VALUES (?, 0)',
      [userResult.insertId]
    );

    return userResult.insertId;
  });

  response.status(201).json(await issueSessionForUser(result));
}));

app.post('/api/auth/signup/driver', asyncRoute(async (request, response) => {
  const fullName = cleanString(request.body.fullName, 'Full name');
  const email = cleanEmail(request.body.email);
  const phone = cleanString(request.body.phone, 'Phone', 30);
  const password = cleanPassword(request.body.password);
  const licenseNumber = cleanString(request.body.licenseNumber, 'License number', 60);
  const nationalId = cleanString(request.body.nationalId, 'CNIC / National ID', 60);
  const city = cleanString(request.body.city, 'City', 100);
  const currentLocationId = request.body.currentLocationId ? cleanPositiveInt(request.body.currentLocationId, 'Current area') : null;
  const make = cleanString(request.body.make, 'Vehicle make', 80);
  const model = cleanString(request.body.model, 'Vehicle model', 80);
  const year = cleanPositiveInt(request.body.year, 'Vehicle year');
  const color = cleanString(request.body.color, 'Vehicle color', 40);
  const licensePlate = cleanString(request.body.licensePlate, 'License plate', 40);
  const vehicleType = cleanEnum(request.body.vehicleType, ['economy', 'premium', 'bike'], 'vehicle type');

  if (year < 1980 || year > 2100) {
    response.status(400).json({ error: 'Vehicle year must be between 1980 and 2100.' });
    return;
  }

  const userId = await transaction(async (connection) => {
    const [locationRows] = currentLocationId
      ? await connection.execute(`
      SELECT location_id
      FROM locations
      WHERE location_id = ?
        AND city = ?
      LIMIT 1
    `, [currentLocationId, city])
      : await connection.execute(`
      SELECT location_id
      FROM locations
      WHERE city = ?
      ORDER BY location_id
      LIMIT 1
    `, [city]);

    if (locationRows.length === 0) {
      throw appError('Choose a valid location from the selected city.');
    }

    const locationId = locationRows[0].location_id;

    const [userResult] = await connection.execute(`
      INSERT INTO users (full_name, email, phone, password_hash, role, account_status)
      VALUES (?, ?, ?, SHA2(?, 256), 'driver', 'active')
    `, [fullName, email, phone, password]);

    const [driverResult] = await connection.execute(`
      INSERT INTO drivers (
        user_id,
        license_number,
        national_id,
        current_city,
        current_location_id,
        verification_status,
        availability_status
      ) VALUES (?, ?, ?, ?, ?, 'pending', 'offline')
    `, [userResult.insertId, licenseNumber, nationalId, city, locationId]);

    await connection.execute(`
      INSERT INTO vehicles (
        driver_id,
        make,
        model,
        year,
        color,
        license_plate,
        vehicle_type,
        verification_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
    `, [driverResult.insertId, make, model, year, color, licensePlate, vehicleType]);

    return userResult.insertId;
  });

  response.status(201).json(await issueSessionForUser(userId));
}));

app.post('/api/auth/login', asyncRoute(async (request, response) => {
  const email = cleanEmail(request.body.email);
  const password = cleanPassword(request.body.password);
  const role = cleanEnum(request.body.role, ['rider', 'driver', 'admin'], 'dashboard role');

  const rows = await query(`
    SELECT
      u.user_id,
      u.full_name,
      u.email,
      u.role,
      u.account_status,
      d.driver_id,
      d.verification_status
    FROM users u
    LEFT JOIN drivers d
      ON d.user_id = u.user_id
    WHERE u.email = ?
      AND u.password_hash = SHA2(?, 256)
      AND u.account_status = 'active'
    LIMIT 1
  `, [email, password]);

  if (rows.length === 0) {
    response.status(401).json({ error: 'Invalid credentials or inactive account.' });
    return;
  }

  const user = publicUser(rows[0]);

  if (!roleAllowed(user, [role])) {
    response.status(403).json({ error: 'Selected dashboard does not match this account role.' });
    return;
  }

  const token = createSession(user);
  response.json({ token, user });
}));

app.post('/api/auth/logout', requireAuth(), (request, response) => {
  sessions.delete(request.token);
  response.json({ ok: true });
});

app.get('/api/auth/me', requireAuth(), (request, response) => {
  response.json({ user: request.user });
});

app.get('/api/lookups', requireAuth('rider', 'driver', 'admin'), asyncRoute(async (request, response) => {
  const [locations, cities, promos, fareRules] = await Promise.all([
    query(`
      SELECT
        location_id,
        CONCAT(address, ', ', city) AS label,
        address,
        city
      FROM locations
      ORDER BY city, address
    `),
    query(`
      SELECT DISTINCT city
      FROM locations
      ORDER BY city
    `),
    query(`
      SELECT promo_code_id, code, discount_type, discount_value
      FROM promocodes
      WHERE is_active = TRUE
        AND end_date >= NOW()
        AND (usage_limit IS NULL OR usage_count < usage_limit)
      ORDER BY code
    `),
    query(`
      SELECT city, vehicle_type, base_rate, per_km_rate, per_min_rate, surge_multiplier
      FROM fare_rules
      WHERE is_active = TRUE
      ORDER BY city, vehicle_type
    `)
  ]);

  response.json({ locations, cities, promos, fareRules });
}));

app.get('/api/rider/dashboard', requireAuth('rider'), asyncRoute(async (request, response) => {
  const riderId = request.user.userId;

  await query(`
    INSERT INTO user_wallets (user_id, balance)
    VALUES (?, 0)
    ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)
  `, [riderId]);

  const [walletRows, rideHistory, walletTransactions] = await Promise.all([
    query('SELECT wallet_id, balance, updated_at FROM user_wallets WHERE user_id = ?', [riderId]),
    query(`
      SELECT
        r.ride_id,
        r.ride_status,
        r.requested_at,
        r.scheduled_for,
        r.distance_km,
        r.duration_min,
        r.final_fare,
        r.payment_method,
        pickup.address AS pickup_address,
        pickup.city AS pickup_city,
        dropoff.address AS dropoff_address,
        dropoff.city AS dropoff_city,
        d.driver_id,
        driver_user.full_name AS driver_name,
        driver_user.user_id AS driver_user_id,
        d.average_rating AS driver_average_rating,
        (
          SELECT COUNT(*)
          FROM ratings driver_rating_count
          WHERE driver_rating_count.rated_user_id = driver_user.user_id
        ) AS driver_rating_count,
        EXISTS (
          SELECT 1
          FROM driver_review_flags active_flag
          WHERE active_flag.driver_id = d.driver_id
            AND active_flag.is_resolved = FALSE
        ) AS driver_is_flagged,
        (
          SELECT latest_flag.reason
          FROM driver_review_flags latest_flag
          WHERE latest_flag.driver_id = d.driver_id
            AND latest_flag.is_resolved = FALSE
          ORDER BY latest_flag.created_at DESC
          LIMIT 1
        ) AS driver_flag_reason,
        (
          SELECT latest_flag.current_average_rating
          FROM driver_review_flags latest_flag
          WHERE latest_flag.driver_id = d.driver_id
            AND latest_flag.is_resolved = FALSE
          ORDER BY latest_flag.created_at DESC
          LIMIT 1
        ) AS driver_flag_average,
        rider_driver_rating.rating_id AS rider_driver_rating_id,
        rider_driver_rating.score AS rider_driver_score,
        rider_driver_rating.comment AS rider_driver_comment,
        v.vehicle_type,
        p.payment_status
      FROM rides r
      JOIN locations pickup
        ON pickup.location_id = r.pickup_location_id
      JOIN locations dropoff
        ON dropoff.location_id = r.dropoff_location_id
      LEFT JOIN drivers d
        ON d.driver_id = r.driver_id
      LEFT JOIN users driver_user
        ON driver_user.user_id = d.user_id
      LEFT JOIN ratings rider_driver_rating
        ON rider_driver_rating.ride_id = r.ride_id
       AND rider_driver_rating.rated_by_user_id = ?
       AND rider_driver_rating.rated_user_id = driver_user.user_id
      LEFT JOIN vehicles v
        ON v.vehicle_id = r.vehicle_id
      LEFT JOIN payments p
        ON p.ride_id = r.ride_id
      WHERE r.rider_id = ?
      ORDER BY r.requested_at DESC
    `, [riderId, riderId]),
    query(`
      SELECT
        wt.wallet_transaction_id,
        wt.transaction_type,
        wt.amount,
        wt.balance_after,
        wt.description,
        wt.created_at,
        wt.ride_id
      FROM wallet_transactions wt
      JOIN user_wallets uw
        ON uw.wallet_id = wt.wallet_id
      WHERE uw.user_id = ?
      ORDER BY wt.created_at DESC, wt.wallet_transaction_id DESC
    `, [riderId])
  ]);

  const currentRide = rideHistory.find((ride) => ['requested', 'accepted', 'driver_en_route', 'in_progress'].includes(ride.ride_status)) || null;

  response.json({
    wallet: walletRows[0],
    currentRide,
    rideHistory,
    walletTransactions
  });
}));

app.post('/api/rider/fares/estimate', requireAuth('rider'), asyncRoute(async (request, response) => {
  const result = await transaction(async (connection) => getFare(connection, request.body));
  response.json(result);
}));

app.post('/api/rider/wallet/top-up', requireAuth('rider'), asyncRoute(async (request, response) => {
  const amount = cleanNumber(request.body.amount);

  if (amount <= 0 || amount > 1000000) {
    response.status(400).json({ error: 'Top-up amount must be between 1 and 1,000,000.' });
    return;
  }

  const wallet = await transaction(async (connection) => createWalletTransaction(
    connection,
    request.user.userId,
    'top_up',
    amount,
    'Wallet top-up'
  ));

  response.json({ wallet });
}));

app.post('/api/rider/rides', requireAuth('rider'), asyncRoute(async (request, response) => {
  const pickupLocationId = cleanPositiveInt(request.body.pickupLocationId, 'Pickup');
  const dropoffLocationId = cleanPositiveInt(request.body.dropoffLocationId, 'Drop-off');
  const scheduledFor = request.body.scheduledFor || null;
  const vehicleType = cleanEnum(request.body.vehicleType, ['economy', 'premium', 'bike'], 'vehicle type');
  const promoCode = request.body.promoCode ? cleanString(request.body.promoCode, 'Promo code', 50) : null;
  const paymentMethod = cleanEnum(request.body.paymentMethod, ['cash', 'wallet', 'card'], 'payment method');

  if (pickupLocationId === dropoffLocationId) {
    response.status(400).json({ error: 'Pickup and drop-off must be different.' });
    return;
  }

  const result = await transaction(async (connection) => {
    const { fare, route } = await getFare(connection, {
      pickupLocationId,
      dropoffLocationId,
      vehicleType,
      promoCode
    });

    if (paymentMethod === 'wallet') {
      const [walletRows] = await connection.execute(
        'SELECT balance FROM user_wallets WHERE user_id = ?',
        [request.user.userId]
      );

      if (cleanNumber(walletRows[0]?.balance) < cleanNumber(fare.finalFare)) {
        throw appError('Wallet balance is too low for this ride.', 409);
      }
    }

    const [promoRows] = promoCode
      ? await connection.execute(
        'SELECT promo_code_id FROM promocodes WHERE code = ? AND is_active = TRUE LIMIT 1',
        [promoCode]
      )
      : [[]];

    const match = await findNearestDriver(connection, pickupLocationId, vehicleType);

    const [insertResult] = await connection.execute(`
      INSERT INTO rides (
        rider_id,
        driver_id,
        vehicle_id,
        pickup_location_id,
        dropoff_location_id,
        ride_status,
        scheduled_for,
        distance_km,
        duration_min,
        fare,
        final_fare,
        promo_code_id,
        payment_method
      ) VALUES (?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, ?, ?)
    `, [
      request.user.userId,
      match?.driver_id || null,
      match?.vehicle_id || null,
      pickupLocationId,
      dropoffLocationId,
      scheduledFor || null,
      route.distance_km,
      route.duration_min,
      fare.baseFare,
      fare.finalFare,
      promoRows[0]?.promo_code_id || null,
      paymentMethod
    ]);

    return {
      rideId: insertResult.insertId,
      assignedDriverId: match?.driver_id || null,
      assignedVehicleId: match?.vehicle_id || null,
      fare,
      route
    };
  });

  response.status(201).json(result);
}));

app.post('/api/rider/rides/:rideId/cancel', requireAuth('rider'), asyncRoute(async (request, response) => {
  const result = await query(`
    UPDATE rides
    SET ride_status = 'cancelled'
    WHERE ride_id = ?
      AND rider_id = ?
      AND ride_status IN ('requested', 'accepted', 'driver_en_route')
  `, [request.params.rideId, request.user.userId]);

  if (result.affectedRows === 0) {
    response.status(409).json({ error: 'Ride cannot be cancelled at this stage.' });
    return;
  }

  response.json({ ok: true });
}));

app.post('/api/rider/rides/:rideId/driver-rating', requireAuth('rider'), asyncRoute(async (request, response) => {
  const score = Number(request.body.score);
  const comment = String(request.body.comment || '').trim();

  if (!Number.isInteger(score) || score < 1 || score > 5) {
    response.status(400).json({ error: 'Rating must be between 1 and 5 stars.' });
    return;
  }

  if (comment.length > 500) {
    response.status(400).json({ error: 'Rating comment must be 500 characters or less.' });
    return;
  }

  const result = await transaction(async (connection) => {
    const [rides] = await connection.execute(`
      SELECT
        r.ride_id,
        r.driver_id,
        driver_user.user_id AS driver_user_id
      FROM rides r
      JOIN drivers d
        ON d.driver_id = r.driver_id
      JOIN users driver_user
        ON driver_user.user_id = d.user_id
      WHERE r.ride_id = ?
        AND r.rider_id = ?
        AND r.ride_status = 'completed'
      LIMIT 1
    `, [request.params.rideId, request.user.userId]);

    if (rides.length === 0) {
      throw appError('Only completed rides with an assigned driver can be rated.', 409);
    }

    try {
      const [insertResult] = await connection.execute(`
        INSERT INTO ratings (
          ride_id,
          rated_by_user_id,
          rated_user_id,
          score,
          comment
        ) VALUES (?, ?, ?, ?, ?)
      `, [
        rides[0].ride_id,
        request.user.userId,
        rides[0].driver_user_id,
        score,
        comment || null
      ]);

      return { ratingId: insertResult.insertId };
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw appError('You have already rated this driver for this ride.', 409);
      }

      throw error;
    }
  });

  response.status(201).json(result);
}));

app.get('/api/driver/dashboard', requireAuth('driver'), asyncRoute(async (request, response) => {
  const driverId = request.user.driverId;

  const [profileRows, vehicleRows, pendingRequestsRaw, activeTrips, tripHistory, earningRows] = await Promise.all([
    query(`
      SELECT
        d.driver_id,
        d.availability_status,
        d.verification_status,
        d.current_city,
        d.current_location_id,
        loc.address AS current_location_address,
        d.total_trips_completed,
        d.average_rating,
        u.full_name,
        u.email,
        u.account_status
      FROM drivers d
      JOIN users u
        ON u.user_id = d.user_id
      LEFT JOIN locations loc
        ON loc.location_id = d.current_location_id
      WHERE d.driver_id = ?
    `, [driverId]),
    query(`
      SELECT *
      FROM vehicles
      WHERE driver_id = ?
      ORDER BY vehicle_id DESC
    `, [driverId]),
    query(`
      SELECT
        r.ride_id,
        r.driver_id,
        r.pickup_location_id,
        r.dropoff_location_id,
        r.promo_code_id,
        rider.full_name AS rider_name,
        pickup.address AS pickup_address,
        pickup.city AS pickup_city,
        dropoff.address AS dropoff_address,
        dropoff.city AS dropoff_city,
        r.distance_km,
        r.duration_min,
        r.fare,
        r.final_fare,
        r.payment_method,
        r.requested_at
      FROM rides r
      JOIN users rider
        ON rider.user_id = r.rider_id
      JOIN locations pickup
        ON pickup.location_id = r.pickup_location_id
      JOIN locations dropoff
        ON dropoff.location_id = r.dropoff_location_id
      WHERE r.ride_status = 'requested'
        AND (
          r.driver_id = ?
          OR (r.driver_id IS NULL AND pickup.city = (SELECT current_city FROM drivers WHERE driver_id = ?))
        )
        AND NOT EXISTS (
          SELECT 1
          FROM ride_driver_rejections rdr
          WHERE rdr.ride_id = r.ride_id
            AND rdr.driver_id = ?
        )
      ORDER BY r.requested_at ASC
    `, [driverId, driverId, driverId]),
    query(`
      SELECT
        r.ride_id,
        r.ride_status,
        rider.full_name AS rider_name,
        pickup.address AS pickup_address,
        pickup.city AS pickup_city,
        dropoff.address AS dropoff_address,
        dropoff.city AS dropoff_city,
        r.final_fare,
        r.payment_method,
        r.requested_at
      FROM rides r
      JOIN users rider
        ON rider.user_id = r.rider_id
      JOIN locations pickup
        ON pickup.location_id = r.pickup_location_id
      JOIN locations dropoff
        ON dropoff.location_id = r.dropoff_location_id
      WHERE r.driver_id = ?
        AND r.ride_status IN ('accepted', 'driver_en_route', 'in_progress')
      ORDER BY r.requested_at DESC
    `, [driverId]),
    query(`
      SELECT
        r.ride_id,
        r.ride_status,
        rider.full_name AS rider_name,
        pickup.city AS pickup_city,
        dropoff.city AS dropoff_city,
        r.final_fare,
        r.payment_method,
        p.driver_net_earning,
        p.payment_status,
        r.requested_at
      FROM rides r
      JOIN users rider
        ON rider.user_id = r.rider_id
      JOIN locations pickup
        ON pickup.location_id = r.pickup_location_id
      JOIN locations dropoff
        ON dropoff.location_id = r.dropoff_location_id
      LEFT JOIN payments p
        ON p.ride_id = r.ride_id
      WHERE r.driver_id = ?
        AND r.ride_status IN ('completed', 'cancelled')
      ORDER BY r.requested_at DESC
    `, [driverId]),
    query(`
      SELECT
        ROUND(IFNULL(SUM(p.driver_net_earning), 0), 2) AS total_earnings,
        ROUND(IFNULL(SUM(p.amount - IFNULL(p.driver_net_earning, 0)), 0), 2) AS platform_commission,
        COUNT(p.payment_id) AS paid_trip_count
      FROM payments p
      JOIN rides r
        ON r.ride_id = p.ride_id
      WHERE r.driver_id = ?
        AND p.payment_status = 'paid'
    `, [driverId])
  ]);

  const verifiedTypes = new Set(
    vehicleRows
      .filter((vehicle) => vehicle.verification_status === 'verified')
      .map((vehicle) => vehicle.vehicle_type)
  );

  let pendingRequests = pendingRequestsRaw;

  if (pendingRequestsRaw.some((ride) => !ride.driver_id)) {
    await transaction(async (connection) => {
      pendingRequests = await Promise.all(pendingRequestsRaw.map(async (ride) => {
        if (ride.driver_id) {
          return ride;
        }

        const [promoRows] = ride.promo_code_id
          ? await connection.execute('SELECT code FROM promocodes WHERE promo_code_id = ? LIMIT 1', [ride.promo_code_id])
          : [[]];

        const vehicleType = await inferVehicleTypeForRide(connection, {
          ...ride,
          promo_code: promoRows[0]?.code || null
        });

        return {
          ...ride,
          vehicle_type: vehicleType
        };
      }));
    });

    pendingRequests = pendingRequests.filter((ride) => (
      ride.driver_id || (ride.vehicle_type && verifiedTypes.has(ride.vehicle_type))
    ));
  }

  response.json({
    profile: profileRows[0],
    vehicles: vehicleRows,
    pendingRequests,
    activeTrips,
    tripHistory,
    earnings: earningRows[0]
  });
}));

app.patch('/api/driver/availability', requireAuth('driver'), asyncRoute(async (request, response) => {
  const status = request.body.status;

  if (!['online', 'offline'].includes(status)) {
    response.status(400).json({ error: 'Availability must be online or offline.' });
    return;
  }

  const rows = await query(`
    SELECT
      d.verification_status,
      COUNT(v.vehicle_id) AS verified_vehicle_count
    FROM drivers d
    LEFT JOIN vehicles v
      ON v.driver_id = d.driver_id
     AND v.verification_status = 'verified'
    WHERE d.driver_id = ?
    GROUP BY d.driver_id, d.verification_status
  `, [request.user.driverId]);

  if (rows[0].verification_status !== 'verified' || rows[0].verified_vehicle_count === 0) {
    response.status(409).json({ error: 'Admin verification is required before going online.' });
    return;
  }

  const activeRows = await query(`
    SELECT COUNT(*) AS active_count
    FROM rides
    WHERE driver_id = ?
      AND ride_status IN ('accepted', 'driver_en_route', 'in_progress')
  `, [request.user.driverId]);

  if (activeRows[0].active_count > 0) {
    response.status(409).json({ error: 'Complete active trips before changing availability.' });
    return;
  }

  await query(
    'UPDATE drivers SET availability_status = ? WHERE driver_id = ?',
    [status, request.user.driverId]
  );

  response.json({ availabilityStatus: status });
}));

app.patch('/api/driver/location', requireAuth('driver'), asyncRoute(async (request, response) => {
  const city = cleanString(request.body.city, 'City', 100);
  const currentLocationId = cleanPositiveInt(request.body.currentLocationId, 'Driver location');

  const activeRows = await query(`
    SELECT COUNT(*) AS active_count
    FROM rides
    WHERE driver_id = ?
      AND ride_status IN ('accepted', 'driver_en_route', 'in_progress')
  `, [request.user.driverId]);

  if (activeRows[0].active_count > 0) {
    response.status(409).json({ error: 'Complete active trips before changing your work area.' });
    return;
  }

  const locationRows = await query(`
    SELECT location_id, address, city
    FROM locations
    WHERE location_id = ?
      AND city = ?
    LIMIT 1
  `, [currentLocationId, city]);

  if (locationRows.length === 0) {
    response.status(400).json({ error: 'Choose a location from the selected city.' });
    return;
  }

  await query(`
    UPDATE drivers
    SET current_city = ?,
        current_location_id = ?
    WHERE driver_id = ?
  `, [city, currentLocationId, request.user.driverId]);

  response.json({
    city,
    currentLocationId,
    address: locationRows[0].address
  });
}));

app.post('/api/driver/rides/:rideId/accept', requireAuth('driver'), asyncRoute(async (request, response) => {
  await transaction(async (connection) => {
    const [rides] = await connection.execute(`
      SELECT
        r.ride_id,
        r.driver_id,
        r.pickup_location_id,
        r.dropoff_location_id,
        r.promo_code_id,
        r.fare,
        r.final_fare,
        pickup.city AS pickup_city
      FROM rides r
      JOIN locations pickup
        ON pickup.location_id = r.pickup_location_id
      WHERE r.ride_id = ?
        AND r.ride_status = 'requested'
      LIMIT 1
    `, [request.params.rideId]);

    if (rides.length === 0) {
      throw appError('Ride request not found.', 404);
    }

    const ride = rides[0];

    if (ride.driver_id && ride.driver_id !== request.user.driverId) {
      throw appError('Ride request is assigned to another driver.', 409);
    }

    if (!ride.driver_id) {
      const [driverRows] = await connection.execute(
        'SELECT current_city FROM drivers WHERE driver_id = ? LIMIT 1',
        [request.user.driverId]
      );

      if (driverRows.length === 0) {
        throw appError('Driver profile not found.', 404);
      }

      if (driverRows[0].current_city !== ride.pickup_city) {
        throw appError('Ride request is outside your current city.', 409);
      }

      const [promoRows] = ride.promo_code_id
        ? await connection.execute('SELECT code FROM promocodes WHERE promo_code_id = ? LIMIT 1', [ride.promo_code_id])
        : [[]];

      const vehicleType = await inferVehicleTypeForRide(connection, {
        ...ride,
        promo_code: promoRows[0]?.code || null
      });

      if (!vehicleType) {
        throw appError('Unable to match a vehicle type for this ride.', 409);
      }

      const [vehicleRows] = await connection.execute(`
        SELECT vehicle_id
        FROM vehicles
        WHERE driver_id = ?
          AND verification_status = 'verified'
          AND vehicle_type = ?
        ORDER BY vehicle_id DESC
        LIMIT 1
      `, [request.user.driverId, vehicleType]);

      if (vehicleRows.length === 0) {
        throw appError('No verified vehicle matches this ride type.', 409);
      }

      const [claimResult] = await connection.execute(`
        UPDATE rides
        SET driver_id = ?,
            vehicle_id = ?,
            ride_status = 'accepted'
        WHERE ride_id = ?
          AND ride_status = 'requested'
          AND driver_id IS NULL
      `, [request.user.driverId, vehicleRows[0].vehicle_id, ride.ride_id]);

      if (claimResult.affectedRows === 0) {
        throw appError('Ride request is no longer available.', 409);
      }

      return;
    }

    const [result] = await connection.execute(`
      UPDATE rides
      SET ride_status = 'accepted'
      WHERE ride_id = ?
        AND driver_id = ?
        AND ride_status = 'requested'
    `, [request.params.rideId, request.user.driverId]);

    if (result.affectedRows === 0) {
      throw appError('No assigned ride request found.', 404);
    }
  });

  response.json({ ok: true });
}));

app.post('/api/driver/rides/:rideId/reject', requireAuth('driver'), asyncRoute(async (request, response) => {
  const result = await transaction(async (connection) => {
    const [rides] = await connection.execute(`
      SELECT
        r.ride_id,
        r.driver_id,
        r.pickup_location_id,
        r.dropoff_location_id,
        r.promo_code_id,
        r.fare,
        r.final_fare,
        pickup.city AS pickup_city,
        v.vehicle_type,
        pc.code AS promo_code
      FROM rides r
      JOIN locations pickup
        ON pickup.location_id = r.pickup_location_id
      LEFT JOIN vehicles v
        ON v.vehicle_id = r.vehicle_id
      LEFT JOIN promocodes pc
        ON pc.promo_code_id = r.promo_code_id
      WHERE r.ride_id = ?
        AND r.ride_status = 'requested'
      LIMIT 1
    `, [request.params.rideId]);

    if (rides.length === 0) {
      throw appError('Ride request not found.', 404);
    }

    const ride = rides[0];

    if (ride.driver_id && ride.driver_id !== request.user.driverId) {
      throw appError('Ride request is assigned to another driver.', 409);
    }

    await connection.execute(`
      INSERT INTO ride_driver_rejections (ride_id, driver_id)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE rejected_at = CURRENT_TIMESTAMP
    `, [ride.ride_id, request.user.driverId]);

    if (!ride.driver_id) {
      const [driverRows] = await connection.execute(
        'SELECT current_city FROM drivers WHERE driver_id = ? LIMIT 1',
        [request.user.driverId]
      );

      if (driverRows.length === 0) {
        throw appError('Driver profile not found.', 404);
      }

      if (driverRows[0].current_city !== ride.pickup_city) {
        throw appError('Ride request is outside your current city.', 409);
      }

      return { declined: true, reassignedDriverId: null, reassignedVehicleId: null };
    }

    const vehicleType = ride.vehicle_type || await inferVehicleTypeForRide(connection, ride);

    if (!vehicleType) {
      throw appError('Unable to identify this ride vehicle type.', 409);
    }

    const nextDriver = await findNearestDriver(
      connection,
      ride.pickup_location_id,
      vehicleType,
      request.user.driverId,
      ride.ride_id
    );

    await connection.execute(`
      UPDATE rides
      SET driver_id = ?, vehicle_id = ?
      WHERE ride_id = ?
    `, [
      nextDriver?.driver_id || null,
      nextDriver?.vehicle_id || null,
      ride.ride_id
    ]);

    return {
      declined: true,
      reassignedDriverId: nextDriver?.driver_id || null,
      reassignedVehicleId: nextDriver?.vehicle_id || null
    };
  });

  response.json(result);
}));

app.patch('/api/driver/rides/:rideId/status', requireAuth('driver'), asyncRoute(async (request, response) => {
  const { status } = request.body;
  const allowed = {
    accepted: ['driver_en_route'],
    driver_en_route: ['in_progress'],
    in_progress: ['completed']
  };

  await transaction(async (connection) => {
    const [rides] = await connection.execute(`
      SELECT
        r.*,
        GREATEST(COALESCE(r.fare - r.final_fare, 0), 0) AS discount_applied
      FROM rides r
      WHERE r.ride_id = ?
        AND r.driver_id = ?
        AND r.ride_status IN ('accepted', 'driver_en_route', 'in_progress')
      LIMIT 1
    `, [request.params.rideId, request.user.driverId]);

    if (rides.length === 0) {
      throw appError('No active trip found.', 404);
    }

    const ride = rides[0];

    if (!allowed[ride.ride_status]?.includes(status)) {
      throw appError(`Cannot move ride from ${ride.ride_status} to ${status}.`);
    }

    if (status === 'completed') {
      await completeRideWithPayment(connection, ride);
    } else {
      await connection.execute(
        'UPDATE rides SET ride_status = ? WHERE ride_id = ?',
        [status, ride.ride_id]
      );
    }
  });

  response.json({ ok: true });
}));

app.get('/api/admin/dashboard', requireAuth('admin'), asyncRoute(async (request, response) => {
  const [
    metricRows,
    users,
    drivers,
    vehicles,
    fareRules,
    revenueByCity,
    driverEarnings,
    paymentMethods,
    activeRides,
    flags,
    refundDisputes
  ] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS total_users,
        (SELECT COUNT(*) FROM users WHERE role = 'rider') AS total_riders,
        (SELECT COUNT(*) FROM drivers) AS total_drivers,
        (SELECT COUNT(*) FROM drivers WHERE verification_status = 'pending') AS pending_drivers,
        (SELECT COUNT(*) FROM vehicles WHERE verification_status = 'pending') AS pending_vehicles,
        (SELECT COUNT(*) FROM rides) AS total_rides,
        (SELECT COUNT(*) FROM rides WHERE ride_status = 'completed') AS completed_rides,
        (SELECT COUNT(*) FROM rides WHERE ride_status IN ('accepted', 'driver_en_route', 'in_progress')) AS active_rides,
        (SELECT ROUND(IFNULL(SUM(amount), 0), 2) FROM payments WHERE payment_status = 'paid') AS total_revenue,
        (SELECT ROUND(IFNULL(SUM(amount - IFNULL(driver_net_earning, 0)), 0), 2) FROM payments WHERE payment_status = 'paid') AS platform_commission
    `),
    query(`
      SELECT user_id, full_name, email, phone, role, account_status, registration_date
      FROM users
      ORDER BY registration_date DESC
    `),
    query(`
      SELECT
        d.driver_id,
        u.full_name,
        u.email,
        d.license_number,
        d.national_id,
        d.current_city,
        d.verification_status,
        d.availability_status,
        d.total_trips_completed,
        d.average_rating
      FROM drivers d
      JOIN users u
        ON u.user_id = d.user_id
      ORDER BY d.verification_status = 'pending' DESC, d.driver_id DESC
    `),
    query(`
      SELECT
        v.vehicle_id,
        v.driver_id,
        driver_user.full_name AS driver_name,
        v.make,
        v.model,
        v.year,
        v.color,
        v.license_plate,
        v.vehicle_type,
        v.verification_status
      FROM vehicles v
      JOIN drivers d
        ON d.driver_id = v.driver_id
      JOIN users driver_user
        ON driver_user.user_id = d.user_id
      ORDER BY v.verification_status = 'pending' DESC, v.vehicle_id DESC
    `),
    query('SELECT * FROM fare_rules ORDER BY city, vehicle_type'),
    query(`
      SELECT
        city,
        ROUND(SUM(gross_revenue), 2) AS gross_revenue,
        ROUND(SUM(total_driver_earnings), 2) AS driver_earnings,
        ROUND(SUM(total_commission), 2) AS platform_commission
      FROM vw_revenue_by_city_day
      GROUP BY city
      ORDER BY gross_revenue DESC
    `),
    query(`
      SELECT
        d.driver_id,
        u.full_name AS driver_name,
        ROUND(IFNULL(SUM(p.driver_net_earning), 0), 2) AS total_earnings,
        ROUND(IFNULL(SUM(p.amount - IFNULL(p.driver_net_earning, 0)), 0), 2) AS commission,
        COUNT(p.payment_id) AS paid_trips
      FROM drivers d
      JOIN users u
        ON u.user_id = d.user_id
      LEFT JOIN rides r
        ON r.driver_id = d.driver_id
      LEFT JOIN payments p
        ON p.ride_id = r.ride_id
       AND p.payment_status = 'paid'
      GROUP BY d.driver_id, u.full_name
      ORDER BY total_earnings DESC
    `),
    query('SELECT * FROM vw_revenue_by_payment_method ORDER BY gross_revenue DESC'),
    query('SELECT * FROM ActiveRidesView ORDER BY requested_at DESC'),
    query(`
      SELECT
        f.flag_id,
        u.full_name AS driver_name,
        f.current_average_rating,
        f.reason,
        f.created_at
      FROM driver_review_flags f
      JOIN drivers d
        ON d.driver_id = f.driver_id
      JOIN users u
        ON u.user_id = d.user_id
      WHERE f.is_resolved = FALSE
      ORDER BY f.created_at DESC
    `),
    query('SELECT * FROM vw_refund_dispute_totals')
  ]);

  response.json({
    metrics: metricRows[0],
    users,
    drivers,
    vehicles,
    fareRules,
    reports: {
      revenueByCity,
      driverEarnings,
      paymentMethods,
      activeRides,
      flags,
      refundDisputes: refundDisputes[0] || {}
    }
  });
}));

app.post('/api/admin/users', requireAuth('admin'), asyncRoute(async (request, response) => {
  const fullName = cleanString(request.body.fullName, 'Full name');
  const email = cleanEmail(request.body.email);
  const phone = cleanString(request.body.phone, 'Phone', 30);
  const password = cleanPassword(request.body.password);
  const role = cleanEnum(request.body.role, ['rider', 'driver', 'admin'], 'role');

  const result = await query(`
    INSERT INTO users (full_name, email, phone, password_hash, role)
    VALUES (?, ?, ?, SHA2(?, 256), ?)
  `, [fullName, email, phone, password, role]);

  if (role === 'rider') {
    await query('INSERT INTO user_wallets (user_id, balance) VALUES (?, 0)', [result.insertId]);
  }

  response.status(201).json({ userId: result.insertId });
}));

app.patch('/api/admin/users/:userId/status', requireAuth('admin'), asyncRoute(async (request, response) => {
  const status = request.body.status;

  if (!['active', 'suspended', 'banned'].includes(status)) {
    response.status(400).json({ error: 'Invalid account status.' });
    return;
  }

  await query(
    'UPDATE users SET account_status = ? WHERE user_id = ?',
    [status, request.params.userId]
  );

  response.json({ ok: true });
}));

app.patch('/api/admin/drivers/:driverId', requireAuth('admin'), asyncRoute(async (request, response) => {
  const status = request.body.verificationStatus;

  if (!['pending', 'verified', 'rejected'].includes(status)) {
    response.status(400).json({ error: 'Invalid driver verification status.' });
    return;
  }

  await query(
    'UPDATE drivers SET verification_status = ? WHERE driver_id = ?',
    [status, request.params.driverId]
  );

  response.json({ ok: true });
}));

app.patch('/api/admin/vehicles/:vehicleId', requireAuth('admin'), asyncRoute(async (request, response) => {
  const status = request.body.verificationStatus;

  if (!['pending', 'verified', 'rejected'].includes(status)) {
    response.status(400).json({ error: 'Invalid vehicle verification status.' });
    return;
  }

  await query(
    'UPDATE vehicles SET verification_status = ? WHERE vehicle_id = ?',
    [status, request.params.vehicleId]
  );

  response.json({ ok: true });
}));

app.post('/api/admin/fare-rules', requireAuth('admin'), asyncRoute(async (request, response) => {
  const city = cleanString(request.body.city, 'City', 100);
  const vehicleType = cleanEnum(request.body.vehicleType, ['economy', 'premium', 'bike'], 'vehicle type');
  const baseRate = cleanNumber(request.body.baseRate);
  const perKmRate = cleanNumber(request.body.perKmRate);
  const perMinRate = cleanNumber(request.body.perMinRate);
  const surgeMultiplier = cleanNumber(request.body.surgeMultiplier, 1);
  const commissionRate = cleanNumber(request.body.commissionRate, 0.2);

  if (baseRate < 0 || perKmRate < 0 || perMinRate < 0 || surgeMultiplier < 1 || commissionRate < 0 || commissionRate > 1) {
    response.status(400).json({ error: 'Fare rule values are outside the allowed range.' });
    return;
  }

  const result = await query(`
    INSERT INTO fare_rules (
      city,
      vehicle_type,
      base_rate,
      per_km_rate,
      per_min_rate,
      surge_multiplier,
      commission_rate,
      is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)
  `, [
    city,
    vehicleType,
    baseRate,
    perKmRate,
    perMinRate,
    surgeMultiplier,
    commissionRate
  ]);

  response.status(201).json({ fareRuleId: result.insertId });
}));

app.patch('/api/admin/fare-rules/:fareRuleId', requireAuth('admin'), asyncRoute(async (request, response) => {
  const baseRate = cleanNumber(request.body.baseRate);
  const perKmRate = cleanNumber(request.body.perKmRate);
  const perMinRate = cleanNumber(request.body.perMinRate);
  const surgeMultiplier = cleanNumber(request.body.surgeMultiplier, 1);
  const commissionRate = cleanNumber(request.body.commissionRate, 0.2);
  const isActive = Boolean(request.body.isActive);

  if (baseRate < 0 || perKmRate < 0 || perMinRate < 0 || surgeMultiplier < 1 || commissionRate < 0 || commissionRate > 1) {
    response.status(400).json({ error: 'Fare rule values are outside the allowed range.' });
    return;
  }

  await query(`
    UPDATE fare_rules
    SET
      base_rate = ?,
      per_km_rate = ?,
      per_min_rate = ?,
      surge_multiplier = ?,
      commission_rate = ?,
      is_active = ?
    WHERE fare_rule_id = ?
  `, [
    baseRate,
    perKmRate,
    perMinRate,
    surgeMultiplier,
    commissionRate,
    isActive,
    request.params.fareRuleId
  ]);

  response.json({ ok: true });
}));

app.use((error, request, response, next) => {
  const duplicateEntry = error.code === 'ER_DUP_ENTRY';
  const status = error.statusCode || (duplicateEntry ? 409 : 500);

  if (status >= 500) {
    console.error(error);
  }

  response.status(status).json({
    error: error.statusCode
      ? error.message
      : duplicateEntry
        ? 'A record with those details already exists.'
        : 'Something went wrong. Please try again.'
  });
});

app.listen(port, () => {
  console.log(`RideFlow app running at http://localhost:${port}`);
});
