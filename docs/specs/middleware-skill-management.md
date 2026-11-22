## Problem Statement

The operations team needs to adjust dozens or hundreds of Salesforce `ServiceResourceSkill` records efficiently. Editing individual Salesforce records or navigating the standard related list is too slow and does not give the team an effective bulk workflow for changes by shift and collaborator.

## Solution

Build a Google Apps Script middleware connected to Google Sheets and Salesforce. The static spreadsheet gives operators an editable matrix of collaborators and skills, while the script loads Salesforce data, creates a preview diff, and sends confirmed insertions and updates to a dedicated Apex REST endpoint.

The existing OAuth authentication pattern from MonitorOps will be adapted for this project: OAuth is per user, Salesforce Production is the default environment, Sandbox is selectable, credentials stay in Script Properties, and user tokens stay in User Properties. A real session check prevents stale or invalid authentication sessions from leaving the operator stuck.

## User Stories

1. As an operations operator, I want to open a menu in Google Sheets, so that I can synchronize and publish collaborator skill changes.
2. As an operations operator, I want to synchronize active collaborators from Salesforce, so that the matrix reflects the current organization.
3. As an operations operator, I want to see collaborators grouped and filtered by supervision and department, so that I can review the relevant unit quickly.
4. As an operations operator, I want to select individual rows or a subset of the matrix, so that I can publish only the changes I intentionally reviewed.
5. As an operations operator, I want to edit a skill level and effective dates in Google Sheets, so that I can maintain the collaborator's scheduling capabilities in bulk.
6. As an operations operator, I want to add a new skill assignment in the matrix, so that it can be inserted into Salesforce.
7. As an operations operator, I want to update an existing skill assignment in the matrix, so that the Salesforce record changes without recreating it.
8. As an operations operator, I want the system to identify existing rows by Salesforce record ID, so that updates do not accidentally create duplicates.
9. As an operations operator, I want new rows to be matched by collaborator, skill, and start date, so that duplicate identities are detected consistently.
10. As an operations operator, I want the system to reject duplicate or overlapping periods for the same collaborator and skill, so that conflicting vigencies do not reach Salesforce.
11. As an operations operator, I want a start date to be mandatory and an end date to be optional, so that open-ended skill assignments are supported.
12. As an operations operator, I want a positive decimal skill level, so that invalid levels are rejected before publication.
13. As an operations operator, I want the valid skill-level domain to be discovered from the organization rather than assumed, so that a fixed range is not imposed on an unknown Salesforce configuration.
14. As an operations operator, I want to select Production or Sandbox before signing in, so that I do not accidentally publish to the wrong environment.
15. As an authenticated Salesforce user, I want the application to verify the session against Salesforce, so that stale OAuth state is detected and repaired.
16. As an operations operator, I want to log in and log out without losing access to unrelated Google Sheets data, so that authentication remains isolated per user.
17. As an operations operator, I want to see a preview diff before publication, so that I know exactly which rows will be inserted or updated.
18. As an operations operator, I want to confirm a publication explicitly, so that no changes are sent merely by editing the sheet.
19. As an operations operator, I want Salesforce values in the spreadsheet to be overwritten by confirmed spreadsheet values, so that the published matrix is the authoritative edit for that batch.
20. As an operations operator, I want failed rows to be reported individually, so that valid rows can still be published and I can correct the remaining rows.
21. As an operations operator, I want an audit entry for every publication, so that I can identify the user, time, environment, selected rows, successes, and failures.
22. As an operations operator, I want the audit to include a reduced payload summary, so that troubleshooting is possible without storing unnecessary sensitive detail.
23. As an operations supervisor, I want to review a batch by unit and then publish it, so that organizational approval remains a manual operational step.
24. As a Salesforce administrator, I want the endpoint to validate field values and enforce vigency rules, so that sheet logic and Salesforce business rules remain aligned.
25. As a Salesforce administrator, I want the Apex endpoint to enforce authorization for the connected user, so that publication does not bypass Salesforce permissions.
26. As a developer, I want the field and sheet-column mapping to be configurable in a dedicated sheet, so that API names can change without rewriting the script.
27. As a developer, I want to preserve headers, styles, formulas, and formatting while refreshing data, so that synchronization does not destroy the operator experience.
28. As a developer, I want pagination for Salesforce queries, so that collaborators and skill records beyond the first API page are included.
29. As a developer, I want the OAuth implementation to support refresh and logout flows, so that operators do not need to reauthenticate for every operation.
30. As a developer, I want an environment health check, so that configuration and API availability are diagnosed before a publication.
31. As a developer, I want an Apex test suite for insert and update behavior, so that the endpoint can be changed safely.
32. As a developer, I want external behavior tests for the normalized publication model, so that validation is independent of Google Apps Script UI details.
33. As an auditor, I want Salesforce's `CreatedById` and `LastModifiedById` to remain available, so that native record provenance is preserved.
34. As a planner, I want expired or soon-to-expire skills to be visually distinguished, so that vigency risks are easy to notice.
35. As a planner, I want native filters by supervision and department, so that the matrix can be narrowed quickly.
36. As a release operator, I want a local `clasp` workflow, so that code and manifest changes can be reviewed and deployed through Git.
37. As a release operator, I want deployment instructions to distinguish a pushed `@HEAD` from a pinned deployment, so that users do not mistake an old web-app deployment for the latest code.
38. As an operator, I want clear success and failure feedback after publication, so that I know which selected rows require attention.
39. As an operator, I want to stop a stale batch when a required mapping is missing or invalid, so that an incomplete diff is never published.
40. As an operator, I want no deletion control in the MVP, so that accidental removal of Salesforce skill records is not possible.

## Implementation Decisions

- The application is implemented with Google Apps Script and Google Sheets, developed locally through `clasp` and reviewed in Git.
- The initial implementation targets Google Apps Script V8 and an Apps Script OAuth web application that executes as the accessing user.
- The spreadsheet is a static container with stable sheet names and a dedicated `__Config_Mapping` sheet.
- The mapping sheet translates spreadsheet columns into Salesforce objects and API field names. It identifies primary keys and fields that can be updated.
- Salesforce collaborator data is loaded from `ServiceResource`. The initial load must include identity, name, active state, optimization state, department, supervision, coordination, location, resource type, local identifiers, and display fields relevant to the matrix.
- Skill assignments are loaded from `ServiceResourceSkill` together with the skill label needed for the matrix.
- SOQL queries support pagination and explicit HTTP/API error handling rather than silently parsing failures.
- A modular publication seam normalizes selected sheet rows into an application result containing insertion, update, and validation-error records.
- Existing skill assignments are identified by their Salesforce `Id`.
- A new skill assignment is identified by `ServiceResourceId + SkillId + EffectiveStartDate`.
- The normalized batch rejects exact duplicates and overlap between vigencies for the same collaborator and skill.
- `EffectiveStartDate` is required. `EffectiveEndDate` is optional.
- `SkillLevel` is validated as a decimal greater than zero. No fixed range is assumed; organization-specific valid values are loaded or validated by configuration.
- Publication is manual and explicit. Editing or loading sheet data does not change Salesforce.
- Publication processes only the selected rows and sends insertions and updates, never deletions.
- The service displays a diff and requires a confirmation before sending the batch.
- The sheet values prevail for the selected rows. The implementation does not block an update merely because Salesforce changed after the sheet was loaded.
- The backend makes a best effort across the batch: valid records are published and failures are returned with row-level diagnostics.
- An Apex REST endpoint is the Salesforce write gateway. It is responsible for authorization, validation, bulk DML, and partial-result reporting.
- The write endpoint must not perform deletes in the MVP.
- OAuth follows the adapted MonitorOps pattern: OAuth2 PKCE, per-user token storage in User Properties, credentials in Script Properties, explicit environment selection, refresh-token support, callback handling, and real-session validation.
- Production is the default environment. Sandbox is available through an explicit environment choice.
- If a session is invalid or stale, the application resets only the affected user session and provides a fresh authorization URL.
- Logout revokes the Salesforce token and clears the user OAuth properties and cache.
- Every publication writes an audit row to a `Publicacoes` sheet with user, timestamp, environment, selected count, success count, failure count, and a reduced payload summary.
- The operator UI provides a custom menu for synchronization, publication, login, logout, and health checks.
- The sheet supports native filters and conditional formatting for end dates and relevant vigency states.
- The system uses only the labels and tracker behavior already configured for this repository.

## Testing Decisions

- Test the external behavior of the normalized batch module: given selected sheet rows and Salesforce data, it must produce insertions, updates, exact duplicate errors, overlap errors, date errors, and invalid-level errors.
- Test identity resolution separately: existing rows use Salesforce `Id`; new rows use collaborator, skill, and start date.
- Test duplicate and overlap scenarios with concrete vigency periods, including open-ended assignments.
- Test that no delete operation can be produced by the normalized batch.
- Test that the diff is deterministic and includes a stable row identifier for each result.
- Test partial publication responses with both successful and failed records.
- Test OAuth at the integration boundary by validating session ping, refresh, callback, environment switching, invalid-session cleanup, and logout behavior.
- Test Apps Script adapter behavior using a seam that maps external API responses and sheet rows into application types. Do not assert SpreadsheetApp internals.
- Test sheet refresh behavior externally: required data is populated, headers/styles/formulas remain intact, and stale data outside the data range is not written.
- Test Salesforce Apex REST behavior with Apex tests using test `ServiceResource`, `Skill`, and `ServiceResourceSkill` records where the org permits them.
- Use red-green-refactor and test only observable behavior, not private implementation details.
- Prior art is the existing MonitorOps OAuth2 and real-session verification pattern, but the implementation must remain isolated and reusable.
- Prioritize one end-to-end vertical slice before broad UI polish: authentication, single data load, one preview, one insert or update, and one audit record.

## Out of Scope

- Deleting `ServiceResourceSkill` records in the MVP.
- Automatic publication or scheduled writes.
- A separate approval role or two-person approval workflow.
- An automatic conflict lock based on Salesforce `LastModifiedDate`.
- A fixed global range for `SkillLevel`.
- A fully generic Salesforce data mapping engine beyond the configured matrix and publication rules.
- A replacement or migration of the existing MonitorOps application.
- Realtime bidirectional synchronization.
- Mobile-specific UI.
- Scheduled background synchronization.
- Advanced analytics or optimization of Field Service schedules.
- Supporting arbitrary issue trackers or arbitrary spreadsheet editors in the MVP.

## Further Notes

- The project is not time-bound. Delivery should proceed through vertical modules with visible feedback loops.
- The MVP covers all units, but publication remains manual and operator-led.
- The original plan also includes setup, collaborator synchronization, dynamic mapping, UI, and filters. This specification supersedes the original draft where they conflict, especially for no deletions, explicit publication, sheet precedence, and partial batch reporting.
- The Apex REST gateway and publication seam are hard-to-reverse integration choices and should be recorded in ADRs.
- A follow-up specification may be needed for the exact Salesforce skill-level domain, environment-specific credentials, and the final spreadsheet schema after operator review.
