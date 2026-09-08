import { useState } from "react";
import { getContext, exportToTxt } from "../api/client";
import "./SearchResults.css";

function SearchResults({ results, query }) {
  const [expandedId, setExpandedId] = useState(null);
  const [contextData, setContextData] = useState(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  if (!results || results.length === 0) {
    return null;
  }

  const handleShowContext = async (sentenceId) => {
    if (expandedId === sentenceId) {
      setExpandedId(null);
      setContextData(null);
      return;
    }

    setExpandedId(sentenceId);
    setIsLoadingContext(true);
    setContextData(null);

    try {
      const data = await getContext(sentenceId, 2);
      setContextData(data);
    } catch (error) {
      console.error("Ошибка загрузки контекста:", error);
    } finally {
      setIsLoadingContext(false);
    }
  };

  const handleExportTxt = async () => {
    setIsExporting(true);
    try {
      // Подготавливаем данные для экспорта
      // Убираем HTML-теги из highlighted_content, если original_content отсутствует
      const exportData = results.map((r) => ({
        content:
          r.original_content ||
          r.highlighted_content?.replace(/<[^>]+>/g, "") ||
          "[нет текста]",
        document_name: null, // Пока не выводим из-за проблем с кодировкой
      }));

      const blob = await exportToTxt(exportData);

      // Создаём ссылку для скачивания
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "quotes.txt";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Ошибка экспорта:", error);
      alert("Не удалось экспортировать файл");
    } finally {
      setIsExporting(false);
    }
  };

  const renderHighlighted = (text) => {
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  return (
    <div className="search-results">
      <div className="results-header">
        <div>
          <h2>Результаты поиска</h2>
          <p className="results-count">
            По запросу <strong>«{query}»</strong> найдено: {results.length}
          </p>
        </div>
        <button
          className="export-button"
          onClick={handleExportTxt}
          disabled={isExporting}
        >
          {isExporting ? "⏳ Экспорт..." : "⬇️ Экспорт в TXT"}
        </button>
      </div>

      <div className="results-list">
        {results.map((result) => (
          <div key={result.id} className="result-item">
            <div className="result-content">
              {renderHighlighted(result.highlighted_content)}
            </div>

            <div className="result-meta">
              <span className="document-name">📄 {result.document_name}</span>
              <button
                className="context-button"
                onClick={() => handleShowContext(result.id)}
              >
                {expandedId === result.id
                  ? "Скрыть контекст"
                  : "Показать контекст"}
              </button>
            </div>

            {expandedId === result.id && (
              <div className="context-panel">
                {isLoadingContext && <p>Загружаю контекст...</p>}

                {contextData && (
                  <div className="context-content">
                    {contextData.context.map((sentence) => (
                      <div
                        key={sentence.id}
                        className={`context-sentence ${
                          sentence.isTarget ? "target" : ""
                        }`}
                      >
                        {sentence.content}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default SearchResults;
