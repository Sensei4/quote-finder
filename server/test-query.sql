-- Запрос 1: Ищем слово "философия"
SELECT content, ts_headline('russian', content, to_tsquery('russian', 'философия')) AS highlighted
FROM sentences 
WHERE tsv @@ to_tsquery('russian', 'философия');

-- Запрос 2: Ищем слово "философ" (другая форма!)
SELECT content 
FROM sentences 
WHERE tsv @@ to_tsquery('russian', 'философ');

-- Запрос 3: Посмотрим, как выглядит tsvector для первого предложения
SELECT content, tsv 
FROM sentences 
WHERE id = 1;