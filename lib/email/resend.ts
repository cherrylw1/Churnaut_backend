import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY || 're_placeholder_key');

/**
 * Sends a dark-themed HTML sales nudge email to a representative via Resend.
 */
export async function sendNudgeEmail(
  to: string,
  dealName: string,
  draftEmail: string | null,
  nextAction: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder_key') {
    console.warn(`[Resend] Skipping sendNudgeEmail: RESEND_API_KEY is not configured.`);
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const subject = `⚠️ Action needed: ${dealName}`;
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Churnaut Scout Alert</title>
    <style>
      body {
        background-color: #09090f;
        color: #f0f0f5;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        margin: 0;
        padding: 40px 20px;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #111118;
        border: 1px solid #1e1e2e;
        border-radius: 8px;
        padding: 30px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }
      .header {
        border-bottom: 1px solid #1e1e2e;
        padding-bottom: 20px;
        margin-bottom: 25px;
      }
      .logo {
        font-size: 20px;
        font-weight: bold;
        letter-spacing: 2px;
        color: #7c3aed;
        text-transform: uppercase;
        font-family: monospace;
      }
      .title {
        font-size: 22px;
        font-weight: bold;
        margin-top: 15px;
        color: #ffffff;
      }
      .section {
        margin-bottom: 25px;
      }
      .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #9494a8;
        margin-bottom: 8px;
        font-family: monospace;
      }
      .content-box {
        background-color: #16161f;
        border: 1px solid #1e1e2e;
        border-radius: 6px;
        padding: 15px;
        font-size: 14px;
        line-height: 1.6;
        color: #e2e8f0;
        white-space: pre-wrap;
      }
      .footer {
        border-top: 1px solid #1e1e2e;
        margin-top: 35px;
        padding-top: 20px;
        text-align: center;
        font-size: 11px;
        color: #5a5a72;
        font-family: monospace;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">Churnaut Scout</div>
        <div class="title">Action Required for Deal</div>
      </div>
      <div class="section">
        <div class="label">Deal Name</div>
        <div style="font-size: 16px; font-weight: bold; color: #ffffff;">${dealName}</div>
      </div>
      <div class="section">
        <div class="label">Recommended Next Action</div>
        <div class="content-box" style="border-left: 3px solid #7c3aed;">${nextAction}</div>
      </div>
      ${draftEmail ? `
      <div class="section">
        <div class="label">Draft Outreach Email</div>
        <div class="content-box">${draftEmail}</div>
      </div>
      ` : ''}
      <div class="footer">
        Sent automatically by Churnaut. Personalize your pipeline at app.churnaut.com.
      </div>
    </div>
  </body>
</html>
  `;

  try {
    const data = await resend.emails.send({
      from: 'Churnaut Scout <noreply@churnaut.com>',
      to,
      subject,
      html,
    });
    console.log(`[Resend nudge] Email sent successfully to ${to}:`, data);
    return { success: true, data };
  } catch (error) {
    console.error(`[Resend nudge] Error sending email to ${to}:`, error);
    return { success: false, error };
  }
}

/**
 * Sends a dark-themed HTML weekly pipeline intelligence digest email via Resend.
 */
export async function sendWeeklyDigest(
  to: string,
  digestData: {
    summary: string;
    top_signal: string;
    rep_spotlight: string;
    recommendation: string;
  }
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder_key') {
    console.warn(`[Resend] Skipping sendWeeklyDigest: RESEND_API_KEY is not configured.`);
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const subject = `📊 Churnaut: Weekly Pipeline Digest`;
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Churnaut Weekly Digest</title>
    <style>
      body {
        background-color: #09090f;
        color: #f0f0f5;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        margin: 0;
        padding: 40px 20px;
      }
      .container {
        max-width: 600px;
        margin: 0 auto;
        background-color: #111118;
        border: 1px solid #1e1e2e;
        border-radius: 8px;
        padding: 30px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      }
      .header {
        border-bottom: 1px solid #1e1e2e;
        padding-bottom: 20px;
        margin-bottom: 25px;
      }
      .logo {
        font-size: 20px;
        font-weight: bold;
        letter-spacing: 2px;
        color: #7c3aed;
        text-transform: uppercase;
        font-family: monospace;
      }
      .title {
        font-size: 22px;
        font-weight: bold;
        margin-top: 15px;
        color: #ffffff;
      }
      .section {
        margin-bottom: 30px;
        border-bottom: 1px solid #16161f;
        padding-bottom: 20px;
      }
      .section:last-of-type {
        border-bottom: none;
        padding-bottom: 0;
      }
      .label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 1.5px;
        color: #9494a8;
        margin-bottom: 10px;
        font-family: monospace;
      }
      .content-box {
        background-color: #16161f;
        border: 1px solid #1e1e2e;
        border-radius: 6px;
        padding: 15px;
        font-size: 14px;
        line-height: 1.6;
        color: #e2e8f0;
        white-space: pre-wrap;
      }
      .footer {
        border-top: 1px solid #1e1e2e;
        margin-top: 35px;
        padding-top: 20px;
        text-align: center;
        font-size: 11px;
        color: #5a5a72;
        font-family: monospace;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <div class="logo">Churnaut Intelligence</div>
        <div class="title">Weekly Pipeline Digest</div>
      </div>
      
      <div class="section">
        <div class="label">📊 Pipeline Summary</div>
        <div class="content-box">${digestData.summary}</div>
      </div>
      
      <div class="section">
        <div class="label">🔥 Top Conversion Signal</div>
        <div class="content-box" style="border-left: 3px solid #7c3aed;">${digestData.top_signal}</div>
      </div>
      
      <div class="section">
        <div class="label">👤 Representative Spotlight</div>
        <div class="content-box">${digestData.rep_spotlight}</div>
      </div>
      
      <div class="section">
        <div class="label">💡 Strategic Recommendation</div>
        <div class="content-box" style="border-left: 3px solid #06b6d4;">${digestData.recommendation}</div>
      </div>
      
      <div class="footer">
        Sent automatically by Churnaut. Personalize your pipeline at app.churnaut.com.
      </div>
    </div>
  </body>
</html>
  `;

  try {
    const data = await resend.emails.send({
      from: 'Churnaut Intelligence <noreply@churnaut.com>',
      to,
      subject,
      html,
    });
    console.log(`[Resend digest] Weekly digest sent successfully to ${to}:`, data);
    return { success: true, data };
  } catch (error) {
    console.error(`[Resend digest] Error sending digest to ${to}:`, error);
    return { success: false, error };
  }
}

export async function sendClickNotification(
  to: string,
  prospectName: string,
  companyName: string | null,
  signalType: string | null,
  sessionId: string
) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 're_placeholder_key') {
    console.warn('[Resend] Skipping sendClickNotification: RESEND_API_KEY is not configured.');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const subject = `🔔 ${prospectName}${companyName ? ` from ${companyName}` : ''} just clicked your link`;
  const html = `
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Churnaut Click Alert</title>
    <style>
      body { background-color: #09090f; color: #f0f0f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 40px 20px; }
      .container { max-width: 600px; margin: 0 auto; background-color: #111118; border: 1px solid #1e1e2e; border-radius: 8px; padding: 30px; }
      .logo { font-size: 20px; font-weight: bold; letter-spacing: 2px; color: #6366f1; text-transform: uppercase; font-family: monospace; }
      .title { font-size: 22px; font-weight: bold; margin-top: 15px; color: #ffffff; }
      .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #9494a8; margin-bottom: 8px; font-family: monospace; }
      .value { font-size: 15px; font-weight: bold; color: #ffffff; margin-bottom: 20px; }
      .badge { display: inline-block; background-color: #1e1e3f; border: 1px solid #6366f1; color: #6366f1; font-family: monospace; font-size: 11px; padding: 4px 10px; border-radius: 4px; text-transform: uppercase; }
      .cta { display: inline-block; background-color: #6366f1; color: #ffffff; font-family: monospace; font-size: 12px; font-weight: bold; padding: 12px 24px; border-radius: 6px; text-decoration: none; margin-top: 10px; }
      .footer { border-top: 1px solid #1e1e2e; margin-top: 35px; padding-top: 20px; text-align: center; font-size: 11px; color: #5a5a72; font-family: monospace; }
    </style>
  </head>
  <body>
    <div class="container">
      <div style="border-bottom: 1px solid #1e1e2e; padding-bottom: 20px; margin-bottom: 25px;">
        <div class="logo">Churnaut</div>
        <div class="title">Your prospect just clicked.</div>
      </div>
      <div class="label">Prospect</div>
      <div class="value">${prospectName}${companyName ? ` — ${companyName}` : ''}</div>
      ${signalType ? `<div class="label">Signal</div><div style="margin-bottom: 20px;"><span class="badge">${signalType}</span></div>` : ''}
      <div class="label">Session ID</div>
      <div class="value" style="font-family: monospace; font-size: 13px; color: #9494a8;">${sessionId}</div>
      <div style="margin-top: 10px;">
        <a href="https://app.churnaut.com/dashboard/links" class="cta">VIEW IN CHURNAUT →</a>
      </div>
      <div class="footer">Sent automatically by Churnaut when a prospect clicks your tracked link.</div>
    </div>
  </body>
</html>
  `;

  try {
    const data = await resend.emails.send({
      from: 'Churnaut <noreply@churnaut.com>',
      to,
      subject,
      html,
    });
    console.log(`[Resend click] Notification sent to ${to} for session ${sessionId}`);
    return { success: true, data };
  } catch (error) {
    console.error(`[Resend click] Error sending notification to ${to}:`, error);
    return { success: false, error };
  }
}
