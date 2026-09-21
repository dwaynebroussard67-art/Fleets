import { createClient } from "@supabase/supabase-js";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key) : null;

// Supabase's default response limit is 1,000 rows. Paginate so long-time
// drivers don't silently lose older shifts from their score or export.
export async function loadAccountShifts(userId: string) {
  if (!supabase) throw new Error("No account backend is configured.");
  const rows: { data: unknown }[] = [];
  const batchSize = 500;
  for (let offset = 0; ; offset += batchSize) {
    const result = await supabase
      .from("shifts")
      .select("data")
      .eq("user_id", userId)
      .order("created_at")
      .order("id")
      .range(offset, offset + batchSize - 1);
    if (result.error) throw result.error;
    rows.push(...result.data);
    if (result.data.length < batchSize) break;
  }
  return rows;
}
