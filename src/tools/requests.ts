/**
 * Request tools: get_request, list_requests, check_health
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetRequestSchema,
  ListRequestsSchema,
  CheckHealthSchema,
} from "../schemas/requests.js";
import {
  makeApiRequest,
  buildToolResult,
  handleToolError,
} from "../services/xbrush-client.js";
import { TIMEOUT_GET } from "../constants.js";
import type {
  XBrushRequestDetail,
  XBrushRequestListResponse,
  XBrushHealthResponse,
} from "../types.js";

// ── Helpers ───────────────────────────────────────────────────────────

function formatRequestDetail(r: XBrushRequestDetail): string {
  const lines: string[] = [];
  lines.push(`## Request ${r.requestId}`);
  lines.push("");
  lines.push(`- **Status**: ${r.status}`);
  lines.push(`- **Domain**: ${r.domain}`);
  lines.push(`- **Action**: ${r.action}`);
  lines.push(`- **Credits charged**: ${r.creditCharged}`);
  if (r.createdAt) lines.push(`- **Created**: ${r.createdAt}`);
  if (r.completedAt) lines.push(`- **Completed**: ${r.completedAt}`);
  if (r.duration != null) lines.push(`- **Duration**: ${r.duration}s`);

  if (r.status === "completed" && r.output) {
    lines.push("");
    lines.push("### Output");
    if (r.output.imageUrls?.length) {
      r.output.imageUrls.forEach((url, i) => {
        lines.push(`- Image ${i + 1}: ${url}`);
      });
    }
    if (r.output.videoUrl) lines.push(`- Video: ${r.output.videoUrl}`);
    if (r.output.audioUrl) lines.push(`- Audio: ${r.output.audioUrl}`);
    if (r.output.url) lines.push(`- URL: ${r.output.url}`);
  }

  if (r.status === "failed" && r.error) {
    lines.push("");
    lines.push("### Error");
    lines.push(`- **Code**: ${r.error.code}`);
    lines.push(`- **Message**: ${r.error.message}`);
  }

  return lines.join("\n");
}

// ── Tool Registration ─────────────────────────────────────────────────

export function registerRequestTools(server: McpServer): void {
  // ── xbrush_get_request ──────────────────────────────────────────────

  server.registerTool(
    "xbrush_get_request",
    {
      title: "Get Request",
      description: [
        "Get the status and result of an XBrush API request.",
        "Use this to check the result of async operations (image edit, video generate, etc.).",
        "",
        "Args:",
        "  request_id (string, required): Request ID starting with 'req'.",
      ].join("\n"),
      inputSchema: GetRequestSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const detail = await makeApiRequest<XBrushRequestDetail>({
          method: "GET",
          url: `/v1/requests/${args.request_id}`,
          timeout: TIMEOUT_GET,
        });
        return buildToolResult(formatRequestDetail(detail));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // ── xbrush_list_requests ────────────────────────────────────────────

  server.registerTool(
    "xbrush_list_requests",
    {
      title: "List Requests",
      description: [
        "List recent XBrush API requests with status and results.",
        "",
        "Args:",
        "  limit (int, optional): Number of requests (1-100). Default: 20.",
        "  cursor (string, optional): Pagination cursor from previous response.",
      ].join("\n"),
      inputSchema: ListRequestsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (args) => {
      try {
        const params: Record<string, unknown> = {};
        if (args.limit !== undefined) params.limit = args.limit;
        if (args.cursor !== undefined) params.cursor = args.cursor;

        const response = await makeApiRequest<XBrushRequestListResponse>({
          method: "GET",
          url: "/v1/requests",
          params,
          timeout: TIMEOUT_GET,
        });

        const lines: string[] = [];
        lines.push(`# Requests (${response.data.length})`);
        if (response.hasMore) lines.push("More results available — use the cursor to paginate.");
        lines.push("");

        for (const r of response.data) {
          const status = r.status.toUpperCase();
          lines.push(`- \`${r.requestId}\` | ${status} | ${r.domain}/${r.action} | credit: ${r.creditCharged}`);
        }

        if (response.nextCursor) {
          lines.push("");
          lines.push(`**Next cursor**: \`${response.nextCursor}\``);
        }

        return buildToolResult(lines.join("\n"));
      } catch (error) {
        return handleToolError(error);
      }
    }
  );

  // ── xbrush_check_health ─────────────────────────────────────────────

  server.registerTool(
    "xbrush_check_health",
    {
      title: "Check Health",
      description: "Check XBrush API server health status.",
      inputSchema: CheckHealthSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async () => {
      try {
        const health = await makeApiRequest<XBrushHealthResponse>({
          method: "GET",
          url: "/v1/health",
          timeout: TIMEOUT_GET,
        });
        return buildToolResult(
          `XBrush API is **${health.status}**` +
            (health.timestamp ? ` (${health.timestamp})` : "")
        );
      } catch (error) {
        return handleToolError(error);
      }
    }
  );
}
