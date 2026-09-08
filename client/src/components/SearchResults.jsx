import { useState } from "react";
import { getContext } from "../api/client";
import "./SearchResults.css";

function SearchResults({ results, query }) {
  const [expandedId, setExpandedId] = useState(null);
  const [contextData, setContextData] = useState(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  if (!results || results.length === 0) {
    return null;
  }

  const handleShowContext = async (sentenceId) => {
    // Если кликнули на тот же элемент — скрываем контекст
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

  // Функция для безопасного отображения подсвеченного текста
  const renderHighlighted = (text) => {
    return <span dangerouslySetInnerHTML={{ __html: text }} />;
  };

  return (
    <div className="search-results">
      <div className="results-header">
        <h2>Результаты поиска</h2>
        <p className="results-count">
          По запросу <strong>«{query}»</strong> найдено: {results.length}
        </p>
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
