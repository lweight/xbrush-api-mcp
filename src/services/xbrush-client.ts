/**
 * Shared HTTP client for XBrush API.
 * Handles authentication, error mapping, and response formatting.
 */

import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { API_BASE_URL, CHARACTER_LIMIT, TIMEOUT_GET } from "../constants.js";
import type { XBrushErrorResponse } from "../types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// ── API Client Singleton ──────────────────────────────────────────────

let client: AxiosInstance | null = null;

function parseEnvKey(content: string, keyName: string): string | undefined {
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const name = trimmed.substring(0, eqIdx).trim();
    let value = trimmed.substring(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (name === keyName) return value;
  }
  return undefined;
}

function loadKeyFromEnvFile(keyName: string): string | undefined {
  try {
    const content = readFileSync(resolve(process.cwd(), ".env"), "utf-8");
    const value = parseEnvKey(content, keyName);
    if (value) return value;
  } catch {
    // no .env in cwd
  }

  const __filename = fileURLToPath(import.meta.url);
  let dir = dirname(__filename);
  for (let i = 0; i < 10; i++) {
    try {
      const content = readFileSync(resolve(dir, ".env"), "utf-8");
      const value = parseEnvKey(content, keyName);
      if (value) return value;
    } catch {
      // no .env at this level
    }
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function getApiKey(): string {
  let key = process.env.XBRUSH_API_KEY;
  if (!key) {
    key = loadKeyFromEnvFile("XBRUSH_API_KEY");
  }
  if (!key) {
    throw new Error(
      "XBRUSH_API_KEY environment variable is not set. " +
        "Set it in your MCP server configuration or .env file."
    );
  }
  return key;
}

export function getClient(): AxiosInstance {
  if (!client) {
    client = axios.create({
      baseURL: API_BASE_URL,
      timeout: TIMEOUT_GET,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-API-Key": getApiKey(),
      },
    });
  }
  return client;
}

// ── API Request Helper ────────────────────────────────────────────────

export async function makeApiRequest<T>(
  config: AxiosRequestConfig
): Promise<T> {
  try {
    const response = await getClient().request<T>(config);
    return response.data;
  } catch (error) {
    throw handleApiError(error);
  }
}

// ── Error Handling ────────────────────────────────────────────────────

export class XBrushApiError extends Error {
  status: number;
  code: string;
  suggestion: string;

  constructor(status: number, code: string, message: string, suggestion: string) {
    super(message);
    this.name = "XBrushApiError";
    this.status = status;
    this.code = code;
    this.suggestion = suggestion;
  }
}

function getSuggestion(code: string, status: number): string {
  switch (code) {
    case "MISSING_API_KEY":
    case "INVALID_API_KEY":
      return "Check XBRUSH_API_KEY. Get your key at xbrush.ai > Dashboard > API Keys.";
    case "INSUFFICIENT_CREDIT":
      return "Insufficient credits. Top up at xbrush.ai > Dashboard > Billing.";
    case "INVALID_MODEL":
      return "Model not recognized. Use xbrush_list_models to see available models.";
    case "VALIDATION_ERROR":
      return "Invalid parameters. Check required fields and value ranges.";
    case "GENERATION_FAILED":
      return "Generation failed on the server. Try again or use a different model.";
    case "POLLER_ERROR":
      return "Polling error. Use xbrush_get_request to check the request status manually.";
    default:
      if (status === 429) return "Rate limit exceeded. Wait before retrying.";
      if (status >= 500) return "XBrush server error. Try again later.";
      return "Unexpected error. Check your request parameters.";
  }
}

export function handleApiError(error: unknown): XBrushApiError {
  if (error instanceof AxiosError && error.response) {
    const status = error.response.status;
    const data = error.response.data as XBrushErrorResponse | undefined;
    const errInfo = data?.error;

    if (errInfo) {
      return new XBrushApiError(
        status,
        errInfo.code,
        errInfo.message,
        getSuggestion(errInfo.code, status)
      );
    }

    return new XBrushApiError(
      status,
      `HTTP_${status}`,
      `API error (${status}): ${JSON.stringify(data)}`,
      getSuggestion("", status)
    );
  }

  if (error instanceof AxiosError && error.code === "ECONNABORTED") {
    return new XBrushApiError(
      0,
      "TIMEOUT",
      "Request timed out",
      "The request took too long. For long operations, use the async endpoint and poll with xbrush_get_request."
    );
  }

  if (error instanceof Error) {
    return new XBrushApiError(0, "UNKNOWN", error.message, "An unexpected error occurred.");
  }

  return new XBrushApiError(0, "UNKNOWN", String(error), "An unknown error occurred.");
}

/**
 * Convert any caught error to an MCP error result.
 */
export function handleToolError(error: unknown): CallToolResult {
  const apiErr =
    error instanceof XBrushApiError ? error : handleApiError(error);
  return buildErrorResult(apiErr);
}

// ── Response Formatting ───────────────────────────────────────────────

export function buildToolResult(text: string, isError = false): CallToolResult {
  const truncated = truncateText(text);
  return {
    content: [{ type: "text" as const, text: truncated }],
    isError,
  };
}

function buildErrorResult(error: XBrushApiError): CallToolResult {
  const text = `Error: ${error.message}\n\nSuggestion: ${error.suggestion}`;
  return buildToolResult(text, true);
}

function truncateText(text: string): string {
  if (text.length <= CHARACTER_LIMIT) {
    return text;
  }
  const truncated = text.substring(0, CHARACTER_LIMIT);
  return (
    truncated +
    `\n\n--- Response truncated (${text.length} chars, limit: ${CHARACTER_LIMIT}). ---`
  );
}
