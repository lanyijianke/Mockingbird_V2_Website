import { Resend } from 'resend';
import { buildAbsoluteUrl, getSiteBrandConfig } from '@/lib/site-config';

// ════════════════════════════════════════════════════════════════
// 邮件发送 — 基于 Resend
// ════════════════════════════════════════════════════════════════

const RESEND_FROM_NAME = process.env.RESEND_FROM_NAME || getSiteBrandConfig().brandName;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const EMAIL_BG = '#000000';
const EMAIL_CARD_BG = '#111111';
const EMAIL_PANEL_BG = '#0a0a0a';
const EMAIL_BORDER = '#232323';
const EMAIL_TEXT = '#f5f5f5';
const EMAIL_MUTED = '#999999';
const EMAIL_ACCENT = '#C0F0FB';

function getSenderAddress(): string {
    return `${RESEND_FROM_NAME} <${RESEND_FROM_EMAIL}>`;
}

function getResendClient(): Resend {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('RESEND_API_KEY 未配置');
    }
    return new Resend(apiKey);
}

interface SendResult {
    success: boolean;
    error?: string;
}

interface EmailTemplateOptions {
    eyebrow: string;
    title: string;
    intro: string;
    actionLabel: string;
    actionUrl: string;
    secondaryNote: string;
}

function buildEmailHtml(options: EmailTemplateOptions): string {
    const { eyebrow, title, intro, actionLabel, actionUrl, secondaryNote } = options;

    return `
        <div style="margin:0;padding:0;background:${EMAIL_BG};color:${EMAIL_TEXT};">
            <div style="max-width:560px;margin:0 auto;padding:32px 20px 48px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
                <div style="padding:0 4px 16px;">
                    <div style="font-family:Georgia,'Times New Roman','Noto Serif SC',serif;font-size:28px;line-height:1.2;font-weight:700;letter-spacing:0.08em;color:${EMAIL_TEXT};">
                        ${getSiteBrandConfig().brandName}
                    </div>
                    <div style="margin-top:10px;width:72px;height:2px;background:${EMAIL_ACCENT};"></div>
                </div>

                <div style="background:${EMAIL_CARD_BG};border:1px solid ${EMAIL_BORDER};border-radius:18px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,0.45);">
                    <div style="padding:18px 24px;border-bottom:1px solid ${EMAIL_BORDER};background:linear-gradient(180deg,#141414 0%,${EMAIL_CARD_BG} 100%);">
                        <div style="font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${EMAIL_ACCENT};">
                            ${eyebrow}
                        </div>
                    </div>

                    <div style="padding:28px 24px 24px;">
                        <h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman','Noto Serif SC',serif;font-size:30px;line-height:1.25;font-weight:700;color:${EMAIL_TEXT};">
                            ${title}
                        </h1>

                        <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:${EMAIL_MUTED};">
                            ${intro}
                        </p>

                        <div style="margin:0 0 24px;">
                            <a href="${actionUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:${EMAIL_ACCENT};color:#000000;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.02em;">
                                ${actionLabel}
                            </a>
                        </div>

                        <div style="padding:16px 18px;border:1px solid ${EMAIL_BORDER};border-radius:14px;background:${EMAIL_PANEL_BG};">
                            <div style="margin:0 0 8px;font-size:12px;line-height:1.5;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${EMAIL_ACCENT};">
                                备用链接
                            </div>
                            <a href="${actionUrl}" style="font-size:13px;line-height:1.8;color:${EMAIL_ACCENT};word-break:break-all;text-decoration:none;">
                                ${actionUrl}
                            </a>
                        </div>
                    </div>

                    <div style="padding:18px 24px 24px;border-top:1px solid ${EMAIL_BORDER};">
                        <p style="margin:0;font-size:13px;line-height:1.8;color:${EMAIL_MUTED};">
                            ${secondaryNote}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * 发送邮箱验证邮件
 */
export async function sendVerificationEmail(
    email: string,
    token: string,
): Promise<SendResult> {
    try {
        const resend = getResendClient();
        const verifyUrl = buildAbsoluteUrl(`/verify-email?token=${encodeURIComponent(token)}`);
        const { brandName } = getSiteBrandConfig();

        const { error } = await resend.emails.send({
            from: getSenderAddress(),
            to: email,
            subject: `验证您的邮箱 — ${brandName}`,
            html: buildEmailHtml({
                eyebrow: '账户验证',
                title: '验证你的邮箱地址',
                intro: `感谢注册${brandName}。点击下方按钮完成邮箱验证后，你就可以继续使用完整的账户功能。`,
                actionLabel: '验证邮箱',
                actionUrl: verifyUrl,
                secondaryNote: '如果这不是你本人的注册操作，可以直接忽略这封邮件。',
            }),
        });

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : '邮件发送失败';
        return { success: false, error: message };
    }
}

/**
 * 发送密码重置邮件
 */
export async function sendPasswordResetEmail(
    email: string,
    token: string,
): Promise<SendResult> {
    try {
        const resend = getResendClient();
        const resetUrl = buildAbsoluteUrl(`/reset-password?token=${encodeURIComponent(token)}`);
        const { brandName } = getSiteBrandConfig();

        const { error } = await resend.emails.send({
            from: getSenderAddress(),
            to: email,
            subject: `重置密码 — ${brandName}`,
            html: buildEmailHtml({
                eyebrow: '账户安全',
                title: '重置你的密码',
                intro: '我们收到了你的密码重置请求。点击下方按钮即可设置新密码，链接将在 1 小时后失效。',
                actionLabel: '重置密码',
                actionUrl: resetUrl,
                secondaryNote: '如果这不是你本人的操作，请忽略这封邮件，你的账户不会被自动修改。',
            }),
        });

        if (error) {
            return { success: false, error: error.message };
        }
        return { success: true };
    } catch (err) {
        const message = err instanceof Error ? err.message : '邮件发送失败';
        return { success: false, error: message };
    }
}
