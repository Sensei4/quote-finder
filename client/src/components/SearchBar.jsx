import { useState } from "react";
import "./SearchBar.css";

function SearchBar({ onSearch }) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (query.trim().length < 2) {
      alert("Введите минимум 2 символа");
      return;
    }

    setIsSearching(true);
    onSearch(query.trim(), () => setIsSearching(false));
  };

  return (
    <div className="search-bar">
      <form onSubmit={handleSubmit}>
        <div className="search-input-wrapper">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Введите слово или фразу для поиска..."
            className="search-input"
            disabled={isSearching}
          />
          <button
            type="submit"
            className="search-button"
            disabled={isSearching || query.trim().length < 2}
          >
            {isSearching ? "🔍 Поиск..." : "🔍 Найти"}
          </button>
        </div>
      </form>
      <p className="search-hint">
        Поиск работает с учётом морфологии: "философия" найдёт "философы",
        "философский" и т.д.
      </p>
    </div>
  );
}

export default SearchBar;
