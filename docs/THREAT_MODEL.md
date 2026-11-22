# OriginOS threat model — starter

## High-priority assets
Agent histories, unpublished manuscripts, creator personal information, private research, API tokens, OAuth grants, signing keys, billing data and signed records.

## Threat categories
Cross-tenant access; malicious document uploads; prompt-injected retrieved sources; OAuth confused-deputy and token theft; inbound webhook replay; model tool overreach; fraudulent identity/ownership claims; tampered C2PA media; unsigned/stale provenance; untrusted MCP servers; adversarial agents; trace data leak; forged outcomes; signing-key compromise; insider misuse; data retention failures.

## Mandatory controls
Least privilege, backend permission checks, data isolation, encrypted tokens, signed webhook verification, scrubbed trace ingestion, issuer trust validation, honest labels and human approval gates. Add detailed STRIDE per subsystem in phase 41+ and keep this document current.
