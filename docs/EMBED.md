# Host integration boundary prototype

Status: a full-page launch contract and a pure notification schema. This is not a production SDK, an iframe widget, or an externally validated integration. No integrator feedback has been collected for this contract.

The prototype reuses Raise's existing Portfolio screen and its existing wallet provider. It adds no duplicate application state and no alternate signing flow.

## Launch from a host application

Configure the exact Raise deployment origin in the host application. Use HTTPS outside loopback development. Do not accept the destination origin from an end-user URL.

```ts
import { buildEmbedLink } from '../web/src/lib/embed';

const href = buildEmbedLink('http://localhost:3000', {
  network: 4001,
  // Optional: vaultId: a validated 64-character hexadecimal ledger index.
});
```

Render the resulting URL as a normal link. For a new browsing context, use `target="_blank" rel="noopener noreferrer"`; keep Raise on a separate origin from the host. The host must never ask for or forward a Raise wallet seed.

The accepted URL contract is:

```text
/embed?network=4001
/embed?network=4001&vault=<64-character hexadecimal vault index>
```

`network` is mandatory and must be exactly `4001`. An optional vault is normalized to uppercase. Repeated parameters, unknown parameters, malformed vault IDs, and different networks are rejected. The route then redirects internally through the legacy `/position` route to `/portfolio`, optionally selecting the validated vault. No host-supplied destination or callback URL is accepted. The actual wallet still checks network 4001 before signing.

## Wallet and state ownership

Raise owns wallet connection, transaction review, local signing, offer preparation, and recovery. The host does not provide wallet seeds, signing keys, signed blobs, address shortcuts, or account state through launch parameters, messages, or shared storage.

The existing development wallet remains inside Raise's browser session. Its session storage and public transaction recovery journal are governed by Raise's origin. Separate origins and `noopener` are required host integration assumptions, not protections imposed automatically by a URL helper. This prototype does not claim production custody or isolation for a host that serves Raise code on its own origin.

## Optional generic notifications

`createEmbedNotification(status, localOptIn)` models an allowlisted envelope. It returns `null` unless the user has explicitly opted in locally. URL parameters cannot set that choice. Supported statuses are `ready`, `pending`, `complete`, and `attention-required`.

```ts
const envelope = createEmbedNotification('pending', true);
// { type: 'raise.status', version: 1, status: 'pending' }
```

Only those three envelope fields are emitted. There are no wallet addresses, balances, vault IDs, offer IDs, transaction hashes, error details, or timestamps. A generic completion notification is not proof that a financial transaction settled; the host must not display it as a receipt.

There is intentionally no `postMessage` transport, callback request, global event, listener, notification persistence, or opt-in UI wired to the running app. The pure function demonstrates the proposed schema only. A caller cannot use it as evidence that the application obtained consent.

## Before any real host integration

Agree on a specific integrator and explicit approved origins. Validate user expectations for the full-page handoff, wallet isolation, return navigation, and accessibility. If notifications are requested, design and verify a local consent control and exact-origin transport before adding it. Keep lifecycle and ledger verification inside Raise.

External feedback is still missing. The implemented boundary and its tests can be reviewed now; they do not establish partner adoption, production readiness, or approval of an embedded signing experience.
