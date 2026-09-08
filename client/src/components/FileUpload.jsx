import { useState, useRef } from "react";
import { uploadFile } from "../api/client";
import "./FileUpload.css";

function FileUpload({ onFileUploaded }) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Обработчик drag-and-drop
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  // Обработчик выбора файла через кнопку
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFile(file);
    }
  };

  // Основная функция загрузки
  const handleFile = async (file) => {
    // Проверяем расширение
    const allowedTypes = ["txt", "pdf", "docx", "rtf", "doc"];
    const fileExt = file.name.split(".").pop().toLowerCase();

    if (!allowedTypes.includes(fileExt)) {
      setError(
        `Формат .${fileExt} не поддерживается. Разрешены: TXT, PDF, DOCX`,
      );
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const result = await uploadFile(file);
      setUploadResult(result);

      // Сообщаем родительскому компоненту о загрузке
      if (onFileUploaded) {
        onFileUploaded(result);
      }
    } catch (err) {
      setError(err.error || "Ошибка при загрузке файла");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="file-upload">
      <div
        className={`upload-zone ${isDragging ? "dragging" : ""} ${isUploading ? "uploading" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          accept=".txt,.pdf,.docx,.rtf,.doc"
          style={{ display: "none" }}
        />

        {isUploading ? (
          <div className="upload-message">
            <div className="spinner"></div>
            <p>Загружаем и обрабатываем файл...</p>
          </div>
        ) : (
          <div className="upload-message">
            <div className="upload-icon">📄</div>
            <p>Перетащите файл сюда</p>
            <p className="upload-hint">или нажмите для выбора</p>
            <p className="upload-formats">
              Поддерживаются: TXT, PDF, DOCX, RTF, DOC
            </p>
          </div>
        )}
      </div>

      {error && <div className="error-message">{error}</div>}

      {uploadResult && (
        <div className="upload-result">
          <p>
            ✅ Файл <strong>{uploadResult.fileName}</strong> загружен!
          </p>
          <p>
            Извлечено предложений:{" "}
            <strong>{uploadResult.totalSentences}</strong>
          </p>
        </div>
      )}
    </div>
  );
}

export default FileUpload;
