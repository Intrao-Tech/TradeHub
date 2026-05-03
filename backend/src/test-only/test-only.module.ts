// Conditionally loaded by AppModule when NODE_ENV === 'test'. Wires up the
// /test/mailbox/:address route AND monkey-patches MailService to push the
// raw verification / reset token into the process-global sink so Playwright
// can fetch it.

import { Module, type OnModuleInit } from '@nestjs/common';
import { MailService } from '../mail/mail.service';
import { TestMailboxController, recordRawToken } from './test-mailbox.controller';
import { TestSeedController } from './test-seed.controller';

@Module({
  controllers: [TestMailboxController, TestSeedController],
})
export class TestOnlyModule implements OnModuleInit {
  constructor(private readonly mail: MailService) {}

  onModuleInit() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('TestOnlyModule must not mount outside NODE_ENV=test');
    }
    patchMail(this.mail);
  }
}

function patchMail(mail: MailService): void {
  const origVerify = mail.sendVerificationEmail.bind(mail);
  mail.sendVerificationEmail = async (
    to: string,
    displayName: string,
    confirmUrl: string,
  ) => {
    const m = confirmUrl.match(/[?&]token=([^&]+)/);
    if (m) recordRawToken('verify', to, decodeURIComponent(m[1]));
    return origVerify(to, displayName, confirmUrl);
  };

  const origReset = mail.sendPasswordReset.bind(mail);
  mail.sendPasswordReset = async (
    to: string,
    displayName: string,
    resetUrl: string,
  ) => {
    const m = resetUrl.match(/[?&]token=([^&]+)/);
    if (m) recordRawToken('reset', to, decodeURIComponent(m[1]));
    return origReset(to, displayName, resetUrl);
  };

  const origStaffInvite = mail.sendStaffInvite.bind(mail);
  mail.sendStaffInvite = async (
    to: string,
    displayName: string,
    initialPassword: string,
    inviteExpiresAt: Date,
  ) => {
    recordRawToken('staff_invite', to, initialPassword);
    return origStaffInvite(to, displayName, initialPassword, inviteExpiresAt);
  };
}
