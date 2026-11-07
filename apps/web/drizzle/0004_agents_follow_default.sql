-- Agents created before platform settings existed pinned the old env default; let them follow Admin → Settings → AI.
UPDATE "agents" SET "model" = '' WHERE "model" = 'claude-opus-5-5';
