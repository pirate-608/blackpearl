/** A loaded Skill from a SKILL.md file */
export type Skill = {
  name: string;
  description: string;
  instructions: string;
  allowedTools?: string[];
  userInvocable: boolean;
  source?: SkillSource;
};

export type SkillSourceScope = "user" | "project";

export type SkillSourceFormat = "agents" | "blackpearl-legacy";

export type SkillSource = {
  scope: SkillSourceScope;
  format: SkillSourceFormat;
  rootDir: string;
  skillDir: string;
  filePath: string;
};
