-- =============================================
-- СХЕМА БАЗЫ ДАННЫХ QUOTE FINDER
-- =============================================

-- Удаляем старые таблицы, если они есть (для чистоты)
DROP TABLE IF EXISTS sentences CASCADE;
DROP TABLE IF EXISTS documents CASCADE;

-- 1. Таблица документов
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,                    -- Уникальный ID
    filename TEXT NOT NULL,                   -- Название файла на сервере
    original_name TEXT NOT NULL,              -- Оригинальное имя файла
    file_type VARCHAR(10) NOT NULL,           -- Расширение: txt, pdf, docx
    file_size INTEGER,                        -- Размер в байтах
    uploaded_at TIMESTAMP DEFAULT NOW()       -- Дата загрузки
);

-- 2. Таблица предложений (контекстов)
CREATE TABLE sentences (
    id SERIAL PRIMARY KEY,                    -- Уникальный ID предложения
    document_id INTEGER NOT NULL,             -- Ссылка на документ
    position INTEGER NOT NULL,                -- Порядковый номер в тексте
    content TEXT NOT NULL,                    -- Сам текст предложения
    tsv tsvector,                             -- Вектор для полнотекстового поиска
    
    -- Внешний ключ: если документ удалят, удалятся и его предложения
    CONSTRAINT fk_document
        FOREIGN KEY (document_id) 
        REFERENCES documents(id) 
        ON DELETE CASCADE
);

-- 3. Создаём индекс для быстрого поиска
CREATE INDEX sentences_tsv_idx ON sentences USING GIN(tsv);

-- 4. Триггер: автоматически заполняет tsv при добавлении предложения
CREATE OR REPLACE FUNCTION sentences_tsv_trigger() RETURNS trigger AS $$
begin
    -- to_tsvector разбивает текст на лексемы с учётом русской морфологии
    new.tsv := to_tsvector('russian', new.content);
    return new;
end
$$ LANGUAGE plpgsql;

-- Привязываем триггер к таблице
DROP TRIGGER IF EXISTS tsvectorupdate ON sentences;
CREATE TRIGGER tsvectorupdate 
    BEFORE INSERT OR UPDATE 
    ON sentences 
    FOR EACH ROW 
    EXECUTE FUNCTION sentences_tsv_trigger();

-- =============================================
-- ТЕСТОВЫЕ ДАННЫЕ (проверим, что всё работает)
-- =============================================

-- Вставляем тестовый документ
INSERT INTO documents (filename, original_name, file_type, file_size) 
VALUES ('test.txt', 'Философия.txt', 'txt', 1024);

-- Вставляем тестовые предложения
INSERT INTO sentences (document_id, position, content) VALUES
    (1, 0, 'Философия — это особая форма познания мира.'),
    (1, 1, 'Философы размышляют о природе бытия.'),
    (1, 2, 'Античная философия заложила основы науки.'),
    (1, 3, 'Платон был выдающимся философом древности.'),
    (1, 4, 'Философские труды изучают в университетах.');