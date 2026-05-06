// TEST-COLLAB-005 — MSW v2 handler for the (read-only) escrow surface
// consumed by Collaborations Polish.
//
// Only the GET-by-collaboration endpoint is mocked. The Collaborations
// surface in this feature does not call any escrow mutation endpoint;
// `tests-escrow/` owns full escrow coverage when that feature ships.

import { http, HttpResponse } from 'msw';
import { mockEscrowTransaction } from '../factories';

const API = 'http://localhost:8081/api';

export const escrowHandlers = [
  http.get(`${API}/escrow/collaboration/:id`, ({ params }) =>
    HttpResponse.json(
      mockEscrowTransaction({ collaboration_id: String(params.id) }),
    ),
  ),
];
