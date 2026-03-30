import { z } from "zod";

export const GetRequestSchema = z
  .object({
    request_id: z.string().min(24).describe("Request ID (starts with 'req', 24 characters)."),
  })
  .strict();

export const ListRequestsSchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional().describe("Number of requests to return (1-100). Default: 20."),
    cursor: z.string().optional().describe("Pagination cursor from a previous response."),
  })
  .strict();

export const CheckHealthSchema = z.object({}).strict();
