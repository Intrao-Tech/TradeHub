import { Check, Circle } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/password-policy';

type PasswordRulesProps = {
  password: string;
  /**
   * If the user hasn't focused / typed yet, render rules in a neutral state
   * (all "pending" — circles, not red crosses). Set `dirty` when the user
   * starts typing to switch unmet rules into a "must fix" colour.
   */
  dirty?: boolean;
};

/**
 * Live-feedback list of password rules. Each row turns from neutral to green
 * as the rule is satisfied, and from neutral to amber once the user has
 * started typing without satisfying it.
 */
export function PasswordRules({ password, dirty }: PasswordRulesProps) {
  return (
    <ul className="grid gap-1.5 text-xs sm:grid-cols-2" aria-live="polite">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.check(password);
        const tone = ok
          ? 'text-success'
          : dirty
            ? 'text-warning'
            : 'text-fg-muted';
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${tone}`}>
            {ok ? (
              <Check className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Circle className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
