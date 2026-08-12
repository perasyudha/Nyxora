/**
 * AutoCorrectionCapture
 *
 * Detects when the AI retries a tool call after a failure and automatically
 * stores a permanent correction in episodic memory so the mistake is never
 * repeated — for ANY tool, not just specific ones.
 *
 * How it works:
 * 1. Track every (toolName, args, errorMessage) triplet from failed calls.
 * 2. When the same tool succeeds on a later turn with DIFFERENT args, compare
 *    the failed vs. successful call and generate a correction fact.
 * 3. Store that fact as `system_correction` / `permanent` in episodic DB.
 */

import { episodicDB } from '../memory/episodic';

interface FailedCall {
  toolName: string;
  args: Record<string, any>;
  errorMessage: string;
  timestamp: number;
}

// In-memory store per session: toolName → list of failed calls this turn cycle
const sessionFailedCalls = new Map<string, Map<string, FailedCall[]>>();

/** Record a failed tool call. Call this immediately after a tool returns an error. */
export function recordFailedCall(
  sessionId: string,
  toolName: string,
  args: Record<string, any>,
  errorMessage: string
): void {
  if (!sessionFailedCalls.has(sessionId)) {
    sessionFailedCalls.set(sessionId, new Map());
  }
  const byTool = sessionFailedCalls.get(sessionId)!;
  if (!byTool.has(toolName)) byTool.set(toolName, []);
  byTool.get(toolName)!.push({ toolName, args, errorMessage, timestamp: Date.now() });
}

/** Check if a successful tool call is a retry of a previously failed one.
 *  If so, extract the correction and persist it to episodic DB. */
export async function checkAndCaptureCorrection(
  sessionId: string,
  toolName: string,
  successArgs: Record<string, any>
): Promise<void> {
  const byTool = sessionFailedCalls.get(sessionId);
  if (!byTool) return;

  const failures = byTool.get(toolName);
  if (!failures || failures.length === 0) return;

  // Only capture if args are DIFFERENT from the failed ones (i.e. it was a genuine fix)
  const relevantFailures = failures.filter(f => {
    const failedStr = JSON.stringify(f.args);
    const successStr = JSON.stringify(successArgs);
    return failedStr !== successStr;
  });

  if (relevantFailures.length === 0) return;

  // Take the most recent failure for comparison
  const lastFailure = relevantFailures[relevantFailures.length - 1];

  // Build the correction fact from the diff
  const correctionFact = buildCorrectionFact(toolName, lastFailure, successArgs);
  if (!correctionFact) return;

  // Avoid storing trivial/duplicate corrections
  const existing = episodicDB.getMemories().find(m =>
    m.category === 'system_correction' &&
    m.fact.toLowerCase().includes(toolName.toLowerCase()) &&
    wordOverlap(m.fact, correctionFact) > 0.55
  );
  if (existing) {
    // Reinforce confidence instead of duplicating
    episodicDB.addCandidateFact(existing.fact, 1.0, 'system_correction', 'permanent');
    console.log(`[AutoCorrection] Reinforced existing correction for ${toolName}.`);
  } else {
    episodicDB.addCandidateFact(correctionFact, 1.0, 'system_correction', 'permanent');
    console.log(`[AutoCorrection] ✅ Stored new correction for ${toolName}: ${correctionFact.substring(0, 100)}...`);
  }

  // Clear this tool's failure history after a successful capture
  byTool.delete(toolName);
}

/** Clear all failure history for a session (call at end of request). */
export function clearSessionFailures(sessionId: string): void {
  sessionFailedCalls.delete(sessionId);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildCorrectionFact(
  toolName: string,
  failure: FailedCall,
  successArgs: Record<string, any>
): string | null {
  const failedArgs = failure.args;
  const errorMsg = failure.errorMessage.substring(0, 200);

  // Find which args changed between failed → success
  const changedKeys = Object.keys(successArgs).filter(k => {
    const fv = String(failedArgs[k] ?? '');
    const sv = String(successArgs[k] ?? '');
    return fv !== sv && sv.trim() !== '';
  });

  // ── Specialised patterns ────────────────────────────────────────────────

  // Pattern: run_terminal_command — command string changed
  if (toolName === 'run_terminal_command' || toolName === 'run_terminal_command_pty') {
    const failCmd = String(failedArgs.command || '').trim();
    const succCmd = String(successArgs.command || '').trim();
    if (!failCmd || !succCmd || failCmd === succCmd) return null;

    // Detect duplicated program name artifact (e.g. "fastfetch ... fastfetch ...")
    const baseProgram = failCmd.split(/\s+/)[0];
    if (failCmd.split(baseProgram).length > 2) {
      return `Command "${baseProgram}" must not have its program name repeated inside the argument list. ` +
        `Correct form: "${succCmd}". Incorrect form that caused an error: "${failCmd.substring(0, 120)}". ` +
        `Error was: ${errorMsg}`;
    }

    return `When running terminal command "${baseProgram}", the correct working invocation is: ` +
      `"${succCmd}". The previously attempted form "${failCmd.substring(0, 120)}" failed with: ${errorMsg}`;
  }

  // Pattern: generic tool — specific args changed
  if (changedKeys.length > 0) {
    const changes = changedKeys.map(k =>
      `"${k}": changed from "${String(failedArgs[k]).substring(0, 60)}" to "${String(successArgs[k]).substring(0, 60)}"`
    ).join('; ');

    return `Tool "${toolName}" previously failed with args: ${JSON.stringify(failedArgs).substring(0, 200)}. ` +
      `Error: ${errorMsg}. ` +
      `It succeeded after correcting: ${changes}. Apply these corrections in future calls to this tool.`;
  }

  return null;
}

function wordOverlap(a: string, b: string): number {
  const tokenise = (s: string) =>
    new Set(s.toLowerCase().split(/[\W_]+/).filter(w => w.length > 3));
  const wa = tokenise(a);
  const wb = tokenise(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let intersection = 0;
  wa.forEach(w => { if (wb.has(w)) intersection++; });
  return intersection / Math.max(wa.size, wb.size);
}
