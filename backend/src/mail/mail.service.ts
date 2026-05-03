import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';
  private frontendUrl = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.frontendUrl = this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const host = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER') || '';
    const pass = (this.config.get<string>('SMTP_PASS') || '').replace(/\s+/g, '');
    this.fromAddress = this.config.get<string>('SMTP_FROM') || user;

    if (!user || !pass) {
      this.logger.warn('Mail disabled: SMTP_USER / SMTP_PASS not set');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    this.logger.log(`Mail enabled via ${host}:${port} as ${user}`);
  }

  async send(to: string, subject: string, html: string, text?: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`Mail skipped (disabled): to=${to} subject="${subject}"`);
      return;
    }
    try {
      await this.transporter.sendMail({
        from: this.fromAddress,
        to,
        subject,
        html,
        text: text ?? html.replace(/<[^>]+>/g, ''),
      });
      this.logger.log(`Mail sent :: to=${to} subject="${subject}"`);
    } catch (err) {
      this.logger.error(`Mail failed :: to=${to} subject="${subject}"`, err as Error);
    }
  }

  async sendWelcome(to: string, displayName: string): Promise<void> {
    const subject = 'Welcome to TradeHub';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Welcome, ${escapeHtml(displayName)} 👋</h2>
        <p>Your TradeHub account is ready. You can now browse jobs, connect with workers, and manage your projects.</p>
        <p><a href="${this.frontendUrl}/dashboard" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">Open your dashboard</a></p>
        <p style="color:#64748b;font-size:13px;">If you didn't create this account, ignore this email.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendVerificationEmail(
    to: string,
    displayName: string,
    confirmUrl: string,
  ): Promise<void> {
    const subject = 'Confirm your TradeHub email';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Confirm your email</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>Welcome to TradeHub. Click the button below to confirm your email and activate your account. This link is valid for 24 hours.</p>
        <p><a href="${confirmUrl}" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Confirm email</a></p>
        <p style="color:#64748b;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color:#64748b;font-size:13px;word-break:break-all;">${confirmUrl}</p>
        <p style="color:#64748b;font-size:13px;margin-top:24px;">If you didn't sign up for TradeHub, you can safely ignore this email.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendPasswordReset(
    to: string,
    displayName: string,
    resetUrl: string,
  ): Promise<void> {
    const subject = 'Reset your TradeHub password';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Reset your password</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>We received a request to reset your TradeHub password. Click the button below to choose a new one. This link is valid for 1 hour and can only be used once.</p>
        <p><a href="${resetUrl}" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Reset password</a></p>
        <p style="color:#64748b;font-size:13px;">If the button doesn't work, copy and paste this link into your browser:</p>
        <p style="color:#64748b;font-size:13px;word-break:break-all;">${resetUrl}</p>
        <p style="color:#64748b;font-size:13px;margin-top:24px;">If you didn't request a reset, ignore this email — your password will stay unchanged. After a successful reset, all of your active TradeHub sessions will be signed out.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendGoogleSignInReminder(to: string, displayName: string): Promise<void> {
    const subject = 'Sign in to TradeHub with Google';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Use "Continue with Google"</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>You requested a password reset, but this TradeHub account doesn't have a password — it was created with Google sign-in.</p>
        <p>To sign in, head to TradeHub and click <strong>Continue with Google</strong>.</p>
        <p><a href="${this.frontendUrl}/login" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Open sign-in</a></p>
        <p style="color:#64748b;font-size:13px;margin-top:24px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendStaffInvite(
    to: string,
    displayName: string,
    initialPassword: string,
    inviteExpiresAt: Date,
  ): Promise<void> {
    const subject = 'Your TradeHub staff account';
    const staffUrl = (this.config.get<string>('STAFF_FRONTEND_URL') || this.frontendUrl).replace(/\/$/, '');
    const expiryHuman = inviteExpiresAt.toUTCString();
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Welcome to the TradeHub staff console</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>An admin has created a TradeHub staff account for you. Sign in with the credentials below. <strong>This invite is valid for 24 hours</strong> — until ${escapeHtml(expiryHuman)}. Change your password right after the first sign-in (Settings → Security).</p>
        <table style="margin:16px 0;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 12px;color:#64748b;">Email</td><td style="padding:6px 12px;font-family:monospace;">${escapeHtml(to)}</td></tr>
          <tr><td style="padding:6px 12px;color:#64748b;">Password</td><td style="padding:6px 12px;font-family:monospace;">${escapeHtml(initialPassword)}</td></tr>
        </table>
        <p><a href="${staffUrl}/login" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Sign in</a></p>
        <p style="color:#64748b;font-size:13px;margin-top:24px;">If the link expires before you sign in, ask the admin to "Resend invite". If you weren't expecting this email, please reach out to the TradeHub admin.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendStaffPasswordReset(
    to: string,
    displayName: string,
    newPassword: string,
  ): Promise<void> {
    const subject = 'Your TradeHub staff password has been reset';
    const staffUrl = (this.config.get<string>('STAFF_FRONTEND_URL') || this.frontendUrl).replace(/\/$/, '');
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Password reset</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>An admin has reset your TradeHub staff password. All of your active sessions have been signed out for security. Use the new password below to sign in, then change it from <strong>Settings → Security</strong> when convenient.</p>
        <table style="margin:16px 0;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:6px 12px;color:#64748b;">Email</td><td style="padding:6px 12px;font-family:monospace;">${escapeHtml(to)}</td></tr>
          <tr><td style="padding:6px 12px;color:#64748b;">New password</td><td style="padding:6px 12px;font-family:monospace;">${escapeHtml(newPassword)}</td></tr>
        </table>
        <p><a href="${staffUrl}/login" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Sign in</a></p>
        <p style="color:#64748b;font-size:13px;margin-top:24px;">If you didn't expect this reset, contact the admin who triggered it.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendStaffPromotion(
    to: string,
    displayName: string,
    staffRole: 'ADMIN' | 'MODERATOR',
  ): Promise<void> {
    const subject = `You're now a TradeHub ${staffRole.toLowerCase()}`;
    const staffUrl = (this.config.get<string>('STAFF_FRONTEND_URL') || this.frontendUrl).replace(/\/$/, '');
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">You've been promoted to ${escapeHtml(staffRole.toLowerCase())}</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>An admin has granted your existing TradeHub account ${staffRole === 'ADMIN' ? 'admin' : 'moderator'} access. Your password is unchanged — keep using the one you already know.</p>
        <p>Sign in to the staff console at the link below.</p>
        <p><a href="${staffUrl}/login" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Open staff console</a></p>
        <p style="color:#64748b;font-size:13px;margin-top:24px;">If you didn't expect this, contact the admin who granted access.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendEscrowFunded(
    to: string,
    displayName: string,
    escrowId: string | number,
    amountGbp: string,
  ): Promise<void> {
    const subject = `Escrow #${escrowId} funded — £${amountGbp}`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Escrow funded</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>Escrow <strong>#${escrowId}</strong> for <strong>£${escapeHtml(amountGbp)}</strong> has been funded and is now held securely by TradeHub.</p>
        <p><a href="${this.frontendUrl}/collaborations" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">View collaboration</a></p>
      </div>
    `;
    await this.send(to, subject, html);
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
