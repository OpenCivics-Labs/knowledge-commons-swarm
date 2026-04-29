// Supabase Edge Function: vote-application
//
// A steward casts a yes/no vote on a pending application.
// Threshold: 2 yes -> approved, 2 no -> rejected (out of 3 stewards).
// On status change, sends a decision email to the applicant via Resend.
//
// Auth: caller must be authenticated (magic-link login) AND their email must
// be present in the stewards table.
// Required env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APPROVE_THRESHOLD = 2;
const REJECT_THRESHOLD = 2;
const FROM = "Knowledge Commoning Swarm <team@opencivics.co>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      return json({ error: "Invalid session: " + (authError?.message || "no user") }, 401);
    }
    const user = userData.user;
    if (!user.email) return json({ error: "User has no email" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify caller is a steward
    const { data: steward } = await admin
      .from("stewards")
      .select("*")
      .eq("email", user.email)
      .maybeSingle();
    if (!steward) return json({ error: "Only stewards can vote." }, 403);

    // Backfill user_id on first login (handy for audit)
    if (!steward.user_id) {
      await admin.from("stewards").update({ user_id: user.id }).eq("email", user.email);
    }

    const { application_id, vote, note } = await req.json();
    if (!application_id || !["yes", "no"].includes(vote)) {
      return json({ error: "Provide application_id and vote ('yes' | 'no')." }, 400);
    }

    const { data: application } = await admin
      .from("applications")
      .select("*")
      .eq("id", application_id)
      .maybeSingle();
    if (!application) return json({ error: "Application not found." }, 404);
    if (application.status !== "pending") {
      return json({ error: `Application already ${application.status}.` }, 400);
    }

    // Record the vote (upsert so a steward can change their mind while pending)
    const { error: voteError } = await admin
      .from("application_votes")
      .upsert(
        {
          application_id,
          voter_email: user.email,
          vote,
          note: note || null,
        },
        { onConflict: "application_id,voter_email" },
      );
    if (voteError) return json({ error: voteError.message }, 500);

    const { data: allVotes } = await admin
      .from("application_votes")
      .select("vote, voter_email")
      .eq("application_id", application_id);

    const yes = (allVotes || []).filter((v) => v.vote === "yes");
    const no = (allVotes || []).filter((v) => v.vote === "no");

    let newStatus: "pending" | "approved" | "rejected" = "pending";
    if (yes.length >= APPROVE_THRESHOLD) newStatus = "approved";
    else if (no.length >= REJECT_THRESHOLD) newStatus = "rejected";

    if (newStatus !== "pending") {
      const voters = (allVotes || []).map((v) => `${v.voter_email}(${v.vote})`).join(", ");
      await admin
        .from("applications")
        .update({
          status: newStatus,
          reviewed_at: new Date().toISOString(),
          reviewer_notes: `${newStatus} via steward vote. ${voters}`,
        })
        .eq("id", application_id);

      await sendDecisionEmail(application, newStatus);
    }

    return json({
      ok: true,
      vote_recorded: vote,
      yes_count: yes.length,
      no_count: no.length,
      status: newStatus,
    });
  } catch (err) {
    console.error("vote-application error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

async function sendDecisionEmail(app: any, status: "approved" | "rejected") {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;

  const subject = status === "approved"
    ? "You're in — Knowledge Commoning Swarm"
    : "Update on your Knowledge Commoning Swarm application";

  const body = status === "approved"
    ? `
        <h2 style="font-size: 22px; margin-bottom: 16px;">Welcome to the swarm, ${escapeHtml(app.name)}.</h2>
        <p style="line-height: 1.7;">Your application has been approved by our stewards. The Knowledge Commoning Swarm runs across May and June 2026 — two month-long pulses anchored by live gatherings on May 8–9 and June 12–13.</p>
        <p style="line-height: 1.7;">We'll be in touch shortly with onboarding details: how to join the canvas, the chat, and the kickoff pulse.</p>
        <p style="line-height: 1.7; margin-top: 24px;">— The OpenCivics team</p>`
    : `
        <h2 style="font-size: 22px; margin-bottom: 16px;">Hi ${escapeHtml(app.name)},</h2>
        <p style="line-height: 1.7;">Thank you for your interest in the Knowledge Commoning Swarm. After review, we aren't able to extend an invitation for this round. This isn't a judgment of your work — the cohort is intentionally small as we run this format for the first time.</p>
        <p style="line-height: 1.7;">You're warmly welcome to follow the work as it unfolds at <a href="https://swarm01.opencivics.co" style="color: #3414D0;">swarm01.opencivics.co</a>, and to join us in future convenings.</p>
        <p style="line-height: 1.7; margin-top: 24px;">— The OpenCivics team</p>`;

  const html = `<div style="font-family: 'Inter', system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #080808;">${body}</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: app.email, subject, html }),
  });
  if (!res.ok) console.error("Resend error:", await res.text());
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
