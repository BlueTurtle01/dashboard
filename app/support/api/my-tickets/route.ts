import { NextResponse } from "next/server";
import { getMyTickets } from "@/lib/actions/support";

export async function GET() {
  try {
    const tickets = await getMyTickets();
    return NextResponse.json(tickets);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
