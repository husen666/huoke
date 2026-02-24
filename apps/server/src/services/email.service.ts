interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpUser = process.env.SMTP_USER;
  const fromEmail = process.env.EMAIL_FROM || 'noreply@huokeagent.com';

  if (!smtpHost || !smtpUser) {
    console.log(`[Email] Would send to ${options.to} (SMTP not configured)`);
    return true;
  }

  try {
    const apiKey = process.env.EMAIL_API_KEY;
    const apiUrl = process.env.EMAIL_API_URL;

    if (apiKey && apiUrl) {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: options.to,
          subject: options.subject,
          html: options.html,
          text: options.text,
        }),
      });
      return response.ok;
    }

    console.log(`[Email] No email API configured, skipping send to ${options.to}`);
    return true;
  } catch (error) {
    console.error('[email] Send failed:', error);
    return false;
  }
}

export function generatePasswordResetEmail(code: string, appName: string = '火客智能'): string {
  return `
    <div style="max-width: 500px; margin: 0 auto; font-family: -apple-system, sans-serif; padding: 40px 20px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">${appName}</h2>
      <p style="color: #64748b; margin-bottom: 24px;">您正在重置密码，验证码如下：</p>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #0f172a;">${code}</span>
      </div>
      <p style="color: #94a3b8; font-size: 14px;">此验证码15分钟内有效。如非本人操作，请忽略此邮件。</p>
    </div>
  `;
}

export function generateInvitationEmail(inviterName: string, orgName: string, code: string, appUrl: string = 'http://localhost:3000'): string {
  return `
    <div style="max-width: 500px; margin: 0 auto; font-family: -apple-system, sans-serif; padding: 40px 20px;">
      <h2 style="color: #1e293b; margin-bottom: 8px;">火客智能 - 团队邀请</h2>
      <p style="color: #475569; margin-bottom: 24px;">${inviterName} 邀请您加入 <strong>${orgName}</strong> 团队。</p>
      <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <p style="color: #64748b; margin-bottom: 8px;">邀请码</p>
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #0f172a;">${code}</span>
      </div>
      <a href="${appUrl}/register?code=${code}" style="display: block; background: #3b82f6; color: white; text-align: center; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">接受邀请</a>
      <p style="color: #94a3b8; font-size: 14px; margin-top: 24px;">此邀请7天内有效。</p>
    </div>
  `;
}
