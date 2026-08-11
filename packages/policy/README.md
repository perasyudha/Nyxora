# @nyxora/policy-sdk

**Nyxora Policy Engine SDK** – The rigid security middleware for the Nyxora autonomous agent framework.

This SDK provides the security rules, JWT-based authentication, and transaction whitelist/limit enforcement layer that sits between the AI Core (`nyxora-agent-core`) and the secure cryptographic signer (`@nyxora-sdk/signer`).

> **Note:** This package is part of the Nyxora 4-Tier Architecture and is currently under active Research & Development (R&D).

## Installation

```bash
npm install @nyxora/policy-sdk
```

## Usage

You can embed the Policy Engine directly into your own Express application, or run it standalone.

```typescript
import { createPolicyEngine } from '@nyxora/policy-sdk';

// Initialize the engine with custom configuration
const policyApp = createPolicyEngine({
  jwtSecret: 'your-secure-internal-secret', // Optional: defaults to ~/.nyxora/auth/runtime.token
  signerPort: 3002,                        // Optional: defaults to 3002
});

// Start the policy server
policyApp.listen(3001, () => {
  console.log('Policy SDK is running on port 3001');
});
```

## Features

- **End-to-End HMAC Signatures**: Validates internal request signatures to prevent spoofing.
- **On-Chain Kill-Switch**: Periodically checks the blockchain registry status to pause operations if the system is compromised.
- **Whitelist Enforcement**: Enforces strict destination address whitelists based on `policy.yaml`.
- **Value Limits**: Enforces `max_usd_per_tx` limits to prevent accidental fund drainage.
- **Cryptographic Bound Approvals**: Secure Challenge-Nonce approval hashes for human-in-the-loop transaction confirmation.

## Documentation

For full documentation and architecture details, please visit the [Nyxora SDK Framework Documentation](https://perasyudha.github.io/Nyxora/sdk/).
