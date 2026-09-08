const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const mammoth = require("mammoth");
const WordExtractor = require("word-extractor");
const { stripRtf } = require("rtf-to-text");
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
  const cleanText = text.replace(/\s+/g, " ").trim();
  const sentences = cleanText.match(/[^.!?]+[.!?]+["')\]]*(\s|$)|[^.!?]+$/g);
  if (!sentences) return [];
  return sentences.map((s) => s.trim()).filter((s) => s.length > 2);
}

// Функция для извлечения текста из PDF
async function extractPdfText(filePath) {
  const pdfParse = require("pdf-parse-fork");
  const pdfBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(pdfBuffer);
  return pdfData.text;
}

// Функция для извлечения текста из RTF
async function extractRtfText(filePath) {
  const rtfBuffer = fs.readFileSync(filePath);
  const rtfString = rtfBuffer.toString("utf-8");
  const text = stripRtf(rtfString);
  return text;
}

// Функция для извлечения текста из DOC (старый формат)
async function extractDocText(filePath) {
  const extractor = new WordExtractor();
  const doc = await extractor.extract(filePath);
  return doc.getBody();
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
  if (!req.file) {
    return res.status(400).json({ error: "Файл не загружен" });
  }

  const filePath = req.file.path;
  const originalName = req.file.originalname;
  const fileExt = path.extname(originalName).toLowerCase().slice(1);
  const fileSize = req.file.size;

  try {
    let rawText = "";

    switch (fileExt) {
      case "txt":
        rawText = fs.readFileSync(filePath, "utf-8");
        break;
      case "pdf":
        rawText = await extractPdfText(filePath);
        break;
      case "docx":
        const docxResult = await mammoth.extractRawText({ path: filePath });
        rawText = docxResult.value;
        break;
      case "rtf":
        rawText = await extractRtfText(filePath);
        break;
      case "doc":
        rawText = await extractDocText(filePath);
        break;
      default:
        fs.unlinkSync(filePath);
        return res.status(400).json({
          error: `Формат .${fileExt} не поддерживается. Разрешены: TXT, PDF, DOCX, RTF, DOC`,
        });
    }

    const docResult = await pool.query(
      "INSERT INTO documents (filename, original_name, file_type, file_size) VALUES ($1, $2, $3, $4) RETURNING id",
      [req.file.filename, originalName, fileExt, fileSize],
    );
    const documentId = docResult.rows[0].id;

    const sentences = splitIntoSentences(rawText);

    if (sentences.length === 0) {
      await pool.query("DELETE FROM documents WHERE id = $1", [documentId]);
      fs.unlinkSync(filePath);
      return res
        .status(400)
        .json({ error: "Не удалось извлечь текст из файла" });
    }

    for (let i = 0; i < sentences.length; i++) {
      await pool.query(
        "INSERT INTO sentences (document_id, position, content) VALUES ($1, $2, $3)",
        [documentId, i, sentences[i]],
      );
    }

    fs.unlinkSync(filePath);

    res.json({
      message: "Файл успешно обработан",
      documentId: documentId,
      fileName: originalName,
      fileType: fileExt,
      totalSentences: sentences.length,
    });
  } catch (error) {
    console.error("Ошибка обработки файла:", error);

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
  const { query } = req.query;

  if (!query || query.trim().length < 2) {
    return res.status(400).json({
      error: "Введите поисковый запрос (минимум 2 символа)",
    });
  }

  try {
    const sql = `
            SELECT 
                s.id,
                s.position,
                s.document_id,
                d.original_name AS document_name,
                s.content AS original_content,
                ts_headline('russian', s.content, q) AS highlighted_content
            FROM sentences s
            JOIN documents d ON s.document_id = d.id,
            plainto_tsquery('russian', $1) AS q
            WHERE s.tsv @@ q
            ORDER BY d.original_name, s.position
            LIMIT 50
        `;

    const result = await pool.query(sql, [query.trim()]);

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

// МАРШРУТ: Получение контекста цитаты
app.get("/api/context/:id", async (req, res) => {
  const sentenceId = parseInt(req.params.id);
  const contextSize = parseInt(req.query.size) || 2;

  if (isNaN(sentenceId)) {
    return res.status(400).json({ error: "Некорректный ID предложения" });
  }

  try {
    const sentenceResult = await pool.query(
      "SELECT * FROM sentences WHERE id = $1",
      [sentenceId],
    );

    if (sentenceResult.rows.length === 0) {
      return res.status(404).json({ error: "Предложение не найдено" });
    }

    const sentence = sentenceResult.rows[0];
    const docId = sentence.document_id;
    const position = sentence.position;

    const contextResult = await pool.query(
      `SELECT 
                s.id,
                s.position,
                s.content,
                (s.position - $2) AS relative_position
             FROM sentences s
             WHERE s.document_id = $1 
               AND s.position >= $3 
               AND s.position <= $4
             ORDER BY s.position ASC`,
      [docId, position, position - contextSize, position + contextSize],
    );

    res.json({
      sentenceId: sentenceId,
      documentId: docId,
      documentName: (
        await pool.query("SELECT original_name FROM documents WHERE id = $1", [
          docId,
        ])
      ).rows[0].original_name,
      contextSize: contextSize,
      totalSentences: contextResult.rows.length,
      context: contextResult.rows.map((row) => ({
        id: row.id,
        position: row.position,
        relativePosition: row.relative_position,
        content: row.content,
        isTarget: row.position === position,
      })),
    });
  } catch (error) {
    console.error("Ошибка получения контекста:", error);
    res.status(500).json({
      error: "Ошибка при получении контекста",
      details: error.message,
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
