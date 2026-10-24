"use server";
import { revalidatePath } from "next/cache";
import { adminDb, must, type Row } from "@/lib/db";
import { discoverNews } from "@/lib/ai/discover";
import { retrieveEvidence } from "@/lib/ai/evidence";
import { evaluateClaim } from "@/lib/ai/evaluate";
import { researchCluster } from "@/lib/ai/memory-engine";
import { ingestStatementsFromUrl } from "@/lib/ai/statements";
import { SourceTypeZ } from "@/lib/ai/types";
import { requireStaff, signIn, signOut } from "@/lib/auth";
import { runJob } from "@/lib/jobs";
import { slugify } from "@/lib/text";
import { runAutopilot } from "@/lib/ai/autopilot";
import { buildImages } from "@/lib/ai/images";

export type ActionResult = { ok: boolean; message: string };
const done = (message: string): ActionResult => { revalidatePath("/admin"); return { ok: true, message }; };
const fail = (e: unknown): ActionResult => ({ ok: false, message: e instanceof Error ? e.message : String(e) });
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function loginAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  return (await signIn(str(f, "email"), str(f, "password"))) ? done("Signed in") : { ok: false, message: "Sign-in failed. Check your email and password, and that your account is listed in the staff table." };
}
export async function logoutAction() { signOut(); revalidatePath("/admin"); }

export async function ingestFeedsAction(_?: ActionResult | null, __?: FormData): Promise<ActionResult> {
  try { await requireStaff(); const r = await runJob("ingest-feeds", discoverNews); return done(`Fetched ${r.fetched} items, ${r.inserted} new.${r.errors.length ? " Feed errors: " + r.errors.join("; ") : ""}`); }
  catch (e) { return fail(e); }
}
export async function researchAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const r = await runJob("research-cluster", () => researchCluster(str(f, "clusterId")));
    return done(`Draft created: ${r.sources} sources, ${r.claims} claims, ${r.relationshipsProposed} comparisons proposed.${r.warnings.length ? " Warnings: " + r.warnings.join(" | ") : ""}`);
  } catch (e) { return fail(e); }
}
export async function addPersonAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const name = str(f, "name");
    must(await adminDb().from("people").insert({ slug: slugify(name), name, bio: str(f, "bio") || null, bio_source_url: str(f, "bioSource") || null, country: str(f, "country") || null }), "add person");
    return done(`Added ${name}`);
  } catch (e) { return fail(e); }
}
export async function addAffiliationAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  try {
    await requireStaff(); const db = adminDb();
           const person = must(await db.from("people").select("id").eq("slug", str(f, "personSlug")).single(), "person") as unknown as { id: string };
    const orgName = str(f, "organization");
    let org = (await db.from("organizations").select("id").eq("slug", slugify(orgName)).maybeSingle()).data;
    if (!org) org = must(await db.from("organizations").insert({ slug: slugify(orgName), name: orgName, kind: str(f, "kind") || "party" }).select("id").single(), "org");
    must(await db.from("affiliations").insert({ person_id: person.id, organization_id: org!.id, role: str(f, "role") || null,
      start_date: str(f, "start") || null, end_date: str(f, "end") || null, source_url: str(f, "sourceUrl") }), "affiliation");
    return done("Affiliation recorded (previous affiliations are kept)");
  } catch (e) { return fail(e); }
}
export async function ingestStatementsAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
           const person = must(await adminDb().from("people").select("id,name,country").eq("slug", str(f, "personSlug")).single(), "person") as unknown as { id: string; name: string; country: string | null };
    const r = await ingestStatementsFromUrl({ url: str(f, "url"), personId: person.id, personName: person.name,
      sourceType: SourceTypeZ.parse(str(f, "sourceType")), madeOn: str(f, "madeOn") || null, country: person.country });
    return done(`Saved ${r.saved} verified statement(s). Rejected ${r.rejected} that could not be verified in the source text.`);
  } catch (e) { return fail(e); }
}
export async function factCheckDraftAction(_: ActionResult | null, f: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const claim = str(f, "claim");
    const sources = await retrieveEvidence(claim);
    const ev = await evaluateClaim(claim, sources);
    const withUrl = (items: typeof ev.supporting) => items.map((i) => ({ text: i.point, excerpt: i.excerpt, sourceUrl: sources[Number(i.sourceId.replace(/\D/g, "")) - 1]?.url }));
    must(await adminDb().from("fact_checks").insert({
      slug: `${slugify(claim).slice(0, 60)}-${Math.random().toString(36).slice(2, 6)}`, claim_text: claim, claimant: str(f, "claimant") || null,
      claim_date: str(f, "claimDate") || null, context: str(f, "context") || null, verdict: ev.verdict,
      explanation: `${ev.explanation}\n\nWhat remains uncertain: ${ev.uncertainty}`,
      evidence: { supporting: withUrl(ev.supporting), contradicting: withUrl(ev.contradicting) }, status: "pending_review", ai_generated: true,
    }), "save fact-check");
    return done(`Draft verdict: ${ev.verdict}. It is in the review queue and not public.`);
  } catch (e) { return fail(e); }
}

type Table = "articles" | "fact_checks" | "statement_relationships";
export async function reviewAction(f: FormData) {
  const staff = await requireStaff();
  const table = str(f, "table") as Table;
  if (!["articles", "fact_checks", "statement_relationships"].includes(table)) return;
  const approve = str(f, "decision") === "approve";
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = table === "statement_relationships"
    ? { review_status: approve ? "approved" : "rejected", reviewer_conclusion: str(f, "note") || null, reviewed_by: staff.id, reviewed_at: now }
    : { status: approve ? "approved" : "rejected", reviewed_by: staff.id, ...(table === "fact_checks" ? { reviewed_at: now } : {}), ...(approve ? { published_at: now } : {}) };
  if (table === "fact_checks" && str(f, "verdict")) patch.verdict = str(f, "verdict");
  must(await adminDb().from(table).update(patch).eq("id", str(f, "id")), "review");
  revalidatePath("/admin");
}
export async function addCorrectionAction(f: FormData) {
  await requireStaff();
  const col = str(f, "kind") === "fact_check" ? "fact_check_id" : "article_id";
  must(await adminDb().from("corrections").insert({ [col]: str(f, "id"), note: str(f, "note") }), "correction");
  revalidatePath("/admin");
}
export async function autopilotAction(_?: ActionResult | null, __?: FormData): Promise<ActionResult> {
  try { await requireStaff(); const r = await runJob("autopilot", runAutopilot); return done(r.message); }
  catch (e) { return fail(e); }
}
export async function addImagesToPublishedAction(_?: ActionResult | null, __?: FormData): Promise<ActionResult> {
  try {
    await requireStaff();
    const db = adminDb();
    const rows = must(await db.from("articles").select("id,title,summary,body").eq("status", "approved").order("published_at", { ascending: false }).limit(100), "published articles") as Row[];
    const todo = rows.filter((a) => !a.body?.images?.length && !a.body?.images_checked_at);
    let added = 0;
    for (const a of todo.slice(0, 5)) {
      let images: unknown[] = [];
      try { images = await buildImages(a); } catch { /* skip */ }
      must(await db.from("articles").update({ body: { ...a.body, images, images_checked_at: new Date().toISOString() } }).eq("id", a.id), "save images");
      if (images.length) added++;
    }
    const left = Math.max(0, todo.length - 5);
    return done(`Checked ${Math.min(5, todo.length)} article(s), added images to ${added}.${left ? ` ${left} more waiting. Click again.` : ""}`);
  } catch (e) { return fail(e); }
}
