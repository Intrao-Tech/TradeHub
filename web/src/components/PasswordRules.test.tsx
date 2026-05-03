// TEST-AUTH-075 — PasswordRules component.
// Source: web/src/components/PasswordRules.tsx
// Contract: AUTH-015-004 (live UI feedback) + AUTH-009 (accessible).

import { describe, expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PasswordRules } from './PasswordRules';
import { PASSWORD_RULES } from '@/lib/password-policy';

function ControlledHarness() {
  const [value, setValue] = useState('');
  return (
    <>
      <input
        data-testid="pwd"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <PasswordRules password={value} dirty={value.length > 0} />
    </>
  );
}

describe('TEST-AUTH-075 PasswordRules', () => {
  test('AUTH-015-004 — every rule label is rendered', () => {
    render(<PasswordRules password="" />);
    for (const rule of PASSWORD_RULES) {
      expect(screen.getByText(rule.label)).toBeInTheDocument();
    }
  });

  test('AUTH-009 — list element is aria-live=polite so SR announces changes', () => {
    render(<PasswordRules password="" />);
    const list = screen.getByRole('list');
    expect(list).toHaveAttribute('aria-live', 'polite');
  });

  test('AUTH-015-004 — rule rows flip met/unmet as the user types', async () => {
    const user = userEvent.setup();
    render(<ControlledHarness />);
    const input = screen.getByTestId('pwd');

    // Find the row for "8 chars" rule by label substring; use closest <li>.
    const minLengthLabel = screen.getByText(/At least \d+ characters/);
    const minLengthRow = minLengthLabel.closest('li')!;
    // Initially unmet — neutral or amber, but never the success class.
    expect(minLengthRow.className).not.toContain('text-success');

    await user.type(input, 'Aa1!aaaa');
    // Now satisfied.
    expect(minLengthRow.className).toContain('text-success');

    // Lowercase rule satisfied too.
    const lowerRow = screen.getByText(/lowercase letter/i).closest('li')!;
    expect(lowerRow.className).toContain('text-success');

    // Special rule was satisfied by `!`.
    const specialRow = screen.getByText(/special character/i).closest('li')!;
    expect(specialRow.className).toContain('text-success');
  });
});
