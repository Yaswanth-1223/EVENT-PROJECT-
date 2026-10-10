const crypto = require("node:crypto");
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
const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "eventfest",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:5173";
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
const xmlBuilder = new XMLBuilder({
  format: true,
  ignoreAttributes: false,
  suppressEmptyNode: true,
});

if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    req.body = {};
  }
  next();
});
app.use(
  session({
    name: "eventfest.sid",
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    },
  }),
);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireValue(value, message) {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpError(400, message);
  }
  return value.trim();
}

function parseId(value) {
  const id = Number(value);
  const validString = typeof value === "string" && /^[1-9]\d*$/.test(value);
  const validNumber = typeof value === "number";
  if ((!validString && !validNumber) || !Number.isSafeInteger(id) || id < 1) {
    throw new HttpError(400, "Please provide a valid ID.");
  }
  return id;
}

function normalizeEventInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Provide valid event details.");
  }
  const title = requireValue(body.title, "Event title is required.");
  const description = requireValue(
    body.description,
    "Event description is required.",
  );
  const venue = requireValue(body.venue, "Event venue is required.");
  const category = requireValue(body.category, "Event category is required.");
  const eventDate =
    typeof body.event_date === "string" ? body.event_date.trim() : "";
  const date = new Date(eventDate);
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})/.exec(eventDate);
  const calendarDate = dateParts
    ? new Date(Date.UTC(Number(dateParts[1]), Number(dateParts[2]) - 1, Number(dateParts[3])))
    : null;
  if (
    !eventDate ||
    Number.isNaN(date.getTime()) ||
    !/^\d{4}-\d{2}-\d{2}(?:T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?)?$/.test(eventDate) ||
    Number(dateParts?.[1]) < 1000 ||
    !calendarDate ||
    calendarDate.getUTCFullYear() !== Number(dateParts[1]) ||
    calendarDate.getUTCMonth() !== Number(dateParts[2]) - 1 ||
    calendarDate.getUTCDate() !== Number(dateParts[3])
  ) {
    throw new HttpError(400, "Enter a valid event date.");
  }
  const sqlEventDate =
    eventDate.length === 10
      ? `${eventDate} 00:00:00`
      : `${eventDate.slice(0, 10)} ${eventDate.slice(11)}${eventDate.length === 16 ? ":00" : ""}`;
  if (
    typeof body.fee === "string" &&
    !/^\d+(?:\.\d{1,2})?$/.test(body.fee.trim())
  ) {
    throw new HttpError(400, "Fee must be a number from 0 to 9,999,999.99.");
  }
  const fee = Number(body.fee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 9999999.99) {
    throw new HttpError(400, "Fee must be a number from 0 to 9,999,999.99.");
  }
  if (
    title.length > 200 ||
    description.length > 5000 ||
    venue.length > 255 ||
    category.length > 80
  ) {
    throw new HttpError(400, "One or more event fields are too long.");
  }
  return { title, description, eventDate: sqlEventDate, venue, fee, category };
}

async function ensureColumn(table, column, definition) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  if (rows.length === 0) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`Added missing ${table}.${column} column.`);
  }
}

async function ensureUniqueIndex(table, indexName, columns, duplicateQuery) {
  const [indexes] = await pool.execute(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  if (indexes.length) return;
  const [duplicates] = await pool.query(duplicateQuery);
  if (Number(duplicates[0].duplicate_groups) > 0) {
    console.warn(
      `Skipped ${indexName}: existing duplicate records need review before enforcing uniqueness.`,
    );
    return;
  }
  const sqlColumns = columns.map((column) => `\`${column}\``).join(", ");
  await pool.query(
    `ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${indexName}\` (${sqlColumns})`,
  );
}

async function migrateSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'student'
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT NOT NULL,
      event_date DATETIME NOT NULL,
      venue VARCHAR(255) NOT NULL,
      fee DECIMAL(10,2) NOT NULL DEFAULT 0,
      category VARCHAR(80) NOT NULL DEFAULT 'Other'
    ) ENGINE=InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      event_id INT NOT NULL,
      registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `);

  await ensureColumn(
    "users",
    "id",
    "INT NOT NULL AUTO_INCREMENT PRIMARY KEY",
  );
  await ensureColumn("users", "name", "VARCHAR(120) NULL");
  await ensureColumn("users", "email", "VARCHAR(255) NULL");
  await ensureColumn("users", "password", "VARCHAR(255) NULL");
  await ensureColumn("users", "role", "VARCHAR(32) NOT NULL DEFAULT 'student'");
  await ensureColumn("events", "title", "VARCHAR(200) NULL");
  await ensureColumn(
    "events",
    "id",
    "INT NOT NULL AUTO_INCREMENT PRIMARY KEY",
  );
  await ensureColumn("events", "description", "TEXT NULL");
  await ensureColumn("events", "event_date", "DATETIME NULL");
  await ensureColumn("events", "venue", "VARCHAR(255) NULL");
  await ensureColumn("events", "fee", "DECIMAL(10,2) NOT NULL DEFAULT 0");
  await ensureColumn(
    "events",
    "category",
    "VARCHAR(80) NOT NULL DEFAULT 'Other'",
  );
  await ensureColumn(
    "registrations",
    "id",
    "INT NOT NULL AUTO_INCREMENT PRIMARY KEY",
  );
  await ensureColumn(
    "registrations",
    "user_id",
    "INT NULL",
  );
  await ensureColumn(
    "registrations",
    "event_id",
    "INT NULL",
  );
  await ensureColumn(
    "registrations",
    "registered_at",
    "TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP",
  );

  await ensureUniqueIndex(
    "users",
    "users_email_unique",
    ["email"],
    `SELECT COUNT(*) AS duplicate_groups FROM (
       SELECT email FROM users WHERE email IS NOT NULL AND email <> ''
       GROUP BY email HAVING COUNT(*) > 1
     ) duplicates`,
  );
  await ensureUniqueIndex(
    "registrations",
    "registrations_user_event_unique",
    ["user_id", "event_id"],
    `SELECT COUNT(*) AS duplicate_groups FROM (
       SELECT user_id, event_id FROM registrations
       GROUP BY user_id, event_id HAVING COUNT(*) > 1
     ) duplicates`,
  );
}

async function currentUser(req) {
  if (!req.session.userId) return null;
  const [users] = await pool.execute(
    "SELECT id, name, email, role FROM users WHERE id = ?",
    [req.session.userId],
  );
  return users[0] || null;
}

async function requireAuth(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, "Please log in to continue.");
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

async function requireAdmin(req, res, next) {
  try {
    const user = await currentUser(req);
    if (!user) throw new HttpError(401, "Please log in to continue.");
    if (user.role !== "admin") {
      throw new HttpError(403, "Administrator access is required.");
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => (error ? reject(error) : resolve()));
  });
}

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => (error ? reject(error) : resolve()));
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => (error ? reject(error) : resolve()));
  });
}

app.get("/", (req, res) => {
  res.json({ message: "EventFest API is running." });
});

app.get("/api/events", async (req, res) => {
  const [events] = await pool.query(`
    SELECT e.id, e.title, e.description, e.event_date, e.venue,
           e.fee, e.category,
           (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS registration_count
    FROM events e
    ORDER BY e.event_date ASC
  `);
  res.json(events);
});

app.get("/api/events.xml", async (req, res) => {
  const [events] = await pool.query(
    `SELECT id, title, description, event_date, venue, fee, category
     FROM events ORDER BY event_date ASC`,
  );
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n${xmlBuilder.build({
    eventFest: {
      events: {
        event: events.map((event) => ({
          id: event.id,
          title: event.title,
          description: event.description,
          eventDate:
            event.event_date instanceof Date
              ? event.event_date.toISOString()
              : event.event_date,
          venue: event.venue,
          fee: event.fee,
          category: event.category,
        })),
      },
    },
  })}`;
  res.type("application/xml; charset=utf-8");
  res.set("Content-Disposition", 'attachment; filename="eventfest-events.xml"');
  res.send(xml);
});

app.get("/api/events/:id", async (req, res) => {
  const id = parseId(req.params.id);
  const [events] = await pool.execute(
    `SELECT e.id, e.title, e.description, e.event_date, e.venue, e.fee,
            e.category,
            (SELECT COUNT(*) FROM registrations r WHERE r.event_id = e.id) AS registration_count
     FROM events e WHERE e.id = ?`,
    [id],
  );
  if (!events[0]) throw new HttpError(404, "Event not found.");
  res.json(events[0]);
});

app.post("/api/auth/register", async (req, res) => {
  const name = requireValue(req.body.name, "Name is required.");
  const email = requireValue(req.body.email, "Email is required.").toLowerCase();
  const password = req.body.password;
  if (name.length > 120) throw new HttpError(400, "Name is too long.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new HttpError(400, "Password must be at least 8 characters and at most 72 bytes.");
  }
  const bcrypt = require("bcrypt");
  const passwordHash = await bcrypt.hash(password, 12);
  const connection = await pool.getConnection();
  let userId;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'student')",
      [name, email, passwordHash],
    );
    userId = result.insertId;
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      throw new HttpError(409, "An account with this email already exists.");
    }
    throw error;
  } finally {
    connection.release();
  }

  await regenerateSession(req);
  req.session.userId = userId;
  await saveSession(req);
  res.status(201).json({
    user: { id: userId, name, email, role: "student" },
  });
});

app.post("/api/auth/login", async (req, res) => {
  const email = requireValue(req.body.email, "Email is required.").toLowerCase();
  const password = req.body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  if (typeof password !== "string" || !password) {
    throw new HttpError(400, "Password is required.");
  }
  const [users] = await pool.execute(
    "SELECT id, name, email, password, role FROM users WHERE email = ? LIMIT 1",
    [email],
  );
  const bcrypt = require("bcrypt");
  if (!users[0] || !(await bcrypt.compare(password, users[0].password || ""))) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  await regenerateSession(req);
  req.session.userId = users[0].id;
  await saveSession(req);
  res.json({
    user: {
      id: users[0].id,
      name: users[0].name,
      email: users[0].email,
      role: users[0].role,
    },
  });
});

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.post("/api/auth/logout", async (req, res) => {
  if (req.session) await destroySession(req);
  res.clearCookie("eventfest.sid", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.status(204).end();
});

app.get("/api/registrations/my", requireAuth, async (req, res) => {
  const [registrations] = await pool.execute(
    `SELECT r.id AS registration_id, r.registered_at,
            e.id, e.title, e.description, e.event_date, e.venue, e.fee, e.category
     FROM registrations r
     JOIN events e ON e.id = r.event_id
     WHERE r.user_id = ?
     ORDER BY e.event_date ASC`,
    [req.user.id],
  );
  res.json(registrations);
});

app.post("/api/registrations", requireAuth, async (req, res) => {
  const eventId = parseId(req.body.event_id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [events] = await connection.execute(
      "SELECT id FROM events WHERE id = ? FOR UPDATE",
      [eventId],
    );
    if (!events[0]) throw new HttpError(404, "Event not found.");
    const [result] = await connection.execute(
      "INSERT INTO registrations (user_id, event_id) VALUES (?, ?)",
      [req.user.id, eventId],
    );
    await connection.commit();
    res.status(201).json({ id: result.insertId, message: "You're registered!" });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") {
      throw new HttpError(409, "You are already registered for this event.");
    }
    throw error;
  } finally {
    connection.release();
  }
});

app.delete("/api/registrations/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const [result] = await pool.execute(
    "DELETE FROM registrations WHERE id = ? AND user_id = ?",
    [id, req.user.id],
  );
  if (!result.affectedRows) throw new HttpError(404, "Registration not found.");
  res.status(204).end();
});

app.post("/api/admin/events", requireAdmin, async (req, res) => {
  const event = normalizeEventInput(req.body);
  const [result] = await pool.execute(
    `INSERT INTO events (title, description, event_date, venue, fee, category)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      event.title,
      event.description,
      event.eventDate,
      event.venue,
      event.fee,
      event.category,
    ],
  );
  res.status(201).json({ id: result.insertId, ...event });
});

app.put("/api/admin/events/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const event = normalizeEventInput(req.body);
  const [existing] = await pool.execute("SELECT id FROM events WHERE id = ?", [id]);
  if (!existing[0]) throw new HttpError(404, "Event not found.");
  await pool.execute(
    `UPDATE events SET title = ?, description = ?, event_date = ?,
      venue = ?, fee = ?, category = ? WHERE id = ?`,
    [
      event.title,
      event.description,
      event.eventDate,
      event.venue,
      event.fee,
      event.category,
      id,
    ],
  );
  res.json({ id, ...event });
});

app.delete("/api/admin/events/:id", requireAdmin, async (req, res) => {
  const id = parseId(req.params.id);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [events] = await connection.execute(
      "SELECT id FROM events WHERE id = ? FOR UPDATE",
      [id],
    );
    if (!events[0]) throw new HttpError(404, "Event not found.");
    await connection.execute("DELETE FROM registrations WHERE event_id = ?", [id]);
    await connection.execute("DELETE FROM events WHERE id = ?", [id]);
    await connection.commit();
    res.status(204).end();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
});

app.use((req, res, next) => {
  next(new HttpError(404, "The requested endpoint was not found."));
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({
      error: error.status === 413 ? "Request is too large." : "Request could not be processed.",
    });
  }
  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ error: "This record already exists." });
  }
  console.error("Request failed:", error.message);
  return res.status(500).json({ error: "Something went wrong. Please try again." });
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    await migrateSchema();
    if (!process.env.SESSION_SECRET) {
      console.warn(
        "SESSION_SECRET is not set; sessions will expire when the server restarts.",
      );
    }
    app.listen(port, () => {
      console.log(`EventFest API running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server startup failed. Check MySQL and the server .env configuration.");
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (require.main === module) startServer();

module.exports = { app, migrateSchema, pool };
