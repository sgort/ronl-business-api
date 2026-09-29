# Backend setup

Local setup for this backend is documented on the IOU Architecture
documentation site, which is the single source of truth for it:

**[Local development →](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/local-development/)**

That page covers prerequisites, cloning and installing, the environment files,
starting the Docker services and the development servers, the test users,
verifying the setup, getting a JWT for API testing, database access, the local
service URLs, stopping the environment, and the common failures.

Related pages on the same site:

- [Backend development](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/backend-development/)
  — the test, lint, format and type-check commands, and how the workspace fits
  together
- [Testing](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/testing/overview/)
- [Troubleshooting](https://iou-architectuur.open-regels.nl/ronl-business-api/developer/troubleshooting/)

## Why this file is a pointer

It used to be a 372-line setup guide, and it went stale where the site did not:
it still said Node 20 when `.nvmrc` named 22.23.2, told readers to copy
`.env.example` to `.env.development` when the template is meant to become `.env`,
and cloned from a placeholder `your-org` URL that does not resolve. Nothing
linked to it, so nothing caught any of that.

Keeping one copy is the fix, and the site is the copy that is maintained
(iou-architectuur#105).
