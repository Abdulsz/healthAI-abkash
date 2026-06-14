import {
  INS_NAV_GROK_VOICE_MODEL_DEFAULT,
  INS_NAV_GROK_VOICE_MODEL_ENV_KEY,
  INS_NAV_GROK_VOICE_NAME_DEFAULT,
  INS_NAV_GROK_VOICE_NAME_ENV_KEY,
} from "../config/constants";

type VoiceRunInput = {
  instructions: string;
  prompt: string;
  timeoutMs?: number;
};

function getApiKeyOrThrow(): string {
  const key = process.env.XAI_API_KEY || process.env.LLM_API_KEY;
  if (!key) {
    throw new Error("Missing xAI key. Set XAI_API_KEY or LLM_API_KEY.");
  }
  return key;
}

function getVoiceModel(): string {
  return (
    process.env[INS_NAV_GROK_VOICE_MODEL_ENV_KEY] || INS_NAV_GROK_VOICE_MODEL_DEFAULT
  ).trim();
}

function getVoiceName(): string {
  return (
    process.env[INS_NAV_GROK_VOICE_NAME_ENV_KEY] || INS_NAV_GROK_VOICE_NAME_DEFAULT
  ).trim();
}

function toText(value: unknown): string {
  if (value == null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const directKeys = ["text", "transcript", "output_text", "delta"];
    const chunks: string[] = [];
    for (const key of directKeys) {
      if (key in record) {
        const chunk = toText(record[key]);
        if (chunk) {
          chunks.push(chunk);
        }
      }
    }
    for (const nested of Object.values(record)) {
      const chunk = toText(nested);
      if (chunk) {
        chunks.push(chunk);
      }
    }
    return chunks.join("\n");
  }
  return "";
}

function extractFirstJsonObject(raw: string): string | null {
  const cleaned = raw.replace(/```json|```/gi, "").trim();
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return cleaned.slice(firstBrace, lastBrace + 1);
}

function tryParseLenientJsonObject<T>(rawObject: string): T {
  const normalized = rawObject
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/([{,]\s*)([A-Za-z_][\w]*)(\s*:)/g, '$1"$2"$3')
    .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, content: string) => {
      const escaped = content.replace(/"/g, '\\"');
      return `"${escaped}"`;
    })
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(normalized) as T;
}

export async function runGrokVoiceTextTurn(input: VoiceRunInput): Promise<string> {
  const apiKey = getApiKeyOrThrow();
  const model = getVoiceModel();
  const voice = getVoiceName();
  const timeoutMs = input.timeoutMs ?? 25000;
  process.env.WS_NO_BUFFER_UTIL = "1";
  const wsModule = (await import("ws")) as unknown as {
    default: new (
      url: string,
      options: { headers: Record<string, string> }
    ) => {
      on(event: "open", listener: () => void): void;
      on(event: "message", listener: (data: unknown) => void): void;
      on(event: "error", listener: (error: unknown) => void): void;
      on(event: "close", listener: () => void): void;
      send(data: string): void;
      close(): void;
    };
  };
  const WebSocketCtor = wsModule.default;

  return await new Promise<string>((resolve, reject) => {
    const ws = new WebSocketCtor(`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    let settled = false;
    let responseText = "";

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      ws.close();
      reject(new Error("Timed out waiting for Grok voice response."));
    }, timeoutMs);

    function finishWithError(error: Error): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ws.close();
      reject(error);
    }

    function finishWithText(text: string): void {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      ws.close();
      resolve(text.trim());
    }

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          type: "session.update",
          session: {
            instructions: input.instructions,
            voice,
            turn_detection: { type: null },
          },
        })
      );

      ws.send(
        JSON.stringify({
          type: "conversation.item.create",
          item: {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: input.prompt }],
          },
        })
      );

      ws.send(
        JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text"],
          },
        })
      );
    });

    ws.on("message", (rawData) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(String(rawData));
      } catch {
        return;
      }

      const eventType = typeof event.type === "string" ? event.type : "";
      if (eventType === "error") {
        const message = toText(event.error) || "Grok voice realtime error.";
        finishWithError(new Error(message));
        return;
      }

      if (
        eventType === "response.output_text.delta" ||
        eventType === "response.text.delta" ||
        eventType === "response.output_text.updated"
      ) {
        responseText += toText(event.delta);
      }

      if (eventType === "response.done") {
        const fromDoneEvent = toText(event.response);
        const finalText = [responseText, fromDoneEvent].filter(Boolean).join("\n");
        if (!finalText.trim()) {
          finishWithError(new Error("Voice response completed without text."));
          return;
        }
        finishWithText(finalText);
      }
    });

    ws.on("error", (err) => {
      finishWithError(err instanceof Error ? err : new Error("WebSocket connection failed."));
    });

    ws.on("close", () => {
      if (!settled) {
        finishWithError(new Error("Grok voice websocket closed before completion."));
      }
    });
  });
}

export async function runGrokVoiceJsonTurn<T>(input: VoiceRunInput): Promise<T> {
  const raw = await runGrokVoiceTextTurn(input);
  const jsonString = extractFirstJsonObject(raw);
  if (!jsonString) {
    throw new Error("Could not extract JSON from Grok voice response.");
  }
  try {
    return JSON.parse(jsonString) as T;
  } catch {
    return tryParseLenientJsonObject<T>(jsonString);
  }
}
