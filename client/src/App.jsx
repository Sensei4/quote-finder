import { useState, useEffect } from "react";
import "./App.css";

function App() {
  const [serverStatus, setServerStatus] = useState("Проверяю соединение...");

  useEffect(() => {
    // Проверяем, что бэкенд запущен
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
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>📚 Quote Finder</h1>
        <p>Сайт для поиска цитат в загруженных документах</p>
      </header>

      <div className="status-bar">{serverStatus}</div>
    </div>
  );
}

export default App;
