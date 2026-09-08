import { useState, useEffect } from "react";
import FileUpload from "./components/FileUpload";
import SearchBar from "./components/SearchBar";
import SearchResults from "./components/SearchResults";
import { searchQuotes } from "./api/client";
import "./App.css";

function App() {
  const [serverStatus, setServerStatus] = useState("Проверяю соединение...");
  const [lastUpload, setLastUpload] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [currentQuery, setCurrentQuery] = useState("");

  useEffect(() => {
    fetch("http://localhost:5000/api/health")
      .then((res) => res.json())
      .then((data) => {
        setServerStatus(
          `Сервер работает! В базе ${data.totalSentences} предложений`,
        );
      })
      .catch(() => {
        setServerStatus("❌ Бэкенд не запущен. Запусти сервер на порту 5000");
      });
  }, [lastUpload]);

  const handleFileUploaded = (result) => {
    setLastUpload(result);
    // Сбрасываем старые результаты поиска при новой загрузке
    setSearchResults(null);
    setCurrentQuery("");
  };

  const handleSearch = async (query, finishCallback) => {
    try {
      const results = await searchQuotes(query);
      setSearchResults(results);
      setCurrentQuery(query);
    } catch (error) {
      console.error("Ошибка поиска:", error);
      alert(error.error || "Ошибка при поиске");
    } finally {
      finishCallback();
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>📚 Quote Finder</h1>
        <p>Сайт для поиска цитат в загруженных документах</p>
      </header>

      <div className="status-bar">{serverStatus}</div>

      <FileUpload onFileUploaded={handleFileUploaded} />

      <SearchBar onSearch={handleSearch} />

      {searchResults && (
        <SearchResults results={searchResults.results} query={currentQuery} />
      )}
    </div>
  );
}

export default App;
