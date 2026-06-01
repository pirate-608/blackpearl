/** A loaded Skill from a SKILL.md file */
export type Skill = {
  name: string;
  description: string;
  instructions: string;
  allowedTools?: string[];
  userInvocable: boolean;
};
