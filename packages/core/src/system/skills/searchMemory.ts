import { logger } from '../../memory/logger';
import { episodicDB } from '../../memory/episodic';

export function executeSearchMemory(query: string, limit?: number): string {
  try {
    const maxResults = limit || 10;
    let output = '';

    // ── 1. Search Episodic Memory (stored facts about user) ───────────────────
    // This is the PRIMARY memory store: facts extracted by ReflectionEngine.
    const allEpisodic = episodicDB.getMemories();
    const q = query.toLowerCase();

    let episodicMatches: any[] = [];

    if (q === 'all' || q === 'semua' || q === 'all memories' || q === 'semua memori') {
      // Return all episodic facts when user asks for full list
      episodicMatches = allEpisodic.slice(0, maxResults * 2);
    } else {
      // Keyword match against fact text
      episodicMatches = allEpisodic
        .filter(m => m.fact.toLowerCase().includes(q))
        .slice(0, maxResults);
    }

    if (episodicMatches.length > 0) {
      output += `📚 **Episodic Memory** (${episodicMatches.length} facts found for "${query}"):\n\n`;
      episodicMatches.forEach((m, idx) => {
        const ruleLabel = m.rule_type === 'permanent' ? '🔒 Permanent' : m.rule_type === 'temporary' ? '⏱ Temporary' : '👁 Observation';
        output += `[${idx + 1}] [${m.category}] ${ruleLabel} (conf: ${(m.confidence * 100).toFixed(0)}%)\n`;
        output += `   ${m.fact}\n\n`;
      });
    }

    // ── 2. Also search Personas ───────────────────────────────────────────────
    const personas = episodicDB.getPersonas();
    const personaMatches = personas.filter(p =>
      q === 'all' || q === 'semua' || q === 'all memories' || p.trait.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
    if (personaMatches.length > 0) {
      output += `🧠 **User Persona Traits** (${personaMatches.length} found):\n\n`;
      personaMatches.forEach((p, idx) => {
        output += `[${idx + 1}] [${p.category}] ${p.trait} (conf: ${(p.confidence * 100).toFixed(0)}%)\n\n`;
      });
    }

    // ── 3. Search Chat History via FTS5 (fallback) ────────────────────────────
    if (q !== 'all' && q !== 'semua' && q !== 'all memories') {
      const chatResults = logger.searchMemoryByKeyword(query, Math.floor(maxResults / 2));
      if (chatResults.length > 0) {
        output += `💬 **Chat History** (${chatResults.length} messages found for "${query}"):\n\n`;
        chatResults.forEach((entry, idx) => {
          let contentStr = typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content);
          if (contentStr.length > 300) contentStr = contentStr.substring(0, 300) + '... [TRUNCATED]';
          output += `[${idx + 1}] Role: ${entry.role}\n`;
          output += `   ${contentStr}\n\n`;
        });
      }
    }

    if (!output) {
      return `Tidak ada memori yang ditemukan untuk query: "${query}". Fakta ini belum pernah disimpan ke dalam database.`;
    }

    return output.trim();
  } catch (error: any) {
    return `Failed to search memory: ${error.message}`;
  }
}

export const searchMemoryToolDefinition = {
  type: "function",
  function: {
    name: "search_memory",
    description: "Search your stored long-term memories (episodic facts) and past conversations using keyword matching. ALWAYS use this tool BEFORE claiming you remember or have learned something about the user. Use 'all' as query to list all stored facts.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The keyword or phrase to search for in stored facts and chat history. Use 'all' to retrieve all stored episodic memories. Keep it concise for better matches (e.g., 'K-Pop', 'Kediri', 'trading preference').",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Default is 10.",
        }
      },
      required: ["query"],
    },
  },
};
