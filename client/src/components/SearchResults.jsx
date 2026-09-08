import { useState } from "react";
import {
  getContext,
  exportToTxt,
  exportToPdf,
  exportToDocx,
} from "../api/client";
import "./SearchResults.css";

function SearchResults({ results, query }) {
  const [expandedId, setExpandedId] = useState(null);
  const [contextData, setContextData] = useState(null);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState(null); // 'txt', 'pdf', 'docx'

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

  const prepareExportData = () => {
    return results.map((r) => ({
      content:
        r.original_content ||
        r.highlighted_content?.replace(/<[^>]+>/g, "") ||
        "[нет текста]",
    }));
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleExportTxt = async () => {
    setIsExporting(true);
    setExportFormat("txt");
    try {
      const exportData = prepareExportData();
      const blob = await exportToTxt(exportData);
      downloadBlob(blob, "quotes.txt");
    } catch (error) {
      console.error("Ошибка экспорта в TXT:", error);
      alert("Не удалось экспортировать в TXT");
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    setExportFormat("pdf");
    try {
      const exportData = prepareExportData();
      const blob = await exportToPdf(exportData);
      downloadBlob(blob, "quotes.pdf");
    } catch (error) {
      console.error("Ошибка экспорта в PDF:", error);
      alert("Не удалось экспортировать в PDF");
    } finally {
      setIsExporting(false);
      setExportFormat(null);
    }
  };

  const handleExportDocx = async () => {
    setIsExporting(true);
    setExportFormat("docx");
    try {
      const exportData = prepareExportData();
      const blob = await exportToDocx(exportData);
      downloadBlob(blob, "quotes.docx");
    } catch (error) {
      console.error("Ошибка экспорта в DOCX:", error);
      alert("Не удалось экспортировать в DOCX");
    } finally {
      setIsExporting(false);
      setExportFormat(null);
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
        <div className="export-buttons">
          <button
            className="export-button"
            onClick={handleExportTxt}
            disabled={isExporting}
          >
            {isExporting && exportFormat === "txt" ? "⏳ Экспорт..." : "⬇️ TXT"}
          </button>

          <button
            className="export-button pdf"
            onClick={handleExportPdf}
            disabled={isExporting}
          >
            {isExporting && exportFormat === "pdf" ? "⏳ Экспорт..." : "⬇️ PDF"}
          </button>

          <button
            className="export-button docx"
            onClick={handleExportDocx}
            disabled={isExporting}
          >
            {isExporting && exportFormat === "docx"
              ? "⏳ Экспорт..."
              : "⬇️ DOCX"}
          </button>
        </div>
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
