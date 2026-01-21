CREATE TABLE `api_settings` (
	`id` text PRIMARY KEY DEFAULT 'default' NOT NULL,
	`api_key` text,
	`api_host` text DEFAULT 'https://api.anthropic.com',
	`configured_at` integer
);
