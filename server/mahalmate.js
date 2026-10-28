const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const cors = require("cors");
const dotenv = require("dotenv");
const express = require("express");
const session = require("express-session");
const MySQLStoreFactory = require("express-mysql-session");
const mysql = require("mysql2/promise");
const { XMLBuilder } = require("fast-xml-parser");

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 5000);
const databaseName = process.env.MAHALMATE_DB_NAME || "mahalmate";
if (!/^[A-Za-z0-9_]+$/.test(databaseName)) {
  throw new Error("MAHALMATE_DB_NAME may contain only letters, numbers, and underscores.");
}

const dbConfig = {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};
const pool = mysql.createPool({ ...dbConfig, database: databaseName, dateStrings: ["DATE"] });
const clientOrigins = (process.env.CLIENT_ORIGIN || process.env.CLIENT_ORIGINS || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const sessionSecret =
  process.env.SESSION_SECRET || crypto.randomBytes(48).toString("hex");
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000,
  },
  pool,
);
const xmlBuilder = new XMLBuilder({ format: true, suppressEmptyNode: true });

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || clientOrigins.includes(origin)) callback(null, true);
    else callback(new Error("This origin is not allowed by CORS."));
  },
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) req.body = {};
  next();
});
app.use(
  session({
    name: "mahalmate.sid",
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

let schemaInitialization;
app.use((req, res, next) => {
  schemaInitialization ||= initializeSchema();
  schemaInitialization.then(() => next()).catch(next);
});

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requiredText(value, label, max = 255) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, `${label} is required.`);
  }
  const result = value.trim();
  if (result.length > max) throw new HttpError(400, `${label} is too long.`);
  return result;
}

function parseId(value) {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    throw new HttpError(400, "Please provide a valid ID.");
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id)) throw new HttpError(400, "Please provide a valid ID.");
  return id;
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isPastDate(value) {
  return value < new Date().toISOString().slice(0, 10);
}

function validTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function moneyCents(value, label = "Price") {
  const normalized = String(value);
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new HttpError(400, `${label} must be a valid non-negative amount.`);
  }
  const amount = Number(normalized);
  if (!Number.isSafeInteger(Math.round(amount * 100))) {
    throw new HttpError(400, `${label} is outside the supported range.`);
  }
  return Math.round(amount * 100);
}

function centsToAmount(cents) {
  return (cents / 100).toFixed(2);
}

function sqlDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function sqlTime(value) {
  return String(value).slice(0, 8);
}

function parseServices(input) {
  if (input === undefined) return [];
  if (!Array.isArray(input) || input.length > 20) {
    throw new HttpError(400, "Choose valid additional services.");
  }
  const unique = new Set();
  return input.map((item) => {
    const id = Number(item?.service_id);
    const quantity = Number(item?.quantity ?? 1);
    if (!Number.isSafeInteger(id) || id < 1 || unique.has(id)) {
      throw new HttpError(400, "Choose valid additional services.");
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new HttpError(400, "Service quantities must be between 1 and 50.");
    }
    unique.add(id);
    return { id, quantity };
  });
}

function normalizeMahal(body) {
  const name = requiredText(body.name, "Mahal name", 160);
  const location = requiredText(body.location, "City or location", 120);
  const address = requiredText(body.address, "Address", 500);
  const description = requiredText(body.description, "Description", 5000);
  const capacityMin = Number(body.capacity_min);
  const capacityMax = Number(body.capacity_max);
  const parkingCapacity = Number(body.parking_capacity || 0);
  const basePriceCents = moneyCents(body.base_price, "Base price");
  if (
    !Number.isSafeInteger(capacityMin) || capacityMin < 1 ||
    !Number.isSafeInteger(capacityMax) || capacityMax < capacityMin ||
    capacityMax > 100000
  ) throw new HttpError(400, "Enter a valid guest capacity range.");
  if (!Number.isSafeInteger(parkingCapacity) || parkingCapacity < 0 || parkingCapacity > 100000) {
    throw new HttpError(400, "Enter a valid parking capacity.");
  }
  const amenities = Array.isArray(body.amenities)
    ? body.amenities.map((item) => requiredText(item, "Amenity", 80)).slice(0, 30)
    : [];
  return {
    name, location, address, description, capacityMin, capacityMax,
    basePrice: centsToAmount(basePriceCents),
    priceType: body.price_type === "day" ? "day" : "booking",
    amenities: JSON.stringify(amenities),
    parkingCapacity,
    acAvailable: body.ac_available === true || body.ac_available === "true" ? 1 : 0,
    accommodationAvailable:
      body.accommodation_available === true || body.accommodation_available === "true" ? 1 : 0,
    imageUrl: typeof body.image_url === "string" && body.image_url.trim()
      ? requiredText(body.image_url, "Image URL", 1000)
      : null,
    contactPhone: typeof body.contact_phone === "string" && body.contact_phone.trim()
      ? requiredText(body.contact_phone, "Contact phone", 30)
      : null,
  };
}

function normalizeService(body) {
  const name = requiredText(body.name, "Service name", 120);
  const description = requiredText(body.description, "Description", 1000);
  return { name, description, price: centsToAmount(moneyCents(body.price)) };
}

async function ensureDatabase() {
  const bootstrap = await mysql.createConnection(dbConfig);
  try {
    await bootstrap.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await bootstrap.end();
  }
}

async function initializeSchema() {
  await ensureDatabase();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'customer',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY users_email_unique (email)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS function_types (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(500) NOT NULL,
      image_url VARCHAR(1000) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY function_types_name_unique (name)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mahals (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      location VARCHAR(120) NOT NULL,
      address VARCHAR(500) NOT NULL,
      description TEXT NOT NULL,
      capacity_min INT UNSIGNED NOT NULL,
      capacity_max INT UNSIGNED NOT NULL,
      base_price DECIMAL(12,2) NOT NULL,
      price_type ENUM('day','booking') NOT NULL DEFAULT 'booking',
      amenities JSON NOT NULL,
      parking_capacity INT UNSIGNED NOT NULL DEFAULT 0,
      ac_available TINYINT(1) NOT NULL DEFAULT 0,
      accommodation_available TINYINT(1) NOT NULL DEFAULT 0,
      image_url VARCHAR(1000) NULL,
      contact_phone VARCHAR(30) NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY mahals_search_idx (active, location, base_price),
      CONSTRAINT mahals_capacity_check CHECK (capacity_max >= capacity_min)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS services (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      description VARCHAR(1000) NOT NULL,
      price DECIMAL(12,2) NOT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      UNIQUE KEY services_name_unique (name)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      booking_reference VARCHAR(32) NOT NULL,
      user_id BIGINT UNSIGNED NOT NULL,
      mahal_id BIGINT UNSIGNED NOT NULL,
      function_type_id INT UNSIGNED NOT NULL,
      booking_date DATE NOT NULL,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      guest_count INT UNSIGNED NOT NULL,
      special_requirements TEXT NULL,
      subtotal DECIMAL(12,2) NOT NULL,
      extra_charges DECIMAL(12,2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(12,2) NOT NULL,
      status ENUM('pending','confirmed','rejected','cancelled') NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY bookings_reference_unique (booking_reference),
      KEY bookings_availability_idx (mahal_id, booking_date, status),
      KEY bookings_user_date_idx (user_id, booking_date),
      CONSTRAINT bookings_user_fk FOREIGN KEY (user_id) REFERENCES users(id),
      CONSTRAINT bookings_mahal_fk FOREIGN KEY (mahal_id) REFERENCES mahals(id),
      CONSTRAINT bookings_function_fk FOREIGN KEY (function_type_id) REFERENCES function_types(id)
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_services (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      booking_id BIGINT UNSIGNED NOT NULL,
      service_id INT UNSIGNED NOT NULL,
      quantity INT UNSIGNED NOT NULL,
      unit_price DECIMAL(12,2) NOT NULL,
      total_price DECIMAL(12,2) NOT NULL,
      UNIQUE KEY booking_service_unique (booking_id, service_id),
      CONSTRAINT booking_services_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      CONSTRAINT booking_services_service_fk FOREIGN KEY (service_id) REFERENCES services(id)
    ) ENGINE=InnoDB
  `);
  await seedData();
}

async function seedData() {
  const functions = [
    ["Marriage / Wedding", "A complete setting for your wedding celebration.", "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80"],
    ["Engagement", "An intimate space to celebrate your engagement.", "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80"],
    ["Haldi Ceremony", "A cheerful, sunlit setting for the haldi ceremony.", "https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=600&q=80"],
    ["Mehendi Ceremony", "A colorful space for a relaxed mehendi gathering.", "https://images.unsplash.com/photo-1519225421980-715cb0215aed?auto=format&fit=crop&w=600&q=80"],
    ["Reception", "A polished venue for welcoming family and friends.", "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=600&q=80"],
    ["Naming Ceremony", "A warm, family-friendly venue for a special welcome.", "https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=600&q=80"],
    ["Birthday / Family Function", "Flexible spaces for birthdays and family milestones.", "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=600&q=80"],
  ];
  for (const [name, description, image] of functions) {
    await pool.execute(
      "INSERT IGNORE INTO function_types (name, description, image_url) VALUES (?, ?, ?)",
      [name, description, image],
    );
  }
  const hallImage = "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1200&q=85";
  const halls = [
    ["[Sample] Royal Courtyard Mahal", "Chennai", "Sample listing · East Coast Road, Chennai", 150, 800, 185000, 120, 1, 1, ["Bridal suite", "In-house kitchen", "Stage", "Generator"], hallImage],
    ["[Sample] Saffron Leaf Convention Hall", "Bengaluru", "Sample listing · Whitefield, Bengaluru", 100, 600, 145000, 90, 1, 1, ["Dining hall", "Air conditioning", "Lift", "Audio system"], hallImage],
    ["[Sample] Lotus Pavilion", "Coimbatore", "Sample listing · Avinashi Road, Coimbatore", 80, 450, 98000, 75, 1, 0, ["Garden lawn", "Kitchen", "Decor lighting", "Stage"], hallImage],
    ["[Sample] Golden Banyan Function Hall", "Hyderabad", "Sample listing · Gachibowli, Hyderabad", 200, 1200, 265000, 180, 1, 1, ["Two halls", "Guest rooms", "Valet parking", "Generator"], hallImage],
    ["[Sample] Nila Heritage Mahal", "Madurai", "Sample listing · KK Nagar, Madurai", 100, 700, 132000, 100, 0, 1, ["Traditional mandap", "Dining hall", "Kitchen", "Guest rooms"], hallImage],
    ["[Sample] Marigold Garden Venue", "Mysuru", "Sample listing · Hunsur Road, Mysuru", 60, 350, 76000, 55, 1, 0, ["Garden", "Changing rooms", "Sound system", "Parking"], hallImage],
    ["[Sample] Pearl Grand Celebration Hall", "Tiruchirappalli", "Sample listing · Cantonment, Tiruchirappalli", 120, 900, 172000, 140, 1, 1, ["AC dining", "Accommodation", "Kitchen", "Backup power"], hallImage],
  ];
  for (const [name, location, address, min, max, price, parking, ac, rooms, amenities, image] of halls) {
    const [existing] = await pool.execute("SELECT id FROM mahals WHERE name = ? LIMIT 1", [name]);
    if (existing.length) continue;
    await pool.execute(
      `INSERT IGNORE INTO mahals
       (name, location, address, description, capacity_min, capacity_max, base_price, price_type,
        amenities, parking_capacity, ac_available, accommodation_available, image_url, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'booking', ?, ?, ?, ?, ?, 1)`,
      [name, location, address, `Clearly identified sample venue for demonstration only. ${name.replace("[Sample] ", "")} showcases an example of the information customers can compare.`, min, max, price, JSON.stringify(amenities), parking, ac, rooms, image],
    );
  }
  const services = [
    ["Basic floral decor", "Example floral decoration package.", 18000],
    ["Standard catering (per guest)", "Example catering service, priced per guest.", 650],
    ["Premium lighting", "Example stage and venue lighting package.", 12000],
    ["Additional event hour", "Example charge for one additional hour.", 8000],
    ["Welcome refreshments (per guest)", "Example welcome refreshments, priced per guest.", 120],
  ];
  for (const service of services) {
    await pool.execute(
      "INSERT IGNORE INTO services (name, description, price) VALUES (?, ?, ?)",
      service,
    );
  }
}

async function findSessionUser(req) {
  if (!req.session.userId) return null;
  const [rows] = await pool.execute(
    "SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?",
    [req.session.userId],
  );
  return rows[0] || null;
}

async function requireAuth(req, res, next) {
  try {
    const user = await findSessionUser(req);
    if (!user) throw new HttpError(401, "Please sign in to continue.");
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await findSessionUser(req);
    if (!user) throw new HttpError(401, "Please sign in to continue.");
    if (user.role !== "admin") throw new HttpError(403, "Administrator access is required.");
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => req.session.regenerate((err) => err ? reject(err) : resolve()));
}

function saveSession(req) {
  return new Promise((resolve, reject) => req.session.save((err) => err ? reject(err) : resolve()));
}

function destroySession(req) {
  return new Promise((resolve, reject) => req.session.destroy((err) => err ? reject(err) : resolve()));
}

async function bookingResult(id, userId) {
  const [rows] = await pool.execute(
    `SELECT b.*, u.name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
            m.name AS mahal_name, m.location AS mahal_location, m.address AS mahal_address,
            f.name AS function_name
     FROM bookings b JOIN users u ON u.id = b.user_id
     JOIN mahals m ON m.id = b.mahal_id JOIN function_types f ON f.id = b.function_type_id
     WHERE b.id = ?${userId ? " AND b.user_id = ?" : ""}`,
    userId ? [id, userId] : [id],
  );
  if (!rows[0]) throw new HttpError(404, "Booking not found.");
  const [services] = await pool.execute(
    `SELECT bs.service_id, s.name, bs.quantity, bs.unit_price, bs.total_price
     FROM booking_services bs JOIN services s ON s.id = bs.service_id
     WHERE bs.booking_id = ? ORDER BY s.name`,
    [id],
  );
  return { ...rows[0], services };
}

app.get("/", (req, res) => res.json({ message: "MahalMate API is ready." }));

app.post("/api/auth/register", async (req, res) => {
  const name = requiredText(req.body.name, "Full name", 120);
  const email = requiredText(req.body.email, "Email").toLowerCase();
  const phone = requiredText(req.body.phone, "Phone number", 30);
  const password = req.body.password;
  if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (!/^[+()\d\s.-]{7,30}$/.test(phone)) throw new HttpError(400, "Enter a valid phone number.");
  if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw new HttpError(400, "Password must be at least 8 characters and at most 72 bytes.");
  }
  if (req.body.confirm_password !== password) {
    throw new HttpError(400, "Passwords do not match.");
  }
  const hash = await bcrypt.hash(password, 12);
  let result;
  try {
    [result] = await pool.execute(
      "INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)",
      [name, email, phone, hash],
    );
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "An account with this email already exists.");
    throw error;
  }
  await regenerateSession(req);
  req.session.userId = result.insertId;
  await saveSession(req);
  res.status(201).json({ user: await findSessionUser(req) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = requiredText(req.body.email, "Email").toLowerCase();
  const password = req.body.password;
  if (!validEmail(email)) throw new HttpError(400, "Enter a valid email address.");
  if (typeof password !== "string" || !password) throw new HttpError(400, "Password is required.");
  const [rows] = await pool.execute(
    "SELECT id, password_hash FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  await regenerateSession(req);
  req.session.userId = rows[0].id;
  await saveSession(req);
  res.json({ user: await findSessionUser(req) });
});

app.post("/api/auth/logout", async (req, res) => {
  if (req.session) await destroySession(req);
  res.clearCookie("mahalmate.sid", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
  });
  res.status(204).end();
});

app.get("/api/auth/me", async (req, res) => {
  res.json({ user: await findSessionUser(req) });
});
app.get("/api/functions", async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT id, name, description, image_url FROM function_types WHERE active = 1 ORDER BY id",
  );
  res.json(rows);
});
app.get("/api/services", async (req, res) => {
  const [rows] = await pool.execute(
    "SELECT id, name, description, price FROM services WHERE active = 1 ORDER BY name",
  );
  res.json(rows);
});

app.get("/api/mahals", async (req, res) => {
  const conditions = ["m.active = 1"];
  const params = [];
  if (typeof req.query.location === "string" && req.query.location.trim()) {
    conditions.push("(m.location LIKE ? OR m.address LIKE ?)");
    params.push(`%${req.query.location.trim()}%`, `%${req.query.location.trim()}%`);
  }
  if (req.query.guests !== undefined) {
    const guests = Number(req.query.guests);
    if (!Number.isSafeInteger(guests) || guests < 1 || guests > 100000) throw new HttpError(400, "Enter a valid guest count.");
    conditions.push("m.capacity_min <= ? AND m.capacity_max >= ?");
    params.push(guests, guests);
  }
  for (const [key, column] of [["min_price", "m.base_price >= ?"], ["max_price", "m.base_price <= ?"]]) {
    if (req.query[key] !== undefined && req.query[key] !== "") {
      const cents = moneyCents(req.query[key], "Budget");
      conditions.push(column);
      params.push(centsToAmount(cents));
    }
  }
  if (req.query.ac === "true") conditions.push("m.ac_available = 1");
  if (req.query.parking === "true") conditions.push("m.parking_capacity > 0");
  if (req.query.accommodation === "true") conditions.push("m.accommodation_available = 1");
  if (req.query.function_id !== undefined) {
    const functionId = Number(req.query.function_id);
    if (!Number.isSafeInteger(functionId) || functionId < 1) throw new HttpError(400, "Choose a valid function type.");
  }
  const orderBy = req.query.sort === "price_desc"
    ? "m.base_price DESC"
    : req.query.sort === "name" ? "m.name ASC" : "m.base_price ASC";
  let sql = `SELECT m.id, m.name, m.location, m.address, m.description, m.capacity_min, m.capacity_max,
                    m.base_price, m.price_type, m.amenities, m.parking_capacity, m.ac_available,
                    m.accommodation_available, m.image_url, m.contact_phone
             FROM mahals m WHERE ${conditions.join(" AND ")}`;
  if (req.query.function_id !== undefined) {
    sql = sql.replace("FROM mahals m WHERE", `FROM mahals m WHERE EXISTS (
      SELECT 1 FROM function_types f WHERE f.id = ? AND f.active = 1
    ) AND`);
    params.unshift(Number(req.query.function_id));
  }
  if (req.query.date !== undefined && req.query.date !== "") {
    if (!validDate(req.query.date)) throw new HttpError(400, "Choose a valid booking date.");
    if (isPastDate(req.query.date)) throw new HttpError(400, "Booking date cannot be in the past.");
    sql += ` AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.mahal_id = m.id
      AND b.booking_date = ? AND b.status IN ('pending','confirmed'))`;
    params.push(req.query.date);
  }
  const [rows] = await pool.execute(`${sql} ORDER BY ${orderBy}`, params);
  res.json(rows);
});

app.get("/api/mahals/:id/availability", async (req, res) => {
  const id = parseId(req.params.id);
  const date = req.query.date;
  if (!validDate(date)) throw new HttpError(400, "Choose a valid booking date.");
  if (isPastDate(date)) throw new HttpError(400, "Booking date cannot be in the past.");
  const hasStart = req.query.start_time !== undefined;
  const hasEnd = req.query.end_time !== undefined;
  if (hasStart !== hasEnd) throw new HttpError(400, "Provide both a start and end time.");
  if (hasStart && (!validTime(req.query.start_time) || !validTime(req.query.end_time) || req.query.start_time >= req.query.end_time)) {
    throw new HttpError(400, "Choose a valid start and end time.");
  }
  const [mahalRows] = await pool.execute("SELECT id FROM mahals WHERE id = ? AND active = 1", [id]);
  if (!mahalRows[0]) throw new HttpError(404, "Mahal not found.");
  const [slots] = await pool.execute(
    `SELECT start_time, end_time FROM bookings
     WHERE mahal_id = ? AND booking_date = ? AND status IN ('pending','confirmed')
     ORDER BY start_time`,
    [id, date],
  );
  const available = hasStart
    ? !slots.some((slot) => String(slot.start_time) < req.query.end_time && String(slot.end_time) > req.query.start_time)
    : slots.length === 0;
  res.json({ date, available, booked_slots: slots });
});

app.get("/api/mahals/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [rows] = await pool.execute(
    `SELECT id, name, location, address, description, capacity_min, capacity_max, base_price,
            price_type, amenities, parking_capacity, ac_available, accommodation_available,
            image_url, contact_phone
     FROM mahals WHERE id = ? AND active = 1`,
    [id],
  );
  if (!rows[0]) throw new HttpError(404, "Mahal not found.");
  res.json(rows[0]);
});

app.post("/api/bookings", requireAuth, async (req, res) => {
  const mahalId = parseId(String(req.body.mahal_id || ""));
  const functionId = parseId(String(req.body.function_type_id || ""));
  const date = req.body.booking_date;
  const startTime = req.body.start_time;
  const endTime = req.body.end_time;
  const guestCount = Number(req.body.guest_count);
  const requirements = typeof req.body.special_requirements === "string"
    ? req.body.special_requirements.trim() : "";
  const selectedServices = parseServices(req.body.services);
  if (!validDate(date) || isPastDate(date)) {
    throw new HttpError(400, "Booking date must be today or later.");
  }
  if (!validTime(startTime) || !validTime(endTime) || startTime >= endTime) {
    throw new HttpError(400, "Choose a valid start and end time.");
  }
  if (!Number.isSafeInteger(guestCount) || guestCount < 1 || guestCount > 100000) {
    throw new HttpError(400, "Enter a valid expected guest count.");
  }
  if (requirements.length > 3000) throw new HttpError(400, "Special requirements are too long.");

  const connection = await pool.getConnection();
  let bookingId;
  try {
    await connection.beginTransaction();
    const [mahals] = await connection.execute(
      "SELECT id, capacity_min, capacity_max, base_price FROM mahals WHERE id = ? AND active = 1 FOR UPDATE",
      [mahalId],
    );
    if (!mahals[0]) throw new HttpError(404, "Mahal not found.");
    if (guestCount < mahals[0].capacity_min || guestCount > mahals[0].capacity_max) {
      throw new HttpError(400, `Guest count must be between ${mahals[0].capacity_min} and ${mahals[0].capacity_max} for this mahal.`);
    }
    const [functions] = await connection.execute(
      "SELECT id FROM function_types WHERE id = ? AND active = 1",
      [functionId],
    );
    if (!functions[0]) throw new HttpError(400, "Choose a valid function type.");
    const [conflicts] = await connection.execute(
      `SELECT id FROM bookings WHERE mahal_id = ? AND booking_date = ?
       AND status IN ('pending','confirmed') AND start_time < ? AND end_time > ? LIMIT 1`,
      [mahalId, date, endTime, startTime],
    );
    if (conflicts.length) throw new HttpError(409, "This mahal is not available for the selected time. Please choose another slot.");

    let totalCents = moneyCents(mahals[0].base_price, "Base price");
    const pricedServices = [];
    for (const selected of selectedServices) {
      const [serviceRows] = await connection.execute(
        "SELECT id, name, price FROM services WHERE id = ? AND active = 1",
        [selected.id],
      );
      if (!serviceRows[0]) throw new HttpError(400, "One of the selected services is no longer available.");
      const unitCents = moneyCents(serviceRows[0].price);
      const quantity = serviceRows[0].name.toLowerCase().includes("(per guest)") ? guestCount : selected.quantity;
      const lineTotal = unitCents * quantity;
      if (!Number.isSafeInteger(lineTotal) || lineTotal > 100000000000) throw new HttpError(400, "Selected services exceed the supported total.");
      totalCents += lineTotal;
      pricedServices.push({ ...selected, quantity, unitPrice: unitCents, total: lineTotal });
    }
    if (!Number.isSafeInteger(totalCents) || totalCents > 100000000000) throw new HttpError(400, "Booking total exceeds the supported range.");
    const reference = `MM-${new Date().getUTCFullYear()}-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
    const baseCents = moneyCents(mahals[0].base_price);
    const extraCents = totalCents - baseCents;
    const [result] = await connection.execute(
      `INSERT INTO bookings
       (booking_reference, user_id, mahal_id, function_type_id, booking_date, start_time, end_time,
        guest_count, special_requirements, subtotal, extra_charges, tax_amount, total_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0.00', ?, 'pending')`,
      [reference, req.user.id, mahalId, functionId, date, startTime, endTime, guestCount,
        requirements || null, centsToAmount(baseCents), centsToAmount(extraCents), centsToAmount(totalCents)],
    );
    bookingId = result.insertId;
    for (const service of pricedServices) {
      await connection.execute(
        `INSERT INTO booking_services (booking_id, service_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?)`,
        [bookingId, service.id, service.quantity, centsToAmount(service.unitPrice), centsToAmount(service.total)],
      );
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.status(201).json(await bookingResult(bookingId, req.user.id));
});

app.get("/api/bookings/my", requireAuth, async (req, res) => {
  const [rows] = await pool.execute(
    `SELECT b.id, b.booking_reference, b.booking_date, b.start_time, b.end_time, b.guest_count,
            b.subtotal, b.extra_charges, b.tax_amount, b.total_amount, b.status, b.created_at,
            m.name AS mahal_name, m.location AS mahal_location, m.address AS mahal_address,
            m.image_url, f.name AS function_name
     FROM bookings b JOIN mahals m ON m.id = b.mahal_id
     JOIN function_types f ON f.id = b.function_type_id
     WHERE b.user_id = ? ORDER BY b.booking_date DESC, b.start_time DESC`,
    [req.user.id],
  );
  res.json(rows);
});

app.get("/api/bookings/:id", requireAuth, async (req, res) => {
  res.json(await bookingResult(parseId(req.params.id), req.user.role === "admin" ? undefined : req.user.id));
});

app.patch("/api/bookings/:id/cancel", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.execute(
      "SELECT id, status, booking_date FROM bookings WHERE id = ? AND user_id = ? FOR UPDATE",
      [id, req.user.id],
    );
    if (!rows[0]) throw new HttpError(404, "Booking not found.");
    if (rows[0].status !== "pending" && rows[0].status !== "confirmed") {
      throw new HttpError(409, "This booking can no longer be cancelled.");
    }
    const daysToBooking = (new Date(`${sqlDate(rows[0].booking_date)}T00:00:00Z`) - new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)) / 86400000;
    if (rows[0].status === "confirmed" && daysToBooking < 7) {
      throw new HttpError(409, "Confirmed bookings can only be cancelled at least 7 days before the event.");
    }
    await connection.execute("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json({ message: "Booking cancelled.", booking: await bookingResult(id, req.user.id) });
});

app.get("/api/bookings/:id/xml", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const booking = req.user.role === "admin"
    ? await bookingResult(id)
    : await bookingResult(id, req.user.id);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build({
    booking: {
      reference: booking.booking_reference,
      customer: { name: booking.customer_name, email: booking.customer_email, phone: booking.customer_phone },
      mahal: { name: booking.mahal_name, location: booking.mahal_location, address: booking.mahal_address },
      function: booking.function_name,
      date: sqlDate(booking.booking_date),
      startTime: sqlTime(booking.start_time),
      endTime: sqlTime(booking.end_time),
      guestCount: booking.guest_count,
      price: {
        subtotal: booking.subtotal, extraCharges: booking.extra_charges,
        tax: booking.tax_amount, total: booking.total_amount,
        services: { service: booking.services.map((service) => ({
          name: service.name, quantity: service.quantity,
          unitPrice: service.unit_price, total: service.total_price,
        })) },
      },
      status: booking.status,
      createdAt: booking.created_at,
    },
  })}`;
  res.type("application/xml; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${booking.booking_reference}.xml"`);
  res.send(xml);
});

app.get("/api/admin/summary", requireAdmin, async (req, res) => {
  const [[counts]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM mahals WHERE active = 1) AS total_mahals,
            (SELECT COUNT(*) FROM bookings) AS total_bookings,
            (SELECT COUNT(*) FROM bookings WHERE status = 'pending') AS pending_bookings,
            (SELECT COUNT(*) FROM bookings WHERE status = 'confirmed') AS confirmed_bookings,
            (SELECT COUNT(*) FROM bookings WHERE status = 'cancelled') AS cancelled_bookings`,
  );
  res.json(counts);
});

app.post("/api/admin/functions", requireAdmin, async (req, res) => {
  const name = requiredText(req.body.name, "Function type name", 100);
  const description = requiredText(req.body.description, "Description", 500);
  const imageUrl = typeof req.body.image_url === "string" && req.body.image_url.trim()
    ? requiredText(req.body.image_url, "Image URL", 1000) : null;
  try {
    const [result] = await pool.execute(
      "INSERT INTO function_types (name, description, image_url) VALUES (?, ?, ?)",
      [name, description, imageUrl],
    );
    res.status(201).json({ id: result.insertId });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "That function type already exists.");
    throw error;
  }
});

app.put("/api/admin/functions/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const name = requiredText(req.body.name, "Function type name", 100);
  const description = requiredText(req.body.description, "Description", 500);
  const imageUrl = typeof req.body.image_url === "string" && req.body.image_url.trim()
    ? requiredText(req.body.image_url, "Image URL", 1000) : null;
  try {
    const [result] = await pool.execute(
      "UPDATE function_types SET name = ?, description = ?, image_url = ?, active = 1 WHERE id = ?",
      [name, description, imageUrl, id],
    );
    if (!result.affectedRows) throw new HttpError(404, "Function type not found.");
    res.json({ id, message: "Function type updated." });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") throw new HttpError(409, "That function type already exists.");
    throw error;
  }
});

app.delete("/api/admin/functions/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = await pool.execute("UPDATE function_types SET active = 0 WHERE id = ? AND active = 1", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Function type not found.");
  res.status(204).end();
});

app.get("/api/admin/bookings", requireAdmin, async (req, res) => {
  const conditions = [];
  const params = [];
  if (req.query.status && ["pending", "confirmed", "rejected", "cancelled"].includes(req.query.status)) {
    conditions.push("b.status = ?"); params.push(req.query.status);
  }
  if (req.query.date && validDate(req.query.date)) {
    conditions.push("b.booking_date = ?"); params.push(req.query.date);
  } else if (req.query.date) throw new HttpError(400, "Choose a valid booking date.");
  if (req.query.mahal_id) {
    conditions.push("b.mahal_id = ?"); params.push(parseId(req.query.mahal_id));
  }
  if (req.query.customer && String(req.query.customer).trim()) {
    conditions.push("(u.name LIKE ? OR u.email LIKE ?)"); params.push(`%${String(req.query.customer).trim()}%`, `%${String(req.query.customer).trim()}%`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const [rows] = await pool.execute(
    `SELECT b.id, b.booking_reference, b.booking_date, b.start_time, b.end_time, b.guest_count,
            b.total_amount, b.status, b.created_at, u.name AS customer_name, u.email AS customer_email,
            u.phone AS customer_phone, m.name AS mahal_name, f.name AS function_name
     FROM bookings b JOIN users u ON u.id = b.user_id JOIN mahals m ON m.id = b.mahal_id
     JOIN function_types f ON f.id = b.function_type_id ${where}
     ORDER BY b.created_at DESC LIMIT 500`,
    params,
  );
  res.json(rows);
});

app.patch("/api/admin/bookings/:id/status", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const status = req.body.status;
  if (!["confirmed", "rejected", "cancelled"].includes(status)) {
    throw new HttpError(400, "Choose a valid booking status.");
  }
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [bookings] = await connection.execute(
      `SELECT id, mahal_id, booking_date, start_time, end_time, status
       FROM bookings WHERE id = ? FOR UPDATE`,
      [id],
    );
    if (!bookings[0]) throw new HttpError(404, "Booking not found.");
    if (status === "confirmed") {
      await connection.execute("SELECT id FROM mahals WHERE id = ? FOR UPDATE", [bookings[0].mahal_id]);
      const [conflicts] = await connection.execute(
        `SELECT id FROM bookings WHERE mahal_id = ? AND booking_date = ? AND id <> ?
         AND status = 'confirmed' AND start_time < ? AND end_time > ? LIMIT 1`,
        [bookings[0].mahal_id, bookings[0].booking_date, id, bookings[0].end_time, bookings[0].start_time],
      );
      if (conflicts.length) throw new HttpError(409, "Another confirmed booking conflicts with this time slot.");
    }
    await connection.execute("UPDATE bookings SET status = ? WHERE id = ?", [status, id]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  res.json(await bookingResult(id));
});

app.post("/api/admin/mahals", requireAdmin, async (req, res) => {
  const input = normalizeMahal(req.body);
  const [result] = await pool.execute(
    `INSERT INTO mahals
     (name, location, address, description, capacity_min, capacity_max, base_price, price_type,
      amenities, parking_capacity, ac_available, accommodation_available, image_url, contact_phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [input.name, input.location, input.address, input.description, input.capacityMin, input.capacityMax,
      input.basePrice, input.priceType, input.amenities, input.parkingCapacity, input.acAvailable,
      input.accommodationAvailable, input.imageUrl, input.contactPhone],
  );
  res.status(201).json({ id: result.insertId, message: "Mahal created." });
});

app.put("/api/admin/mahals/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const input = normalizeMahal(req.body);
  const [result] = await pool.execute(
    `UPDATE mahals SET name = ?, location = ?, address = ?, description = ?, capacity_min = ?,
      capacity_max = ?, base_price = ?, price_type = ?, amenities = ?, parking_capacity = ?,
      ac_available = ?, accommodation_available = ?, image_url = ?, contact_phone = ?, active = 1
     WHERE id = ?`,
    [input.name, input.location, input.address, input.description, input.capacityMin, input.capacityMax,
      input.basePrice, input.priceType, input.amenities, input.parkingCapacity, input.acAvailable,
      input.accommodationAvailable, input.imageUrl, input.contactPhone, id],
  );
  if (!result.affectedRows) throw new HttpError(404, "Mahal not found.");
  res.json({ id, message: "Mahal updated." });
});

app.delete("/api/admin/mahals/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = await pool.execute("UPDATE mahals SET active = 0 WHERE id = ? AND active = 1", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Mahal not found.");
  res.status(204).end();
});

app.post("/api/admin/services", requireAdmin, async (req, res) => {
  const service = normalizeService(req.body);
  const [result] = await pool.execute(
    "INSERT INTO services (name, description, price) VALUES (?, ?, ?)",
    [service.name, service.description, service.price],
  );
  res.status(201).json({ id: result.insertId });
});

app.put("/api/admin/services/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const service = normalizeService(req.body);
  const [result] = await pool.execute(
    "UPDATE services SET name = ?, description = ?, price = ?, active = 1 WHERE id = ?",
    [service.name, service.description, service.price, id],
  );
  if (!result.affectedRows) throw new HttpError(404, "Service not found.");
  res.json({ id, message: "Service updated." });
});

app.delete("/api/admin/services/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = await pool.execute("UPDATE services SET active = 0 WHERE id = ? AND active = 1", [id]);
  if (!result.affectedRows) throw new HttpError(404, "Service not found.");
  res.status(204).end();
});

app.use((req, res, next) => next(new HttpError(404, "The requested endpoint was not found.")));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
  if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "A record with those details already exists." });
  if (error.status === 400) return res.status(400).json({ error: "Request body must contain valid JSON." });
  if (error.status === 413) return res.status(413).json({ error: "Request body is too large." });
  console.error("MahalMate API error:", error);
  return res.status(500).json({ error: "The server could not complete this request. Please try again." });
});

if (require.main === module) {
  initializeSchema()
    .then(() => {
      app.listen(port, () => console.log(`MahalMate API listening on http://localhost:${port} (database: ${databaseName})`));
    })
    .catch((error) => {
      console.error("MahalMate startup failed. Check that MySQL is running and the configured account can create/use the mahalmate database.");
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = app;
