# Export detection and delivery

## Product decision

Treat every stable master, stem batch, bounce, or render as a durable `ExportBatch` in an Export
Inbox. Detection is automatic; association and delivery remain reviewable. A transient toast alone is
not enough because the user may return hours later, correct the linked Song/version, or deliver the
same export to several people.

The recommended delivery ladder is:

1. Local ZIP plus the native macOS Share/Mail composer.
2. An optional iCloud delivery mode that publishes the completed ZIP as a temporary download URL.
3. A product-hosted `Studio Send` service for users without iCloud and for paid collaboration,
   branding, download receipts, comments, and controlled retention.
4. Optional Google Drive and Gmail integrations later. Do not make Gmail OAuth a v1 dependency.

## User experience

When a stable batch is detected, show an in-app banner and add it to the bell menu:

> New export detected
> DEMO SET · 3 stems · WAV · 48 kHz / 24-bit · 85.2 MB

Primary actions are `Review` and `Reveal`. The review sheet contains:

- inferred Song, Session, Set revision, export kind, and confidence;
- every file, total size, technical format, and completion time;
- `Change Song/version` for an inferred association;
- package name, notes, and optional manifest;
- `Zip`, `Share…`, and `Deliver…` actions.

`Deliver…` asks for recipient, subject/message, link expiry when supported, and delivery method. The
final send is always a reviewed action. Background detection never emails or uploads on its own.

## Detection contract

The existing file monitor and export-evidence model provide most of the inputs. Add an
`ExportDetectionService` that consumes raw file-event batches before the full library reconciliation.

1. Accept supported audio created or modified beneath tracked roots.
2. Score explicit folders (`Stems`, `Masters`, `Exports`, `Bounces`, `Renders`) and filename semantics.
3. Exclude Ableton recordings, freeze/consolidate/crop/reverse products, sample libraries, and files
   still changing.
4. Debounce a directory batch, then require size and modification time to remain unchanged across two
   probes. Do not announce partially rendered stems.
5. Group files by directory, creation window, technical format, and inferred export kind.
6. Deduplicate using stable physical identity plus size, modification time, and content digest when
   available, so relaunches do not repeat notifications.
7. Link verified automation outputs directly to their reviewed Set revision. Link manual exports as
   `suggested` unless deterministic filename/folder evidence identifies one revision.

Suggested persistent model:

- `ExportBatch`: ID, detected/completed dates, kind, status, confidence, Work/Session/revision IDs,
  files, technical summary, and source evidence.
- `ExportBatchStatus`: new, reviewed, dismissed, packaging, ready, delivering, delivered, failed.
- `DeliveryPackage`: immutable file list, ZIP URL, bytes, SHA-256, manifest, and creation date.
- `DeliveryAttempt`: method, recipient, timestamps, provider reference, expiry, and result. Never store
  OAuth tokens in this record.

## Packaging

Create a new ZIP without modifying or moving source audio. Use a deterministic filename such as
`DEMO_ARTIST_DEMO_SET_STEMS_2020-08-13.zip`, collision-safe suffixes, and atomic staging.
Include an optional text/JSON manifest with Song, revision, file list, sizes, sample rate, bit depth,
checksums, notes, and truthful provenance. Verify the archive before enabling delivery.

## Delivery options

### Native Share and Mail — first release

AppKit's `NSSharingService` accepts file URLs, can compose email, and supports recipients and subject.
This is the lowest-friction, no-account option and leaves the user in control of Send. It works with
available macOS sharing services, but it does not guarantee a Gmail web attachment flow.

A `mailto:` or Gmail compose URL may prefill recipient, subject, and body, but the standard URI has no
portable attachment mechanism. Do not label `Open Gmail` as `Send files`; use it only after a cloud
link exists.

### iCloud temporary delivery — recommended Apple-native path

If iCloud Drive is available and the signed app has an iCloud ubiquity-container entitlement:

1. Copy the verified ZIP into local staging; never move source exports.
2. Move that staging copy into the app's iCloud container off the main thread.
3. Wait until the flat ZIP is fully uploaded.
4. Call `FileManager.url(forPublishingUbiquitousItemAt:expiration:)`.
5. Show the returned expiry date and compose an email containing the temporary download URL.

Apple documents this API specifically as returning a URL that can be emailed so other users can
download a snapshot. The published snapshot expires automatically. Removing the underlying iCloud
item invalidates its published versions. This path uses the user's iCloud storage and needs no iCloud
password or custom OAuth screen, but it requires stable Developer ID signing, entitlements, network
availability, and a visible fallback when iCloud is unavailable.

CloudKit `CKShare` is not the same feature: it shares app-owned CloudKit records with participants and
is better suited to a future collaborative project model than one-off ZIP delivery.

### Google Drive and Gmail — later provider integration

Google Drive is a good cross-platform upload provider. Request only `drive.file`, which Google
documents as narrow per-file access, then create either a recipient-specific reader permission or an
explicit `anyone` reader permission. Default to recipient-specific access; `Anyone with the link`
must be an explicit choice.

Direct Gmail sending requires a MIME message through `users.messages.send` and the sensitive
`gmail.send` OAuth scope, which introduces additional OAuth verification. Stem packages also commonly
exceed Gmail's normal 25 MB attachment threshold, so Gmail delivery should send a Drive/iCloud link
rather than attach the ZIP. Opening Gmail in a browser cannot reliably add local attachments.

### Studio Send — paid product layer

For a true `enter an email and send` experience, the product can upload a verified package to private
object storage and send a branded transactional email containing an expiring signed link. Require a
verified sender account, explicit final review, rate limits, quotas, revoke/delete controls, retention
policy, encryption in transit/at rest, abuse controls, and auditable delivery state.

This becomes commercially valuable when it adds download receipts, delivery history, client comments,
approval/request-changes state, branded pages, revision replacement, and team delivery templates. The
free/local tier can keep detection, ZIP, and native Share; hosted transfer/storage belongs in a paid
allowance.

An attractive intermediate architecture is iCloud-hosted audio plus Studio Time Machine transactional
email: the app generates Apple's expiring URL and the service sends only the recipient, message, and
URL. Audio never enters product-owned storage, though the URL and recipient still require normal
privacy and abuse controls.

## Implementation order

1. Durable stable-batch detection, bell count, banner, review/dismiss, and real Example regression.
2. Local deterministic ZIP, manifest, checksum, Reveal, and native Share/Mail.
3. iCloud availability/onboarding, background upload, published URL, expiry/revoke, and link composer.
4. Delivery history and transactional-email spike with verified sender and rate limits.
5. Google Drive `drive.file`; add `gmail.send` only if user research proves sending from the user's
   Gmail identity is worth the OAuth-verification cost.
6. Studio Send storage and collaboration as the paid service.

## Primary sources

- Apple [`NSSharingService`](https://developer.apple.com/documentation/appkit/nssharingservice)
- Apple [`composeEmail`](https://developer.apple.com/documentation/appkit/nssharingservice/name/composeemail)
- Apple [`url(forPublishingUbiquitousItemAt:expiration:)`](https://developer.apple.com/documentation/foundation/filemanager/url%28forpublishingubiquitousitemat%3Aexpiration%3A%29)
- Apple [`setUbiquitous(_:itemAt:destinationURL:)`](https://developer.apple.com/documentation/foundation/filemanager/setubiquitous%28_%3Aitemat%3Adestinationurl%3A%29)
- Apple [`CKShare`](https://developer.apple.com/documentation/cloudkit/ckshare)
- IETF [`mailto` URI scheme, RFC 6068](https://www.rfc-editor.org/rfc/rfc6068)
- Google [Create and send Gmail messages](https://developers.google.com/workspace/gmail/api/guides/sending)
- Google [Gmail API scopes](https://developers.google.com/workspace/gmail/api/auth/scopes)
- Google [Choose Google Drive API scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- Google [Drive permissions and sharing](https://developers.google.com/workspace/drive/api/guides/manage-sharing)
- Google [Gmail large attachments through Drive](https://support.google.com/a/users/answer/11339703)
