import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, code = "BAD_REQUEST") {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function jsonError(error: unknown) {
  console.error("request failed", error);
  return apiError("Something went wrong.", 500, "INTERNAL_ERROR");
}
