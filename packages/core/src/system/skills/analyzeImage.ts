import fs from 'fs';
import path from 'path';
import { loadConfig, loadApiKeys } from '../../config/parser';
import { executeWithRetry } from '../../utils/llmUtils';

export const analyzeLocalImageToolDefinition = {
  type: 'function',
  function: {
    name: 'analyze_local_image',
    description: 'Analyze a local image file using a Vision LLM to extract text, describe the image, or answer questions about it.',
    parameters: {
      type: 'object',
      properties: {
        imagePath: {
          type: 'string',
          description: 'The absolute path to the local image file (e.g. /home/user/image.png).'
        },
        prompt: {
          type: 'string',
          description: 'Instructions on what to analyze or extract from the image (e.g. "Extract all text", "Describe this UI", "Convert this to markdown").'
        }
      },
      required: ['imagePath', 'prompt']
    }
  }
};

// ===================================================
// AUXILIARY VISION CLIENT
// Like Hermes, vision uses a DEDICATED provider chain,
// completely separate from the main text LLM.
//
// Resolution order:
//   1. config.llm.vision_provider + config.llm.vision_model (explicit)
//   2. config.llm.provider === 'gemini' → use native Gemini SDK
//   3. Any provider with a gemini_key → use native Gemini SDK as vision auxiliary
//   4. Main LLM via executeWithRetry (OpenAI-compatible image_url format)
// ===================================================

async function callGeminiVision(base64Data: string, mimeType: string, prompt: string, model: string, geminiKey: string): Promise<string> {
  const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(geminiKey);
  const visionModel = genAI.getGenerativeModel({
    model: model,
    generationConfig: { temperature: 0.1 },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
    ]
  });

  const response = await visionModel.generateContent([
    prompt,
    { inlineData: { data: base64Data, mimeType: mimeType } }
  ]);

  const text = response.response.text();
  if (!text) throw new Error('Gemini Vision returned empty response.');
  return text;
}

export async function analyzeLocalImage(imagePath: string, prompt: string): Promise<string> {
  if (!fs.existsSync(imagePath)) {
    return `[Error] Image file not found at path: ${imagePath}`;
  }

  const buffer = fs.readFileSync(imagePath);
  const base64Data = buffer.toString('base64');
  
  const ext = path.extname(imagePath).toLowerCase();
  let mimeType = 'image/jpeg';
  if (ext === '.png') mimeType = 'image/png';
  else if (ext === '.webp') mimeType = 'image/webp';
  else if (ext === '.heic') mimeType = 'image/heic';
  else if (ext === '.heif') mimeType = 'image/heif';

  const config = loadConfig();
  const keys = await loadApiKeys();

  // ===================================================
  // STEP 1: Explicit auxiliary vision provider override
  // (config.yaml: llm.vision_provider / llm.vision_model)
  // ===================================================
  const visionProvider = config.llm?.vision_provider;
  const visionModel = config.llm?.vision_model;
  
  if (visionProvider === 'gemini' && visionModel) {
    const geminiKey = keys['gemini_key'];
    if (geminiKey) {
      try {
        return await callGeminiVision(base64Data, mimeType, prompt, visionModel, geminiKey);
      } catch (e: any) {
        console.error(`[Vision] Explicit auxiliary vision provider failed: ${e.message}`);
        // Fall through to next method
      }
    }
  }

  // ===================================================
  // STEP 2: Main provider is Gemini — use native SDK
  // ===================================================
  const mainProvider = config.llm?.provider || 'openai';
  const mainModel = config.llm?.model || 'gpt-4o-mini';
  
  if (mainProvider === 'gemini') {
    const geminiKey = keys['gemini_key'];
    if (geminiKey) {
      const gmModel = mainModel.includes('gemini') ? mainModel : 'gemini-2.5-flash';
      try {
        return await callGeminiVision(base64Data, mimeType, prompt, gmModel, geminiKey);
      } catch (e: any) {
        return `[System Error] Gemini Vision failed: ${e.message}`;
      }
    }
  }

  // ===================================================
  // STEP 3: Any provider, but Gemini key available →
  //         use Gemini as auxiliary vision fallback
  //         (like Hermes uses auxiliary_client for vision)
  // ===================================================
  const geminiKey = keys['gemini_key'];
  if (geminiKey) {
    try {
      return await callGeminiVision(base64Data, mimeType, prompt, 'gemini-2.5-flash', geminiKey);
    } catch (e: any) {
      console.error(`[Vision] Gemini auxiliary fallback failed: ${e.message}. Trying main provider...`);
      // Fall through to main provider
    }
  }

  // ===================================================
  // STEP 4: Main LLM via OpenAI-compatible image_url
  //         (for gpt-4o, claude w/ vision, etc.)
  // ===================================================
  try {
    const response = await executeWithRetry(async (client) => {
      return await client.chat({
        model: mainModel,
        messages: [
          { role: 'system', content: 'You are a helpful vision assistant. Analyze the image and answer the prompt.' },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Data}` } },
              { type: 'text', text: prompt }
            ]
          }
        ],
        temperature: 0.1
      });
    });
    return response.message.content || '[Error] No content generated.';
  } catch (error: any) {
    return `[System Error] All vision providers failed. Last error: ${error.message}. Make sure you have a Gemini API key set ('nyxora set-key gemini <key>') for vision support when using non-vision providers like Claude.`;
  }
}
