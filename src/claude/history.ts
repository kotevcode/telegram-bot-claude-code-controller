import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { HistoryEntry } from "../types.js";

const CLAUDE_DIR = join(homedir(), ".claude");
const HISTORY_FILE = join(CLAUDE_DIR, "history.jsonl");
const PROJECTS_DIR = join(CLAUDE_DIR, "projects");

export async function getRecentSessions(limit = 20): Promise<HistoryEntry[]> {
  try {
    const content = await readFile(HISTORY_FILE, "utf-8");
    const lines = content.trim().split("\n").filter(Boolean);

    const entries: HistoryEntry[] = [];

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        const sessionId = String(parsed.sessionId ?? parsed.session_id ?? "");
        const projectPath = String(parsed.project ?? parsed.project_path ?? parsed.projectPath ?? parsed.cwd ?? "");
        // timestamp can be epoch ms (number) or ISO string
        const rawTs = parsed.timestamp ?? parsed.created_at ?? "";
        const timestamp = typeof rawTs === "number"
          ? new Date(rawTs).toISOString()
          : String(rawTs);

        entries.push({
          sessionId,
          projectPath,
          timestamp,
          model: String(parsed.model ?? "unknown"),
          summary: parsed.display ?? parsed.summary ?? parsed.query ?? undefined,
        });
      } catch {
        // Skip malformed lines
        continue;
      }
    }

    // Deduplicate by sessionId (history has one entry per message, keep the latest)
    const deduplicated = new Map<string, HistoryEntry>();
    for (const entry of entries) {
      if (entry.sessionId) {
        deduplicated.set(entry.sessionId, entry);
      }
    }
    entries.length = 0;
    entries.push(...deduplicated.values());

    // Sort by most recent first
    entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return entries.slice(0, limit);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

export async function resolveSessionId(partialId: string): Promise<{ sessionId: string; projectPath: string } | null> {
  // If it already looks like a full UUID, return as-is
  if (partialId.includes("-") && partialId.length > 20) {
    const sessions = await getRecentSessions(100);
    const match = sessions.find((s) => s.sessionId === partialId);
    return match ? { sessionId: match.sessionId, projectPath: match.projectPath } : { sessionId: partialId, projectPath: process.cwd() };
  }

  // Search history for a session ID starting with the partial
  const sessions = await getRecentSessions(100);
  const matches = sessions.filter((s) => s.sessionId.startsWith(partialId));

  if (matches.length === 1) {
    return { sessionId: matches[0].sessionId, projectPath: matches[0].projectPath };
  }
  if (matches.length > 1) {
    return { sessionId: matches[0].sessionId, projectPath: matches[0].projectPath };
  }
  return null;
}

export async function getSessionsForProject(
  projectPath: string,
): Promise<HistoryEntry[]> {
  try {
    // Claude encodes project paths by replacing / with -
    const encodedPath = projectPath.replace(/\//g, "-").replace(/^-/, "");
    const projectDir = join(PROJECTS_DIR, encodedPath);

    const files = await readdir(projectDir);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    const entries: HistoryEntry[] = [];

    for (const file of jsonlFiles) {
      const sessionId = file.replace(".jsonl", "");
      try {
        const content = await readFile(join(projectDir, file), "utf-8");
        const firstLine = content.split("\n")[0];
        if (firstLine) {
          const parsed = JSON.parse(firstLine);
          entries.push({
            sessionId,
            projectPath,
            timestamp: String(parsed.timestamp ?? parsed.created_at ?? ""),
            model: String(parsed.model ?? "unknown"),
            summary: parsed.summary ?? parsed.query ?? undefined,
          });
        }
      } catch {
        // Include with minimal info if we can't parse the file
        entries.push({
          sessionId,
          projectPath,
          timestamp: "",
          model: "unknown",
        });
      }
    }

    entries.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    return entries;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}
