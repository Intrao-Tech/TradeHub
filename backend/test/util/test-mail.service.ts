// TEST-AUTH-040 / Decisions Log 2026-05-03: in-memory mailbox replacing
// MailService for tests. Same surface as MailService but every send is
// recorded into `mailbox` and never leaves the process.

import { Injectable } from '@nestjs/common';

export type CapturedMail = {
  to: string;
  subject: string;
  kind:
    | 'verification'
    | 'welcome'
    | 'password_reset'
    | 'google_signin_reminder'
    | 'staff_invite'
    | 'staff_password_reset'
    | 'staff_promotion'
    | 'escrow_funded'
    | 'generic';
  // Useful per-kind payloads — pulled out of args so tests don't have to grep HTML.
  data: Record<string, unknown>;
  sentAt: Date;
};

@Injectable()
export class TestMailService {
  readonly mailbox: CapturedMail[] = [];

  reset() {
    this.mailbox.length = 0;
  }

  /** All mail captured for a given recipient address (case-insensitive). */
  forAddress(to: string): CapturedMail[] {
    const needle = to.toLowerCase();
    return this.mailbox.filter((m) => m.to.toLowerCase() === needle);
  }

  /** Latest captured mail of the given kind for the given recipient. */
  latest(
    to: string,
    kind?: CapturedMail['kind'],
  ): CapturedMail | undefined {
    const list = this.forAddress(to).filter((m) =>
      kind ? m.kind === kind : true,
    );
    return list[list.length - 1];
  }

  // ── MailService surface ────────────────────────────────────────

  async send(
    to: string,
    subject: string,
    html: string,
    text?: string,
  ): Promise<void> {
    this.mailbox.push({
      to,
      subject,
      kind: 'generic',
      data: { html, text: text ?? null },
      sentAt: new Date(),
    });
  }

  async sendWelcome(to: string, displayName: string): Promise<void> {
    this.mailbox.push({
      to,
      subject: 'Welcome to TradeHub',
      kind: 'welcome',
      data: { displayName },
      sentAt: new Date(),
    });
  }

  async sendVerificationEmail(
    to: string,
    displayName: string,
    confirmUrl: string,
  ): Promise<void> {
    const tokenMatch = confirmUrl.match(/[?&]token=([^&]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    this.mailbox.push({
      to,
      subject: 'Confirm your TradeHub email',
      kind: 'verification',
      data: { displayName, confirmUrl, token },
      sentAt: new Date(),
    });
  }

  async sendPasswordReset(
    to: string,
    displayName: string,
    resetUrl: string,
  ): Promise<void> {
    const tokenMatch = resetUrl.match(/[?&]token=([^&]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    this.mailbox.push({
      to,
      subject: 'Reset your TradeHub password',
      kind: 'password_reset',
      data: { displayName, resetUrl, token },
      sentAt: new Date(),
    });
  }

  async sendGoogleSignInReminder(
    to: string,
    displayName: string,
  ): Promise<void> {
    this.mailbox.push({
      to,
      subject: 'Sign in to TradeHub with Google',
      kind: 'google_signin_reminder',
      data: { displayName },
      sentAt: new Date(),
    });
  }

  async sendStaffInvite(
    to: string,
    displayName: string,
    initialPassword: string,
    inviteExpiresAt: Date,
  ): Promise<void> {
    this.mailbox.push({
      to,
      subject: 'Your TradeHub staff account',
      kind: 'staff_invite',
      data: { displayName, initialPassword, inviteExpiresAt },
      sentAt: new Date(),
    });
  }

  async sendStaffPasswordReset(
    to: string,
    displayName: string,
    newPassword: string,
  ): Promise<void> {
    this.mailbox.push({
      to,
      subject: 'Your TradeHub staff password has been reset',
      kind: 'staff_password_reset',
      data: { displayName, newPassword },
      sentAt: new Date(),
    });
  }

  async sendStaffPromotion(
    to: string,
    displayName: string,
    staffRole: 'ADMIN' | 'MODERATOR',
  ): Promise<void> {
    this.mailbox.push({
      to,
      subject: `You're now a TradeHub ${staffRole.toLowerCase()}`,
      kind: 'staff_promotion',
      data: { displayName, staffRole },
      sentAt: new Date(),
    });
  }

  async sendEscrowFunded(
    to: string,
    displayName: string,
    escrowId: string | number,
    amountGbp: string,
  ): Promise<void> {
    this.mailbox.push({
      to,
      subject: `Escrow #${escrowId} funded — £${amountGbp}`,
      kind: 'escrow_funded',
      data: { displayName, escrowId, amountGbp },
      sentAt: new Date(),
    });
  }
}
