<!--
  Checklist template for pr-dependency-checklist.yml. Lives in the org workflows repo
  (`{repository_owner}/workflows`); the reusable workflow checks out that repo for this file.
-->
<!-- fyle:dependency-checklist -->
## Dependency / pnpm review checklist

<!-- fyle:dependency-checklist:packages-deps -->
### Dependencies / lockfile (`package.json` or `pnpm-lock.yaml`)
- [ ] This change is either a new dependency, an upgrade, or a removal, and the reason is clear (Required) <!-- required:dependency-change -->
- [ ] If this is a new dependency, it is necessary and was checked to ensure it does not have any known vulnerabilities
- [ ] If this is an upgrade, the upgraded version was checked to ensure it does not have any known vulnerabilities
- [ ] If this is an upgrade, breaking changes were reviewed, especially for major version bumps
- [ ] Dependency security scan for this change has passed, or any reported issues are explicitly documented and approved (Required) <!-- required:dependency-change -->
<!-- /fyle:dependency-checklist:packages-deps -->

<!-- fyle:dependency-checklist:packages-manifest -->
### Scripts, engines, version, or package manager (`package.json`)
- [ ] Changes to scripts, `engines`, `packageManager`, or package `version` were reviewed for CI impact, unsafe commands, runtime behavior, and release impact (Required) <!-- required:manifest-config-change -->
<!-- /fyle:dependency-checklist:packages-manifest -->

<!-- fyle:dependency-checklist:packages-other -->
### Other `package.json` edits
- [ ] Other `package.json` field updates not related to dependencies, scripts, engines, packageManager, or version were reviewed for correctness and impact (Required) <!-- required:other-manifest-change -->
<!-- /fyle:dependency-checklist:packages-other -->

<!-- fyle:dependency-checklist:workspace -->
### If `pnpm-workspace.yaml` changed
- [ ] Any newly added entry in `allowBuilds` was reviewed and is safe (Required) <!-- required:workspace -->
- [ ] Any newly introduced pnpm setting or policy was reviewed and does not weaken security (https://pnpm.io/settings) (Required) <!-- required:workspace -->
<!-- /fyle:dependency-checklist:workspace -->
<!-- /fyle:dependency-checklist -->
