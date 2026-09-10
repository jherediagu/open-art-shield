# Changesets

Every user-facing change to a published package ships with a changeset:

```bash
pnpm changeset
```

Pick the packages, the bump (all five packages are versioned in lockstep), and
write one line for the changelog. The release workflow opens a "Version
Packages" pull request from the pending changesets; merging it publishes to npm
and tags the release.
