import db from "../db.js";
import { parsePromptToBlocks, blocksToPrompt, normalizeBlock } from "../prompts/blocks.js";

/**
 * promptVersions — helper layer between the SuperAdmin Prompts Library
 * routes and the prompt_versions table. Centralizes the rules so the
 * route handlers stay thin:
 *
 *   • Block storage is preferred — when callers save blocks we
 *     persist BOTH blocks_jsonb (authoritative) AND prompt_text
 *     (assembled string for runtime back-compat with chat.js /
 *     interview.js, which still read from settings.value).
 *
 *   • Block reads — if blocks_jsonb is present, return it directly.
 *     If it's null (legacy text-only versions), parse prompt_text on
 *     demand. Either way the caller gets a normalized array.
 *
 *   • version_number is auto-incremented per prompt_key. Existing
 *     rows that pre-date the column are renumbered lazily on next
 *     write to that key (cheap; max ~50 rows per key).
 *
 *   • New columns from add-prompt-versions-blocks.sql are nullable,
 *     so this module never assumes they exist on a row — always
 *     defends.
 *
 * Public API:
 *   listVersionsForKey(promptKey)     → versions sorted newest first
 *   getVersionById(id)                → single version with blocks
 *   getCurrentBlocks(promptKey)       → blocks of the active version
 *   saveNewVersion({...})             → create version row + return it
 *   nextVersionNumber(promptKey)      → max+1 for that key
 */

/**
 * Coerce a row from the prompt_versions table into the API shape.
 * Always populates `blocks` (parsed on demand if blocks_jsonb is null).
 */
export function rowToVersion(row) {
  if (!row) return null;
  let blocks = null;
  if (row.blocks_jsonb) {
    // PG's jsonb already comes back as an object/array via pg driver.
    // Defensive: if it's a string (rare — manual SELECT on text column),
    // try to parse.
    let raw = row.blocks_jsonb;
    if (typeof raw === "string") {
      try {
        raw = JSON.parse(raw);
      } catch {
        raw = null;
      }
    }
    if (Array.isArray(raw)) {
      blocks = raw.map(normalizeBlock);
    }
  }
  if (!blocks && row.prompt_text) {
    blocks = parsePromptToBlocks(row.prompt_text);
  }
  return {
    id: row.id,
    prompt_key: row.prompt_key,
    prompt_text: row.prompt_text || "",
    blocks: blocks || [],
    label: row.label || null,
    note: row.note || null,
    version_number: row.version_number ?? null,
    created_by: row.created_by || null,
    created_at: row.created_at,
  };
}

/**
 * List all versions for a prompt_key, newest first. Used by the
 * SuperAdmin "Recent versions" panel + the diff modal.
 */
export async function listVersionsForKey(promptKey) {
  const rows = await db.all(
    `SELECT id, prompt_key, prompt_text, blocks_jsonb, label, note,
            version_number, created_by, created_at
     FROM prompt_versions
     WHERE prompt_key = ?
     ORDER BY created_at DESC`,
    [promptKey]
  );
  return rows.map(rowToVersion);
}

/**
 * Single version by id — used by the diff modal and the rollback
 * endpoint.
 */
export async function getVersionById(id) {
  const row = await db.get(
    `SELECT id, prompt_key, prompt_text, blocks_jsonb, label, note,
            version_number, created_by, created_at
     FROM prompt_versions
     WHERE id = ?`,
    [id]
  );
  return rowToVersion(row);
}

/**
 * Get the live blocks for a prompt_key — reads from settings.value
 * (the runtime source of truth), parses to blocks on the fly, and
 * tries to attach the matching version_number from prompt_versions
 * if one exists.
 *
 * Returns { blocks, prompt_text, version_number, label, note,
 * created_at, created_by, prompt_key }.
 */
export async function getCurrentBlocks(promptKey) {
  const settingRow = await db.get(
    "SELECT value FROM settings WHERE key = ? AND client_id IS NULL",
    [promptKey]
  );
  const promptText = settingRow?.value || "";
  const blocks = parsePromptToBlocks(promptText);

  // Best-effort match: look up the most-recently-saved version with
  // the same text. Lets the UI show "v7" alongside the live value
  // even though settings.value is the source of truth.
  const matchingVersion = await db.get(
    `SELECT version_number, label, note, created_by, created_at
     FROM prompt_versions
     WHERE prompt_key = ? AND prompt_text = ?
     ORDER BY created_at DESC LIMIT 1`,
    [promptKey, promptText]
  );

  return {
    prompt_key: promptKey,
    prompt_text: promptText,
    blocks,
    version_number: matchingVersion?.version_number ?? null,
    label: matchingVersion?.label || null,
    note: matchingVersion?.note || null,
    created_by: matchingVersion?.created_by || null,
    created_at: matchingVersion?.created_at || null,
  };
}

/**
 * Compute the next version_number for a prompt_key. Idempotent —
 * always re-derives from the table.
 */
export async function nextVersionNumber(promptKey) {
  const row = await db.get(
    `SELECT MAX(version_number) AS max_v
     FROM prompt_versions
     WHERE prompt_key = ?`,
    [promptKey]
  );
  return (row?.max_v ?? 0) + 1;
}

/**
 * Save a new version row. Accepts EITHER blocks (preferred — server
 * assembles the text) OR prompt_text directly (legacy path used by
 * the existing text-area editor).
 *
 * Always writes both columns so reads are O(1) regardless of which
 * editor created the version.
 *
 * Returns the persisted row in API shape (via rowToVersion).
 */
export async function saveNewVersion({ promptKey, blocks, promptText, label, note, createdBy }) {
  let finalText;
  let finalBlocks;
  if (Array.isArray(blocks) && blocks.length > 0) {
    finalBlocks = blocks.map(normalizeBlock);
    finalText = blocksToPrompt(finalBlocks);
  } else if (typeof promptText === "string" && promptText.length > 0) {
    finalText = promptText;
    finalBlocks = parsePromptToBlocks(promptText);
  } else {
    throw new Error("saveNewVersion requires either blocks or promptText");
  }

  const versionNumber = await nextVersionNumber(promptKey);

  const result = await db.run(
    `INSERT INTO prompt_versions
       (prompt_key, prompt_text, blocks_jsonb, label, note,
        version_number, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      promptKey,
      finalText,
      JSON.stringify(finalBlocks),
      label || "Saved version",
      note || null,
      versionNumber,
      createdBy || "unknown",
    ]
  );

  const row = await db.get(
    `SELECT id, prompt_key, prompt_text, blocks_jsonb, label, note,
            version_number, created_by, created_at
     FROM prompt_versions WHERE id = ?`,
    [result.lastInsertRowid]
  );
  return rowToVersion(row);
}
