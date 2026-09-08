const { Pool } = require("pg");

// Настройки подключения к базе данных
const pool = new Pool({
  user: "admin",
  host: "localhost",
  database: "quote_finder",
  password: "secret",
  port: 5432,
});

// Проверка подключения
pool
  .connect()
  .then(() => console.log("✅ Подключение к PostgreSQL успешно"))
  .catch((err) =>
    console.error("❌ Ошибка подключения к PostgreSQL:", err.message),
  );

module.exports = pool;
