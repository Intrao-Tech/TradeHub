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
    this.frontendUrl =
      this.config.get<string>('FRONTEND_URL') || 'http://localhost:3001';
    const host = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER') || '';
    const pass = (this.config.get<string>('SMTP_PASS') || '').replace(
      /\s+/g,
      '',
    );
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

  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(
        `Mail skipped (disabled): to=${to} subject="${subject}"`,
      );
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
      this.logger.error(
        `Mail failed :: to=${to} subject="${subject}"`,
        err as Error,
      );
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

  async sendGoogleSignInReminder(
    to: string,
    displayName: string,
  ): Promise<void> {
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
    const staffUrl = (
      this.config.get<string>('STAFF_FRONTEND_URL') || this.frontendUrl
    ).replace(/\/$/, '');
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
    const staffUrl = (
      this.config.get<string>('STAFF_FRONTEND_URL') || this.frontendUrl
    ).replace(/\/$/, '');
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
    const staffUrl = (
      this.config.get<string>('STAFF_FRONTEND_URL') || this.frontendUrl
    ).replace(/\/$/, '');
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

  async sendEscrowMilestoneFunded(
    to: string,
    displayName: string,
    milestoneTitle: string,
    amount: string,
    payoutsEnabled: boolean,
  ): Promise<void> {
    const subject = payoutsEnabled
      ? `Funds in escrow — start work on "${milestoneTitle}"`
      : `Action needed — set up payouts to receive £${amount} for "${milestoneTitle}"`;
    const onboardingBlock = payoutsEnabled
      ? ''
      : `
        <div style="background: #fef3c7; padding: 12px; border-left: 3px solid #b45309; margin: 16px 0;">
          <strong>You need to set up payouts before you can receive this money.</strong>
          Stripe Connect onboarding takes ~3 minutes. Once you finish, we'll
          automatically release any approved milestones to you.
        </div>
      `;
    const ctaLabel = payoutsEnabled ? 'Open your wallet' : 'Set up payouts now';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Milestone funded 💷</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>The employer has funded milestone <strong>"${escapeHtml(milestoneTitle)}"</strong> for <strong>£${escapeHtml(amount)}</strong>. Funds are now held in escrow.</p>
        ${onboardingBlock}
        <p>Start the work and submit it via the escrow page when done. Once submitted, the employer has 7 days to approve — auto-released after that.</p>
        <p><a href="${this.frontendUrl}/wallet" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">${ctaLabel}</a></p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendEscrowMilestoneSubmitted(
    to: string,
    displayName: string,
    milestoneTitle: string,
    amount: string,
  ): Promise<void> {
    const subject = `Worker submitted milestone "${milestoneTitle}" — review within 7 days`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Work submitted for review 📩</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>The worker has submitted milestone <strong>"${escapeHtml(milestoneTitle)}"</strong> (£${escapeHtml(amount)}) for your review.</p>
        <p>You have <strong>7 days</strong> to approve or open a dispute. After that, funds auto-release to the worker.</p>
        <p><a href="${this.frontendUrl}/collaborations" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">Review now</a></p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendEscrowMilestoneReleased(
    to: string,
    displayName: string,
    milestoneTitle: string,
    amount: string,
    autoReleased: boolean,
  ): Promise<void> {
    const subject = autoReleased
      ? `Milestone "${milestoneTitle}" auto-released — £${amount} on its way`
      : `£${amount} released — milestone "${milestoneTitle}" approved`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Funds released ✅</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p><strong>£${escapeHtml(amount)}</strong> for milestone <strong>"${escapeHtml(milestoneTitle)}"</strong> has been released to your linked Stripe account${autoReleased ? ' (auto-released after 7 days of employer silence)' : ''}.</p>
        <p>Stripe pays out to your bank on a standard 2-day rolling schedule for UK accounts.</p>
        <p><a href="${this.frontendUrl}/wallet" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">View your wallet</a></p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendEscrowMilestoneAutoReleased(
    to: string,
    displayName: string,
    milestoneTitle: string,
    amount: string,
  ): Promise<void> {
    const subject = `Milestone "${milestoneTitle}" auto-released after 7 days`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #b45309;">Auto-release fired</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>You didn't approve milestone <strong>"${escapeHtml(milestoneTitle)}"</strong> (£${escapeHtml(amount)}) within 7 days, so funds were auto-released to the worker per our terms.</p>
        <p>If you believe this was in error, you can still file a dispute via the escrow page. A TradeHub mediator will review.</p>
        <p><a href="${this.frontendUrl}/collaborations" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">Review</a></p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendEscrowMilestoneDisputed(
    to: string,
    displayName: string,
    milestoneTitle: string,
    reason: string,
  ): Promise<void> {
    const subject = `Dispute filed on milestone "${milestoneTitle}"`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #b45309;">Dispute filed ⚠️</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>A dispute has been filed on milestone <strong>"${escapeHtml(milestoneTitle)}"</strong>.</p>
        <p style="background: #fef3c7; padding: 12px; border-left: 3px solid #b45309;">
          <strong>Reason:</strong> ${escapeHtml(reason)}
        </p>
        <p>You have 7 days to respond. If you and the other party can't agree, a TradeHub mediator will review the case and make a binding decision.</p>
        <p><a href="${this.frontendUrl}/collaborations" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Open dispute</a></p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendEscrowMilestoneRefunded(
    to: string,
    displayName: string,
    milestoneTitle: string,
    amount: string,
    reason: string,
  ): Promise<void> {
    const subject = `Milestone "${milestoneTitle}" refunded — £${amount}`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Refund processed ↩️</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>Milestone <strong>"${escapeHtml(milestoneTitle)}"</strong> has been refunded — £${escapeHtml(amount)} returned to the employer.</p>
        <p style="background: #f1f5f9; padding: 12px; border-left: 3px solid #64748b;">
          <strong>Reason:</strong> ${escapeHtml(reason)}
        </p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendPayoutsEnabled(to: string, displayName: string): Promise<void> {
    const subject = 'You can now receive payouts on TradeHub';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Payouts enabled 💷</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>Your Stripe Connect account is fully set up. When an employer funds a milestone for your work, the funds will be released straight to your bank when the milestone is approved.</p>
        <p><a href="${this.frontendUrl}/wallet" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">Open your wallet</a></p>
        <p style="color:#64748b;font-size:13px;">Stripe pays out to your bank on a standard 2-day rolling schedule for UK accounts.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendVerificationVerified(
    to: string,
    displayName: string,
  ): Promise<void> {
    const subject = "You're verified on TradeHub";
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Identity verified ✅</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>Your identity check passed. Your TradeHub trust badge has been upgraded to <strong>Basic</strong> — employers and workers can now see that you're a verified user.</p>
        <p>Want to climb higher? Add a trade certificate (CSCS / Gas Safe / NICEIC / FIRAS) to reach <strong>Certified</strong>.</p>
        <p><a href="${this.frontendUrl}/profile" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">Open your profile</a></p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendVerificationFailed(
    to: string,
    displayName: string,
    reason: string | null,
  ): Promise<void> {
    const subject = 'Identity verification needs another try';
    const reasonLine = reason
      ? `<p style="color:#64748b;font-size:13px;">Reason from Stripe: <code>${escapeHtml(reason)}</code></p>`
      : '';
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #b45309;">Verification didn't go through</h2>
        <p>Hi ${escapeHtml(displayName)},</p>
        <p>Stripe couldn't verify the documents you submitted. This usually happens when the photo is blurry, the ID is expired, or the selfie doesn't match the document.</p>
        <p>Start a fresh attempt and double-check that your ID is in date and the photo is well-lit.</p>
        <p><a href="${this.frontendUrl}/profile?verification=retry" style="display:inline-block;padding:10px 18px;background:#E07A3B;color:#fff;border-radius:6px;text-decoration:none;">Try again</a></p>
        ${reasonLine}
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendReferralAccountAttributed(
    to: string,
    referrerDisplayName: string,
    newAccountDisplayName: string,
    newAccountEmail: string,
  ): Promise<void> {
    const subject = `${newAccountDisplayName} signed up via your referral link`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">New referral signup 🎉</h2>
        <p>Hi ${escapeHtml(referrerDisplayName)},</p>
        <p><strong>${escapeHtml(newAccountDisplayName)}</strong> (${escapeHtml(newAccountEmail)}) just signed up to TradeHub via your referral link.</p>
        <p>You'll earn a % of the platform fee on every milestone they're a party to (worker or employer side) — paid out automatically when each contract milestone releases.</p>
        <p><a href="${this.frontendUrl}/referrals" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">View your referrals</a></p>
        <p style="color:#64748b;font-size:13px;">Earnings only fire on released milestones. If they never get hired, no commission accrues.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendReferralProjectAttributed(
    to: string,
    referrerDisplayName: string,
    targetTitle: string,
    targetKind: 'JOB' | 'WORKER',
    actorDisplayName: string,
  ): Promise<void> {
    const noun = targetKind === 'JOB' ? 'job link' : 'worker link';
    const subject = `Your ${noun} was used by ${actorDisplayName}`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Project referral attributed</h2>
        <p>Hi ${escapeHtml(referrerDisplayName)},</p>
        <p><strong>${escapeHtml(actorDisplayName)}</strong> just acted on your shared ${noun} for <strong>${escapeHtml(targetTitle)}</strong>.</p>
        <p>If a hire results from this, you'll earn the configured project-referral % on every released milestone — paid from platform fee.</p>
        <p><a href="${this.frontendUrl}/referrals" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">View your referrals</a></p>
        <p style="color:#64748b;font-size:13px;">Sharing for commission is anonymous — the recipient sees a normal page, not your name.</p>
      </div>
    `;
    await this.send(to, subject, html);
  }

  async sendReferralCommissionPaid(
    to: string,
    referrerDisplayName: string,
    amountGbp: string,
    contractTitle: string,
    refType: 'ACCOUNT' | 'PROJECT_W2W' | 'PROJECT_E2E',
    paidLive: boolean,
  ): Promise<void> {
    const typeLabel =
      refType === 'ACCOUNT'
        ? 'account referral'
        : refType === 'PROJECT_W2W'
          ? 'project referral (worker→worker)'
          : 'project referral (employer→employer)';
    const subject = `You earned £${amountGbp} from ${contractTitle}`;
    const liveCopy = paidLive
      ? `<p style="background: #ecfdf5; padding: 12px; border-left: 3px solid #10b981;"><strong>Paid out</strong> to your Stripe Connect account just now.</p>`
      : `<p style="background: #fef3c7; padding: 12px; border-left: 3px solid #f59e0b;"><strong>Held as pending</strong> — finish your Stripe Connect onboarding on <a href="${this.frontendUrl}/wallet">/wallet</a> to receive this and any other accumulated commissions automatically.</p>`;
    const html = `
      <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="color: #0f766e;">Referral commission earned 💷</h2>
        <p>Hi ${escapeHtml(referrerDisplayName)},</p>
        <p>You earned <strong>£${escapeHtml(amountGbp)}</strong> from a milestone release on <strong>${escapeHtml(contractTitle)}</strong> (${escapeHtml(typeLabel)}).</p>
        ${liveCopy}
        <p><a href="${this.frontendUrl}/referrals" style="display:inline-block;padding:10px 18px;background:#0f766e;color:#fff;border-radius:6px;text-decoration:none;">View your referrals</a></p>
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
