const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fontPath = path.join(
  __dirname,
  "fonts",
  "Roboto-VariableFont_wdth,wght.ttf",
);
const fs = require("fs");
const mammoth = require("mammoth");
const PDFDocument = require("pdfkit");
const WordExtractor = require("word-extractor");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} = require("docx");
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

// Функция для конвертации имени файла из latin1 в UTF-8
function fixEncoding(str) {
  if (!str) return str;
  try {
    // Если строка содержит символы в диапазоне latin1, конвертируем
    return Buffer.from(str, "latin1").toString("utf8");
  } catch (e) {
    return str;
  }
}

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
  const originalName = fixEncoding(req.file.originalname);
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

    // Очищаем ВСЕ старые документы перед загрузкой нового
    // Для MVP: пользователь работает только с одним документом за раз
    await pool.query("DELETE FROM documents");

    // Сохраняем информацию о документе в БД
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

// МАРШРУТ: Экспорт результатов в TXT
app.post("/api/export/txt", async (req, res) => {
  const { sentences } = req.body;

  if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ error: "Нет данных для экспорта" });
  }

  try {
    let content = "📚 Quote Finder — Результаты поиска\n";
    content += "=".repeat(50) + "\n\n";
    content += `Дата: ${new Date().toLocaleString("ru-RU")}\n`;
    content += `Всего цитат: ${sentences.length}\n\n`;
    content += "=".repeat(50) + "\n\n";

    sentences.forEach((sentence, index) => {
      // Используем только текст цитаты, без имени файла
      content += `[${index + 1}] ${sentence.content || "[нет текста]"}\n`;
      content += "\n";
    });

    // BOM для корректного отображения кириллицы в Windows
    const BOM = "\uFEFF";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="quotes.txt"');
    res.send(BOM + content);
  } catch (error) {
    console.error("Ошибка экспорта в TXT:", error);
    res.status(500).json({ error: "Ошибка при экспорте" });
  }
});

// МАРШРУТ: Экспорт результатов в PDF
app.post("/api/export/pdf", async (req, res) => {
  const { sentences } = req.body;

  if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ error: "Нет данных для экспорта" });
  }

  try {
    // Путь к шрифту (лежит в папке server/fonts/)
    const fontPath = path.join(
      __dirname,
      "fonts",
      "Roboto-VariableFont_wdth,wght.ttf",
    );

    // Проверяем, что шрифт существует
    if (!fs.existsSync(fontPath)) {
      console.error("Шрифт не найден:", fontPath);
      return res.status(500).json({
        error:
          "Шрифт не найден. Поместите Roboto-VariableFont_wdth,wght.ttf в папку server/fonts/",
      });
    }

    // Создаём PDF-документ
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: "Quote Finder — Результаты поиска",
        Author: "Quote Finder",
      },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="quotes.pdf"');

    doc.pipe(res);

    // Регистрируем шрифт с поддержкой кириллицы
    doc.registerFont("Roboto", fontPath);

    // Заголовок
    doc.font("Roboto").fontSize(20).fillColor("#2c3e50").text("Quote Finder", {
      align: "center",
    });
    doc.moveDown(0.5);
    doc
      .font("Roboto")
      .fontSize(14)
      .fillColor("#7f8c8d")
      .text("Результаты поиска", {
        align: "center",
      });
    doc.moveDown(1);

    // Разделительная линия
    doc
      .strokeColor("#bdc3c7")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(1);

    // Информация о поиске
    doc
      .font("Roboto")
      .fontSize(10)
      .fillColor("#555555")
      .text(`Дата: ${new Date().toLocaleString("ru-RU")}`);
    doc.font("Roboto").text(`Всего цитат: ${sentences.length}`);
    doc.moveDown(1);

    // Выводим цитаты
    sentences.forEach((sentence, index) => {
      doc
        .font("Roboto")
        .fontSize(11)
        .fillColor("#3498db")
        .text(`[${index + 1}]`);
      doc.moveDown(0.3);

      const cleanText = (sentence.content || "[нет текста]").replace(
        /<[^>]+>/g,
        "",
      );
      doc.font("Roboto").fontSize(12).fillColor("#2c3e50").text(cleanText, {
        indent: 20,
        lineGap: 3,
      });
      doc.moveDown(0.5);

      if (index < sentences.length - 1) {
        doc
          .strokeColor("#ecf0f1")
          .lineWidth(0.5)
          .moveTo(50, doc.y)
          .lineTo(545, doc.y)
          .stroke();
        doc.moveDown(0.5);
      }
    });

    // Футер
    doc.moveDown(1);
    doc
      .strokeColor("#bdc3c7")
      .lineWidth(1)
      .moveTo(50, doc.y)
      .lineTo(545, doc.y)
      .stroke();
    doc.moveDown(0.5);
    doc
      .font("Roboto")
      .fontSize(9)
      .fillColor("#95a5a6")
      .text("Сгенерировано Quote Finder", {
        align: "center",
      });

    doc.end();
  } catch (error) {
    console.error("Ошибка экспорта в PDF:", error);
    res.status(500).json({ error: "Ошибка при экспорте в PDF" });
  }
});

// МАРШРУТ: Экспорт результатов в DOCX
app.post("/api/export/docx", async (req, res) => {
  const { sentences } = req.body;

  if (!sentences || !Array.isArray(sentences) || sentences.length === 0) {
    return res.status(400).json({ error: "Нет данных для экспорта" });
  }

  try {
    // Создаём документ
    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1000,
                bottom: 1000,
                left: 1000,
                right: 1000,
              },
            },
          },
          children: [
            // Заголовок
            new Paragraph({
              children: [
                new TextRun({
                  text: "Quote Finder",
                  bold: true,
                  size: 40,
                  color: "2c3e50",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Результаты поиска",
                  size: 28,
                  color: "7f8c8d",
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Разделитель
            new Paragraph({
              children: [],
              border: {
                bottom: {
                  color: "bdc3c7",
                  style: BorderStyle.SINGLE,
                  size: 6,
                  space: 20,
                },
              },
              spacing: { after: 300 },
            }),

            // Информация о поиске
            new Paragraph({
              children: [
                new TextRun({
                  text: `Дата: ${new Date().toLocaleString("ru-RU")}`,
                  size: 22,
                  color: "555555",
                }),
              ],
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Всего цитат: ${sentences.length}`,
                  size: 22,
                  color: "555555",
                }),
              ],
              spacing: { after: 300 },
            }),

            // Цитаты
            ...sentences.flatMap((sentence, index) => {
              const cleanText = (sentence.content || "[нет текста]").replace(
                /<[^>]+>/g,
                "",
              );

              const paragraphs = [];

              // Номер цитаты
              paragraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: `[${index + 1}]`,
                      bold: true,
                      size: 24,
                      color: "3498db",
                    }),
                  ],
                  spacing: { before: 200, after: 100 },
                }),
              );

              // Текст цитаты
              paragraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: cleanText,
                      size: 26,
                      color: "2c3e50",
                    }),
                  ],
                  indent: { left: 400 },
                  spacing: { after: 200 },
                }),
              );

              // Разделитель между цитатами
              if (index < sentences.length - 1) {
                paragraphs.push(
                  new Paragraph({
                    children: [],
                    border: {
                      bottom: {
                        color: "ecf0f1",
                        style: BorderStyle.SINGLE,
                        size: 4,
                        space: 15,
                      },
                    },
                    spacing: { after: 100 },
                  }),
                );
              }

              return paragraphs;
            }),

            // Футер
            new Paragraph({
              children: [],
              border: {
                top: {
                  color: "bdc3c7",
                  style: BorderStyle.SINGLE,
                  size: 6,
                  space: 20,
                },
              },
              spacing: { before: 300, after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: "Сгенерировано Quote Finder",
                  size: 18,
                  color: "95a5a6",
                }),
              ],
              alignment: AlignmentType.CENTER,
            }),
          ],
        },
      ],
    });

    // Генерируем буфер
    const buffer = await Packer.toBuffer(doc);

    // Отправляем файл
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    res.setHeader("Content-Disposition", 'attachment; filename="quotes.docx"');
    res.send(buffer);
  } catch (error) {
    console.error("Ошибка экспорта в DOCX:", error);
    res.status(500).json({ error: "Ошибка при экспорте в DOCX" });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
