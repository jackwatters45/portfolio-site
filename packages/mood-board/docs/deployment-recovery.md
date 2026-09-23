# Production resource recovery

Production must update the existing resources:

| Resource | Name | Verified identity |
| --- | --- | --- |
| Worker | `mood-board` | Owns `moodboard.jackwatters.dev` |
| D1 | `mood-board-catalog` | `c09bae40-974e-4401-86de-434d6a08d169` |
| R2 | `mood-board-media` | Existing media bucket |
| Durable Object | `WorkspaceDurableObject` in `mood-board` | `c6ed9e73101f4bc981cda23eb788ca47` |

`alchemy.run.ts` pins these production resource names. It allows adoption and retains the resources on removal or replacement. Development stages keep generated names. The Durable Object remains hosted by the existing Worker.

## September 2026 recovery

After the Alchemy upgrade, deployment created a second Worker, database, and bucket under generated names. Cloudflare refused to attach the live domain to the second Worker. Moving the domain would have selected different storage.

The affected Alchemy state records are:

- `portfolio-site/prod/mood-board`
- `portfolio-site/prod/mood-board-catalog`
- `portfolio-site/prod/mood-board-media`

Before repairing state:

1. Stop concurrent deployments.
2. Read live Worker bindings and verify the identities above.
3. Back up all three state records with `alchemy state read --backend cloudflare`. Keep backups private; deployment state can contain secrets.
4. Inspect each record's `attr`. Only forget records that point to the failed, generated resources:
   - Worker: `portfolio-site-mood-board-prod-44utboungk3divoz`
   - D1: `portfolio-site-mood-board-catalog-prod-wkjggfbedvqxlzuz`, ID `b7efedae-c262-40f1-b51c-fe075fbcb0bd`
   - R2: `portfolio-site-mood-board-media-prod-aclk7ugofsn5op56`
5. Use `alchemy state delete --backend cloudflare` on those exact records. This removes deployment metadata, not cloud resources. Do not delete the stage or use recursive deletion.
6. Run a plan with the pinned production names. Confirm adoption of the original resources and no resource replacement or deletion. Planning-only credentials must never be used for deployment.
7. Deploy through CI with the production secrets.
8. Verify the Worker bindings still match the original D1, R2, and Durable Object identities. Verify the authentication endpoint before starting MCP sign-in.

Do not repeat state deletion after adoption succeeds. Do not delete the extra cloud resources during recovery; inspect them separately before any cleanup.

The other sites' redirect-rule permission failures are separate. Their deployment token needs access to the zone's dynamic redirect rules; changing the Moodboard domain does not resolve those failures.
