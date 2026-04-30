// Supabase Edge Function: notify-application
//
// Triggered by the DB trigger in 0004_notify_on_new_application.sql whenever
// a new row is inserted into applications. Sends two emails via Resend:
//   1. Confirmation to the applicant
//   2. Digest to team@opencivics.co with a link to the dashboard
//
// Deploy with verify_jwt=false (the trigger has no auth header).
// Required env: RESEND_API_KEY, DASHBOARD_URL (e.g. https://swarm01.opencivics.co/dashboard.html)

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const FROM = "Knowledge Commoning Swarm <team@opencivics.co>";
const TEAM_INBOX = "team@opencivics.co";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const r = payload.record || {};

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      console.error("RESEND_API_KEY not set");
      return json({ error: "Email not configured" }, 500);
    }
    const dashboardUrl = Deno.env.get("DASHBOARD_URL") || "https://swarm01.opencivics.co/dashboard.html";

    // 1. Confirmation to applicant
    const applicantHtml = `
      <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 32px; color: #080808;">
        <h2 style="font-size: 22px; margin-bottom: 16px;">Thank you for applying, ${escapeHtml(r.name)}.</h2>
        <p style="line-height: 1.7;">We've received your application to the Knowledge Commoning Swarm (May + June 2026). Our stewards will review it shortly and you'll hear back by email once a decision is made.</p>
        <p style="line-height: 1.7;">In the meantime, you can read more about the swarm at <a href="https://swarm01.opencivics.co" style="color: #3414D0;">swarm01.opencivics.co</a>.</p>
        <p style="line-height: 1.7; margin-top: 24px;">— The OpenCivics team</p>
      </div>`;

    await sendEmail(resendKey, {
      from: FROM,
      to: r.email,
      subject: "We received your Knowledge Commoning Swarm application",
      html: applicantHtml,
    });

    // 2. Digest to team
    const teamHtml = `
      <div style="font-family: 'Inter', system-ui, sans-serif; max-width: 640px; margin: 0 auto; padding: 24px; color: #080808;">
        <h3 style="font-size: 18px; margin-bottom: 16px;">New swarm application: ${escapeHtml(r.name)}</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 6px 0; color: #555; width: 140px;">Email</td><td>${escapeHtml(r.email)}</td></tr>
          <tr><td style="padding: 6px 0; color: #555;">Role</td><td>${escapeHtml(r.role)}</td></tr>
          <tr><td style="padding: 6px 0; color: #555;">URL</td><td>${escapeHtml(r.url)}</td></tr>
          <tr><td style="padding: 6px 0; color: #555;">Telegram</td><td>${escapeHtml(r.telegram_username)}</td></tr>
          <tr><td style="padding: 6px 0; color: #555;">OpenCivics member</td><td>${r.subscribe_opencivics ? "Yes" : "No"}</td></tr>
          <tr><td style="padding: 6px 0; color: #555; vertical-align: top;">Draws them</td><td>${escapeHtml(r.interest)}</td></tr>
        </table>
        <p style="margin-top: 24px;"><a href="${dashboardUrl}" style="display: inline-block; padding: 10px 18px; background: #080808; color: #fff; text-decoration: none;">Review in dashboard →</a></p>
      </div>`;

    await sendEmail(resendKey, {
      from: FROM,
      to: TEAM_INBOX,
      subject: `New swarm application: ${r.name}`,
      html: teamHtml,
    });

    return json({ ok: true });
  } catch (err) {
    console.error("notify-application error:", err);
    return json({ error: (err as Error).message }, 500);
  }
});

async function sendEmail(
  apiKey: string,
  payload: { from: string; to: string; subject: string; html: string },
) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error("Resend error:", await res.text());
}
