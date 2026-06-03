import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  Skill,
  SkillSource,
  SkillSourceFormat,
  SkillSourceScope,
} from "./types.js";

const LEGACY_SKILLS_DIR = path.join(".blackpearl", "skills");
const SKILL_FILE = "SKILL.md";

type SkillSearchRoot = {
  scope: SkillSourceScope;
  format: SkillSourceFormat;
  rootDir: string;
  skillsDir: string;
};

export class SkillRegistry {
  private skills: Skill[] = [];

  /**
   * Load all SKILL.md files from user and project skill directories.
   *
   * Project skills override user skills with the same name. New skills should
   * use `.agents/<skill-name>/SKILL.md`; `.blackpearl/skills` remains as a
   * legacy compatibility path.
   */
  async loadAll(workspaceRoot: string): Promise<void> {
    const loaded = new Map<string, Skill>();

    for (const root of getSkillSearchRoots(workspaceRoot)) {
      const skills = await this.loadFromRoot(root);
      for (const skill of skills) {
        loaded.set(skill.name.toLowerCase(), skill);
      }
    }

    this.skills = [...loaded.values()];
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

  private async loadFromRoot(root: SkillSearchRoot): Promise<Skill[]> {
    let entries: { name: string; isDirectory: () => boolean }[];

    try {
      entries = await fs.readdir(root.skillsDir, { withFileTypes: true }) as unknown as typeof entries;
    } catch {
      return [];
    }

    const skills: Skill[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = path.join(root.skillsDir, entry.name);
      const skillPath = path.join(skillDir, SKILL_FILE);
      try {
        const raw = await fs.readFile(skillPath, "utf8");
        const source: SkillSource = {
          scope: root.scope,
          format: root.format,
          rootDir: root.rootDir,
          skillDir,
          filePath: skillPath,
        };
        const skill = this.parseSkill(entry.name, raw, source);
        if (skill) skills.push(skill);
      } catch {
        // Skip unreadable skills
      }
    }

    return skills;
  }

  private parseSkill(
    dirName: string,
    content: string,
    source?: SkillSource,
  ): Skill | undefined {
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

    const allowedTools =
      parseStringList(fm["allowed-tools"]) ?? parseStringList(fm.allowedTools);

    const skill: Skill = {
      name,
      description,
      instructions: body,
      userInvocable,
    };
    if (allowedTools) skill.allowedTools = allowedTools;
    if (source) skill.source = source;
    return skill;
  }
}

export function getSkillSearchRoots(workspaceRoot: string): SkillSearchRoot[] {
  const normalizedWorkspaceRoot = path.resolve(workspaceRoot);
  const roots: SkillSearchRoot[] = [];
  const userLegacyRoot = getUserBlackpearlRoot();
  const userAgentsRoot = getUserSkillRoot();

  if (userLegacyRoot) {
    roots.push({
      scope: "user",
      format: "blackpearl-legacy",
      rootDir: userLegacyRoot,
      skillsDir: path.join(userLegacyRoot, "skills"),
    });
  }

  if (userAgentsRoot) {
    roots.push({
      scope: "user",
      format: "agents",
      rootDir: userAgentsRoot,
      skillsDir: userAgentsRoot,
    });
  }

  roots.push(
    {
      scope: "project",
      format: "blackpearl-legacy",
      rootDir: normalizedWorkspaceRoot,
      skillsDir: path.join(normalizedWorkspaceRoot, LEGACY_SKILLS_DIR),
    },
    {
      scope: "project",
      format: "agents",
      rootDir: normalizedWorkspaceRoot,
      skillsDir: path.join(normalizedWorkspaceRoot, ".agents"),
    },
  );

  return roots;
}

export function getUserSkillRoot(): string | undefined {
  const configured = process.env.AGENTS_HOME;
  if (configured && configured.trim()) {
    return path.resolve(expandHome(configured.trim()));
  }

  const home = os.homedir();
  if (!home) {
    return undefined;
  }

  return path.join(home, ".agents");
}

export function getUserBlackpearlRoot(): string | undefined {
  const configured = process.env.BLACKPEARL_HOME;
  if (configured && configured.trim()) {
    return path.resolve(expandHome(configured.trim()));
  }

  const home = os.homedir();
  if (!home) {
    return undefined;
  }

  return path.join(home, ".blackpearl");
}

function expandHome(value: string): string {
  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

function parseStringList(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const unwrapped =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;

  return unwrapped
    .split(",")
    .map((item) => item.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"))
    .filter(Boolean);
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
