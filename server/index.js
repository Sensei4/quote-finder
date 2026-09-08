const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const pool = require("./db");

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Создаём папку для временных файлов, если её нет
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Настройка Multer для загрузки файлов
const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: 10 * 1024 * 1024, // Максимум 10 МБ
  },
});

// Вспомогательная функция: разбивает текст на предложения
function splitIntoSentences(text) {
  // Убираем лишние пробелы и переносы строк
  const cleanText = text.replace(/\s+/g, " ").trim();

  // Разбиваем по знакам конца предложения (. ! ? ...)
  const sentences = cleanText.match(/[^.!?]+[.!?]+["')\]]*(\s|$)|[^.!?]+$/g);

  if (!sentences) return [];

  // Очищаем каждое предложение и убираем пустые
  return sentences.map((s) => s.trim()).filter((s) => s.length > 2); // Минимальная длина 3 символа
}

// Тестовый маршрут
app.get("/", (req, res) => {
  res.json({ message: "Quote Finder API работает!" });
});

// Маршрут для проверки соединения с БД
app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT COUNT(*) as count FROM sentences");
    res.json({
      status: "OK",
      database: "connected",
      totalSentences: result.rows[0].count,
    });
  } catch (error) {
    res.status(500).json({
      status: "Error",
      database: "disconnected",
      error: error.message,
    });
  }
});

// МАРШРУТ: Загрузка файла
app.post("/api/upload", upload.single("file"), async (req, res) => {
  // Проверяем, что файл вообще был отправлен
  if (!req.file) {
    return res.status(400).json({ error: "Файл не загружен" });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const fileExt = path.extname(originalName).toLowerCase().slice(1); // 'txt', 'pdf', 'docx'
  const fileSize = req.file.size;

  try {
    let rawText = "";

    // Парсим в зависимости от типа файла
    if (fileExt === "txt") {
      // TXT: просто читаем файл
      rawText = fs.readFileSync(filePath, "utf-8");
    } else if (fileExt === "pdf") {
      // PDF: извлекаем текст через pdf-parse
      const pdfBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(pdfBuffer);
      rawText = pdfData.text;
    } else if (fileExt === "docx") {
      // DOCX: извлекаем текст через mammoth
      const result = await mammoth.extractRawText({ path: filePath });
      rawText = result.value;
    } else {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        error: `Формат .${fileExt} пока не поддерживается. Загрузите TXT, PDF или DOCX.`,
      });
    }

    // Сохраняем информацию о документе в БД
    const docResult = await pool.query(
      "INSERT INTO documents (filename, original_name, file_type, file_size) VALUES ($1, $2, $3, $4) RETURNING id",
      [req.file.filename, originalName, fileExt, fileSize],
    );
    const documentId = docResult.rows[0].id;

    // Разбиваем текст на предложения
    const sentences = splitIntoSentences(rawText);

    if (sentences.length === 0) {
      // Если текст пустой или не удалось разбить
      await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
      fs.unlinkSync(filePath);
      return res
        .status(400)
        .json({ error: "Не удалось извлечь текст из файла" });
    }

    // Сохраняем предложения в БД
    for (let i = 0; i < sentences.length; i++) {
      await pool.query(
        "INSERT INTO sentences (document_id, position, content) VALUES ($1, $2, $3)",
        [documentId, i, sentences[i]],
      );
    }

    // Удаляем временный файл
    fs.unlinkSync(filePath);

    // Отправляем результат
    res.json({
      message: "Файл успешно обработан",
      documentId: documentId,
      fileName: originalName,
      fileType: fileExt,
      totalSentences: sentences.length,
    });
  } catch (error) {
    console.error("Ошибка обработки файла:", error);

    // Удаляем временный файл в случае ошибки
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res
      .status(500)
      .json({ error: "Ошибка обработки файла", details: error.message });
  }
});

// МАРШРУТ: Поиск цитат
app.get("/api/search", async (req, res) => {
  const { query } = req.query; // Получаем ?query=философия

  // Проверяем, что запрос не пустой
  if (!query || query.trim().length < 2) {
    return res.status(400).json({
      error: "Введите поисковый запрос (минимум 2 символа)",
    });
  }

  try {
    // SQL-запрос с полнотекстовым поиском
    const sql = `
            SELECT 
                s.id,
                s.position,
                s.document_id,
                d.original_name AS document_name,
                s.content AS original_content,
                -- Подсвечиваем найденные слова тегами <b>...</b>
                ts_headline('russian', s.content, q) AS highlighted_content
            FROM sentences s
            JOIN documents d ON s.document_id = d.id,
            -- Преобразуем запрос пользователя в tsquery
            plainto_tsquery('russian', $1) AS q
            WHERE s.tsv @@ q  -- @@ означает "совпадает"
            ORDER BY d.original_name, s.position
            LIMIT 50
        `;

    const result = await pool.query(sql, [query.trim()]);

    // Возвращаем результат
    res.json({
      query: query,
      totalFound: result.rows.length,
      results: result.rows,
    });
  } catch (error) {
    console.error("Ошибка поиска:", error);
    res.status(500).json({
      error: "Ошибка при выполнении поиска",
      details: error.message,
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
