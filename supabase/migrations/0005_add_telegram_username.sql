-- Optional Telegram handle on applications. Used so we can connect with
-- approved participants on Telegram (independent of any bot integration).

ALTER TABLE applications ADD COLUMN telegram_username TEXT;
