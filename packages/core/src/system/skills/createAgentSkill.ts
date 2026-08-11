import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import { getPath } from '../../config/paths';

export const createAgentSkillToolDefinition = {
  type: "function",
  function: {
    name: "create_agent_skill",
    description: "Create a new programmatic external skill for the Nyxora Agent. This will automatically generate a SKILL.md with correct YAML frontmatter and the execution instructions in the ~/.nyxora/skills/ folder. Skills are just markdown playbooks, NOT executable scripts. Do NOT try to run chmod, bun, or ts-node on them.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name of the skill (snake_case, e.g., 'binance_trading')."
        },
        description: {
          type: "string",
          description: "A detailed description of what the skill does, which tools/actions it provides, and what environment variables it requires."
        },
        parameters: {
          type: "object",
          description: "The JSON Schema representing the tool's parameters (e.g., { action: { type: 'string' } }). CRITICAL: For enums, use a flat array (e.g., { type: 'string', enum: ['read', 'write'] }). Do NOT use nested arrays (e.g., [['read', 'write']])."
        },
        required: {
          type: "array",
          items: { type: "string" },
          description: "An array of required parameter names."
        },
        instructions: {
          type: "string",
          description: "The step-by-step markdown instructions for how the AI should execute this skill using its native tools (like run_terminal_command, curl, python3). Provide the exact commands needed. Do NOT write any TypeScript or Node.js code. Make it an instruction-based playbook."
        }
      },
      required: ["name", "description", "parameters", "required", "instructions"]
    }
  }
};

export async function createAgentSkill(name: string, description: string, parameters: any, required: string[], instructions: string): Promise<string> {
  try {
    const safeName = name.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase();
    if (!safeName) throw new Error("Invalid skill name.");

    const skillsDir = getPath('skills');
    const targetDir = path.join(skillsDir, safeName);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Generate YAML Frontmatter
    let finalParameters = parameters;
    if (parameters && parameters.type === 'object' && parameters.properties) {
      finalParameters = parameters.properties;
    }

    // Fix nested array enums common hallucination
    const fixEnums = (obj: any) => {
      if (typeof obj !== 'object' || obj === null) return;
      for (const key of Object.keys(obj)) {
        if (key === 'enum' && Array.isArray(obj[key]) && obj[key].length === 1 && Array.isArray(obj[key][0])) {
          obj[key] = obj[key][0];
        } else if (typeof obj[key] === 'object') {
          fixEnums(obj[key]);
        }
      }
    };
    fixEnums(finalParameters);

    const frontmatterObj = {
      name: safeName,
      description: description,
      version: '1.0.0',
      author: 'perasyudha',
      parameters: finalParameters,
      required: required
    };

    const frontmatterYaml = yaml.stringify(frontmatterObj);
    const skillMdContent = `---\n${frontmatterYaml}---\n\n# ${safeName}\n\n${description}\n\n## Instructions\n\n${instructions}\n`;
    
    fs.writeFileSync(path.join(targetDir, 'SKILL.md'), skillMdContent, 'utf8');

    // Hot-reload skills
    const { pluginManager } = require('../../plugin/registry');
    if (pluginManager && pluginManager.agentSkills) {
      await pluginManager.agentSkills.discoverSkills();
    }

    return `[Success] Programmatic Skill '${safeName}' has been successfully created. The SKILL.md file has been formatted with the correct YAML frontmatter and the execution instructions. The skill is now ready to be loaded by Nyxora's AgentSkills scanner.`;
  } catch (error: any) {
    return `[Error] Failed to create programmatic skill: ${error.message}`;
  }
}
