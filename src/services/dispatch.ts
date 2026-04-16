/**
 * Async submission helper for generation tools.
 *
 * MCP tools never call /sync endpoints (rule: stdio tools must not block;
 * sync endpoints also have a dual-shape contract that complicates parsing).
 * Every generation tool POSTs to the async endpoint, returns the request_id,
 * and the caller polls with `xbrush_get_request`.
 *
 * Lives in its own module so tests that mock `makeApiRequest` intercept
 * calls made from within this helper.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TIMEOUT_ASYNC_POST } from "../constants.js";
import type { XBrushAsyncResponse } from "../types.js";
import {
  buildToolResult,
  formatAsyncResult,
  handleToolError,
  makeApiRequest,
} from "./xbrush-client.js";

export interface SubmitAsyncOptions<A extends XBrushAsyncResponse = XBrushAsyncResponse> {
  url: string;
  body: Record<string, unknown>;
  label: string;
  formatAsync?: (r: A, label: string) => string;
}

export async function submitAsync<A extends XBrushAsyncResponse = XBrushAsyncResponse>(
  opts: SubmitAsyncOptions<A>
): Promise<CallToolResult> {
  try {
    const response = await makeApiRequest<A>({
      method: "POST",
      url: opts.url,
      data: opts.body,
      timeout: TIMEOUT_ASYNC_POST,
    });
    const formatter = opts.formatAsync ?? formatAsyncResult;
    return buildToolResult(formatter(response, opts.label));
  } catch (error) {
    return handleToolError(error);
  }
}
