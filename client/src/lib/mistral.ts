/**
 * Mistral AI client helpers.
 *
 * MODEL CONFIGURATION — update these strings when new versions are released.
 * TODO: bump visionModel to 'pixtral-large-latest' when it becomes GA.
 * TODO: bump textModel to 'mistral-large-latest' for higher quality if budget allows.
 */
export const MISTRAL_MODELS = {
  vision: 'pixtral-12b-2409',
  text: 'mistral-small-latest',
  large: 'mistral-large-latest',   // agent orchestrator
} as const;

const API_BASE = 'https://api.mistral.ai/v1';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image_url'; image_url: { url: string } };
type ContentPart = TextPart | ImagePart;

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | ContentPart[];
}

interface MistralResponse {
  choices: Array<{
    message: { content: string };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function mistralChat(
  messages: ChatMessage[],
  model: string,
  apiKey: string,
  maxTokens = 2048,
  temperature = 0.7,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  };

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Mistral ${response.status}: ${err}`);
  }

  const data = (await response.json()) as MistralResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Mistral returned an empty response');
  return content;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Call the vision-capable model with an image + text prompt.
 * The imageDataUrl should be a base64 data URL (data:image/png;base64,...).
 */
export async function callVision(
  imageDataUrl: string,
  textPrompt: string,
  apiKey: string,
  options?: { maxTokens?: number; temperature?: number },
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: imageDataUrl } },
        { type: 'text', text: textPrompt },
      ],
    },
  ];
  return mistralChat(
    messages,
    MISTRAL_MODELS.vision,
    apiKey,
    options?.maxTokens ?? 2048,
    options?.temperature ?? 0.7,
  );
}

/**
 * Call the text-only model with a plain prompt string.
 */
export async function callText(prompt: string, apiKey: string): Promise<string> {
  const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
  return mistralChat(messages, MISTRAL_MODELS.text, apiKey);
}

/**
 * Call Mistral Large (agent orchestrator) with a system + user message pair.
 * Requests JSON output via response_format.
 */
export async function callLarge(
  systemPrompt: string,
  userMessage: string,
  apiKey: string,
): Promise<string> {
  const body = {
    model: MISTRAL_MODELS.large,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ],
    temperature: 0.85,
    max_tokens: 4096,
    response_format: { type: 'json_object' },
  };

  const response = await fetch(`${API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.statusText);
    throw new Error(`Mistral Large ${response.status}: ${err}`);
  }

  const data = (await response.json()) as MistralResponse;
  const content = data.choices[0]?.message?.content;
  if (!content) throw new Error('Mistral Large returned an empty response');
  return content;
}

/**
 * Strip markdown code fences from a response and extract the JSON object.
 * Handles cases where the model wraps JSON in ```json ... ``` blocks.
 */
export function extractJSON(raw: string): string {
  // Remove markdown fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  // Find first { and last } to extract the JSON object
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    return raw.slice(first, last + 1);
  }

  return raw.trim();
}
