/**
 * Sync/Async dispatch helper.
 * Removes the boilerplate of branching between `.../sync` and async endpoints
 * across image, video, audio, lip-sync and watermark tools.
 *
 * Lives in its own module so tests that mock `makeApiRequest` intercept
 * calls made from within this helper.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { TIMEOUT_ASYNC_POST } from "../constants.js";
import type { XBrushAsyncResponse, XBrushSyncResponse } from "../types.js";
import {
  buildToolResult,
  formatAsyncResult,
  formatSyncResult,
  handleToolError,
  makeApiRequest,
} from "./xbrush-client.js";

export interface SubmitOptions<
  S extends XBrushSyncResponse = XBrushSyncResponse,
  A extends XBrushAsyncResponse = XBrushAsyncResponse,
> {
  useSync: boolean;
  syncUrl: string;
  asyncUrl: string;
  syncTimeout: number;
  body: Record<string, unknown>;
  label: string;
  formatSync?: (r: S, label: string) => string;
  formatAsync?: (r: A, label: string) => string;
}

export async function submitSyncOrAsync<
  S extends XBrushSyncResponse = XBrushSyncResponse,
  A extends XBrushAsyncResponse = XBrushAsyncResponse,
>(opts: SubmitOptions<S, A>): Promise<CallToolResult> {
  try {
    if (opts.useSync) {
      const response = await makeApiRequest<S>({
        method: "POST",
        url: opts.syncUrl,
        data: opts.body,
        timeout: opts.syncTimeout,
      });
      const formatter = opts.formatSync ?? formatSyncResult;
      return buildToolResult(formatter(response, opts.label));
    }
    const response = await makeApiRequest<A>({
      method: "POST",
      url: opts.asyncUrl,
      data: opts.body,
      timeout: TIMEOUT_ASYNC_POST,
    });
    const formatter = opts.formatAsync ?? formatAsyncResult;
    return buildToolResult(formatter(response, opts.label));
  } catch (error) {
    return handleToolError(error);
  }
}
