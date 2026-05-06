import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';

/**
 * COLLAB-003 — placeholder page for `/escrow/:id`.
 *
 * Real Stripe-Connect escrow ships in `tasks/product/escrow/`. This page only
 * exists so the detail page's `Manage payment →` footer link can be a real
 * route, not a disabled button.
 */

export default function EscrowPlaceholderPage() {
  const { id } = useParams<{ id: string }>();
  const backHref = id ? `/collaborations/${id}` : '/collaborations';

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={backHref}>
          <ArrowLeft />
          Back to collaboration
        </Link>
      </Button>
      <EmptyState
        icon={Banknote}
        title="Escrow is coming soon"
        description="Stripe-Connect-backed escrow (deposit, hold, release, refund) ships in the next feature. For now this page is a placeholder."
        action={
          <Button asChild variant="outline">
            <Link to={backHref}>Back to collaboration</Link>
          </Button>
        }
      />
    </div>
  );
}
