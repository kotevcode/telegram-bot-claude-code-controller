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
        entries.push({
          sessionId: String(parsed.session_id ?? parsed.sessionId ?? ""),
          projectPath: String(parsed.project_path ?? parsed.projectPath ?? parsed.cwd ?? ""),
          timestamp: String(parsed.timestamp ?? parsed.created_at ?? ""),
          model: String(parsed.model ?? "unknown"),
          summary: parsed.summary ?? parsed.query ?? undefined,
        });
      } catch {
        // Skip malformed lines
        continue;
      }
    }

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
