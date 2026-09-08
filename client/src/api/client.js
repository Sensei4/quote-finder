import axios from "axios";

// Базовый URL бэкенда
const API_URL = "http://localhost:5000/api";

// Функция для загрузки файла
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    const response = await axios.post(`${API_URL}/upload`, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: "Ошибка загрузки файла" };
  }
};

// Функция для поиска цитат
export const searchQuotes = async (query) => {
  try {
    const response = await axios.get(`${API_URL}/search`, {
      params: { query },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: "Ошибка поиска" };
  }
};

// Функция для получения контекста
export const getContext = async (sentenceId, size = 2) => {
  try {
    const response = await axios.get(`${API_URL}/context/${sentenceId}`, {
      params: { size },
    });
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: "Ошибка загрузки контекста" };
  }
};

// Функция для проверки здоровья сервера
export const checkHealth = async () => {
  try {
    const response = await axios.get(`${API_URL}/health`);
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: "Сервер недоступен" };
  }
};

// Функция для экспорта в TXT
export const exportToTxt = async (sentences) => {
  try {
    const response = await axios.post(
      `${API_URL}/export/txt`,
      { sentences },
      { responseType: "blob" },
    );
    return response.data;
  } catch (error) {
    throw error.response?.data || { error: "Ошибка экспорта" };
  }
};
