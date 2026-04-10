/**
 * Token estimation utilities.
 * Uses cl100k_base (GPT-4 / Claude tokenizer) approximation.
 */

// Byte-to-token ratios observed across cl100k_base vocabulary
const CHARS_PER_TOKEN = 4.0; // conservative average for mixed code/text

/**
 * Estimate token count for a single text string.
 * Uses a fast character-count approximation calibrated to cl100k_base.
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate total tokens for an array of messages.
 * System messages count full, user/assistant messages count full.
 */
export function estimateMessagesTokens(messages: Message[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content);
    // Role annotation overhead
    total += 4;
  }
  // Cycle marker overhead
  total += 3;
  return total;
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}