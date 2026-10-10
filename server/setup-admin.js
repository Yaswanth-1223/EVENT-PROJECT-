const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config();

async function createAdmin() {
  const name = process.env.ADMIN_NAME;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const phone = process.env.ADMIN_PHONE;
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !phone || !password) {
    throw new Error("Set ADMIN_NAME, ADMIN_EMAIL, ADMIN_PHONE, and ADMIN_PASSWORD in the process environment before running this script.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL must be a valid email address.");
  }
  if (password.length < 12 || Buffer.byteLength(password, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters and at most 72 bytes.");
  }
  const database = process.env.MAHALMATE_DB_NAME || "mahalmate";
  if (!/^[A-Za-z0-9_]+$/.test(database)) throw new Error("MAHALMATE_DB_NAME is invalid.");
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database,
  });
  try {
    const [existing] = await connection.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing.length) {
      throw new Error("An account with that email already exists. The script will not change an existing account or password.");
    }
    const hash = await bcrypt.hash(password, 12);
    await connection.execute(
      "INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'admin')",
      [name.trim(), email, phone.trim(), hash],
    );
    console.log(`Administrator account created for ${email}. Keep the password private.`);
  } finally {
    await connection.end();
  }
}

createAdmin().catch((error) => {
  console.error(`Admin setup failed: ${error.message}`);
  process.exitCode = 1;
});
