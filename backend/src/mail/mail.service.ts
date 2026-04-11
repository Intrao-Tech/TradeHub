import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private fromAddress = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
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
        <p><a href="http://localhost:3000/dashboard" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">Open your dashboard</a></p>
        <p style="color:#64748b;font-size:13px;">If you didn't create this account, ignore this email.</p>
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
        <p><a href="http://localhost:3000/collaborations" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">View collaboration</a></p>
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
