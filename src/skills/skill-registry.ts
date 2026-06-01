import fs from "node:fs/promises";
import path from "node:path";
import type { Skill } from "./types.js";

const SKILLS_DIR = ".blackpearl/skills";

export class SkillRegistry {
  private skills: Skill[] = [];

  /** Load all SKILL.md files from the skills directory */
  async loadAll(workspaceRoot: string): Promise<void> {
    const skillsDir = path.join(workspaceRoot, SKILLS_DIR);
    let entries: { name: string; isDirectory: () => boolean }[];

    try {
      entries = await fs.readdir(skillsDir, { withFileTypes: true }) as unknown as typeof entries;
    } catch {
      return; // No skills directory
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
      try {
        const raw = await fs.readFile(skillPath, "utf8");
        const skill = this.parseSkill(entry.name, raw);
        if (skill) this.skills.push(skill);
      } catch {
        // Skip unreadable skills
      }
    }
  }

  /** Find a skill that matches the user input. Returns undefined if no match. */
  match(userInput: string): Skill | undefined {
    const lower = userInput.toLowerCase();
    // Score each skill by keyword overlap with description
    const scored = this.skills
      .map((skill) => {
        const keywords = skill.description.toLowerCase().split(/[\s,，、]+/);
        let score = 0;
        for (const kw of keywords) {
          if (kw.length > 3 && lower.includes(kw)) {
            score += 1;
          }
        }
        // Bonus for exact name match
        if (lower.includes(skill.name.toLowerCase())) {
          score += 3;
        }
        return { skill, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored[0]?.skill;
  }

  /** List all loaded skills */
  list(): Skill[] {
    return [...this.skills];
  }

  // ── Private ────────────────────────────────────────

  private parseSkill(dirName: string, content: string): Skill | undefined {
    const fm = extractFrontmatter(content);
    if (!fm) return undefined;

    const name = typeof fm.name === "string" ? fm.name : dirName;
    const description = typeof fm.description === "string" ? fm.description : "";
    const userInvocable = fm.userInvocable !== false && fm.user_invocable !== false;

    // Extract Markdown body (everything after the second ---)
    const bodyStart = content.indexOf("---", 3);
    const body =
      bodyStart >= 0
        ? content.slice(bodyStart + 3).trim()
        : content.trim();

    const allowedTools: string[] | undefined = Array.isArray(fm["allowed-tools"])
      ? (fm["allowed-tools"] as string[])
      : Array.isArray(fm.allowedTools)
        ? (fm.allowedTools as string[])
        : undefined;

    const skill: Skill = {
      name,
      description,
      instructions: body,
      userInvocable,
    };
    if (allowedTools) skill.allowedTools = allowedTools;
    return skill;
  }
}

// ── Minimal YAML frontmatter parser ──────────────────

function extractFrontmatter(
  content: string,
): Record<string, unknown> | undefined {
  if (!content.startsWith("---")) return undefined;

  const end = content.indexOf("---", 3);
  if (end < 0) return undefined;

  const fmText = content.slice(3, end);
  const result: Record<string, unknown> = {};

  let currentListKey: string | null = null;
  let currentList: string[] = [];

  for (const line of fmText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // List item
    if (trimmed.startsWith("- ")) {
      const item = trimmed.slice(2).trim();
      if (currentListKey) {
        currentList.push(item);
      }
      continue;
    }

    // Flush pending list
    if (currentListKey) {
      result[currentListKey] = currentList;
      currentListKey = null;
      currentList = [];
    }

    // key: value
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx < 0) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    if (value === "") {
      // Could be start of a list
      currentListKey = key;
      currentList = [];
    } else if (value === "true" || value === "false") {
      result[key] = value === "true";
    } else {
      result[key] = value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  }

  // Flush final pending list
  if (currentListKey) {
    result[currentListKey] = currentList;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}
