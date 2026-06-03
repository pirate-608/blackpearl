import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getSkillSearchRoots, SkillRegistry } from "./skill-registry.js";

let workspaceRoot: string;
let userAgentsRoot: string;
let userBlackpearlRoot: string;
let originalAgentsHome: string | undefined;
let originalBlackpearlHome: string | undefined;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blackpearl-skills-workspace-"));
  userAgentsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blackpearl-user-agents-"));
  userBlackpearlRoot = await fs.mkdtemp(path.join(os.tmpdir(), "blackpearl-user-home-"));
  originalAgentsHome = process.env.AGENTS_HOME;
  originalBlackpearlHome = process.env.BLACKPEARL_HOME;
  process.env.AGENTS_HOME = userAgentsRoot;
  process.env.BLACKPEARL_HOME = userBlackpearlRoot;
});

afterEach(async () => {
  restoreEnv("AGENTS_HOME", originalAgentsHome);
  restoreEnv("BLACKPEARL_HOME", originalBlackpearlHome);
  await fs.rm(workspaceRoot, { recursive: true, force: true });
  await fs.rm(userAgentsRoot, { recursive: true, force: true });
  await fs.rm(userBlackpearlRoot, { recursive: true, force: true });
});

describe("SkillRegistry", () => {
  it("loads standard project skills from .agents/<skill-name>/SKILL.md", async () => {
    await writeSkill(
      path.join(workspaceRoot, ".agents", "code-review"),
      "code-review",
      "审查 TypeScript 代码并发现潜在 bug",
      "Use a practical review checklist.",
    );

    const registry = new SkillRegistry();
    await registry.loadAll(workspaceRoot);

    const skills = registry.list();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "code-review",
      description: "审查 TypeScript 代码并发现潜在 bug",
      instructions: "Use a practical review checklist.",
      source: {
        scope: "project",
        format: "agents",
      },
    });
  });

  it("keeps compatibility with legacy .blackpearl/skills", async () => {
    await writeSkill(
      path.join(workspaceRoot, ".blackpearl", "skills", "legacy-skill"),
      "legacy-skill",
      "legacy description",
      "Legacy instructions.",
    );

    const registry = new SkillRegistry();
    await registry.loadAll(workspaceRoot);

    expect(registry.list()[0]).toMatchObject({
      name: "legacy-skill",
      source: {
        scope: "project",
        format: "blackpearl-legacy",
      },
    });
  });

  it("keeps compatibility with user-level legacy .blackpearl/skills", async () => {
    await writeSkill(
      path.join(userBlackpearlRoot, "skills", "user-legacy"),
      "user-legacy",
      "user legacy description",
      "User legacy instructions.",
    );

    const registry = new SkillRegistry();
    await registry.loadAll(workspaceRoot);

    expect(registry.list()[0]).toMatchObject({
      name: "user-legacy",
      source: {
        scope: "user",
        format: "blackpearl-legacy",
      },
    });
  });

  it("loads user skills and lets project skills override same-name user skills", async () => {
    await writeSkill(
      path.join(userAgentsRoot, "shared-skill"),
      "shared-skill",
      "user description",
      "User instructions.",
    );
    await writeSkill(
      path.join(workspaceRoot, ".agents", "shared-skill"),
      "shared-skill",
      "project description",
      "Project instructions.",
    );

    const registry = new SkillRegistry();
    await registry.loadAll(workspaceRoot);

    const skills = registry.list();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      name: "shared-skill",
      description: "project description",
      instructions: "Project instructions.",
      source: {
        scope: "project",
        format: "agents",
      },
    });
  });

  it("prefers project .agents over project legacy skills with the same name", async () => {
    await writeSkill(
      path.join(workspaceRoot, ".blackpearl", "skills", "same-name"),
      "same-name",
      "legacy project description",
      "Legacy project instructions.",
    );
    await writeSkill(
      path.join(workspaceRoot, ".agents", "same-name"),
      "same-name",
      "standard project description",
      "Standard project instructions.",
    );

    const registry = new SkillRegistry();
    await registry.loadAll(workspaceRoot);

    expect(registry.list()[0]).toMatchObject({
      name: "same-name",
      description: "standard project description",
      source: {
        scope: "project",
        format: "agents",
      },
    });
  });

  it("uses platform path joins for all search roots", () => {
    const roots = getSkillSearchRoots(workspaceRoot);

    expect(roots.map((root) => root.skillsDir)).toEqual([
      path.join(userBlackpearlRoot, "skills"),
      userAgentsRoot,
      path.join(workspaceRoot, ".blackpearl", "skills"),
      path.join(workspaceRoot, ".agents"),
    ]);
  });

  it("accepts single-line comma separated allowed-tools for compatibility", async () => {
    const skillDir = path.join(workspaceRoot, ".agents", "single-line-tools");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      [
        "---",
        "name: single-line-tools",
        "description: single line tools description",
        "allowed-tools: file_read, file_write",
        "---",
        "",
        "Instructions.",
        "",
      ].join("\n"),
      "utf8",
    );

    const registry = new SkillRegistry();
    await registry.loadAll(workspaceRoot);

    expect(registry.list()[0]?.allowedTools).toEqual(["file_read", "file_write"]);
  });
});

async function writeSkill(
  skillDir: string,
  name: string,
  description: string,
  body: string,
): Promise<void> {
  await fs.mkdir(skillDir, { recursive: true });
  await fs.writeFile(
    path.join(skillDir, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\nallowed-tools:\n  - file_read\n---\n\n${body}\n`,
    "utf8",
  );
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
