# GitHub Actions for Code Quality

This README provides detailed information about two GitHub Actions workflows used for code quality checks: JSCPD Duplication Check and EOL/Outdated JS Scan.

## JSCPD Duplication Check

### What It Does

[JSCPD](https://github.com/kucherenko/jscpd) (JavaScript Copy/Paste Detector) Duplication Check workflow identifies code duplication in your codebase. It analyzes your source files to find repeated code patterns and reports the percentage of duplicated code.

Key features:
- Analyzes code across multiple file formats.
- Calculates duplication percentage based on tokens and lines.
- Provides detailed reports on duplicated code.
- Enforces a configurable duplication threshold.

### Why It's Needed

Code duplication is a common issue that can lead to:
- Maintenance challenges (fixing bugs in multiple places).
- Increased codebase size.
- Difficulty in understanding the codebase.
- Higher risk of inconsistencies when changes are made.

By detecting and limiting code duplication, this workflow helps maintain a cleaner, more maintainable codebase.

### How to Use in your repository

Add the following to your workflow file:

```yaml
jobs:
  call-jscpd-duplication-check:
    uses: fylein/workflows/.github/workflows/jscpd-duplication-check.yml@v1
    secrets:
      github-token: ${{ secrets.GITHUB_TOKEN }}
    with:
      duplication_threshold: 10
      reviewer_1: 'Dimple16'
      reviewer_2: 'rvab'
      tech_stack: 'AngularJS'
      command_to_run: 'npx jscpd --ignore "**/node_modules/**" --output report --reporters json'
```

**Inputs** - Inputs are passed to the workflow with the `with` keyword. 
- `duplication_threshold` (number): The duplication threshold percentage above which the workflow will fail.
- `reviewer_1` (string): The first reviewer's GitHub username.
- `reviewer_2` (string): The second reviewer's GitHub username.
- `tech_stack` (string): The tech stack name (e.g., AngularJS, Angular, etc.)
- `command_to_run` (string): The command to run the JSCPD duplication check.

**Secrets** - Secrets are passed to the workflow with the `secrets` keyword.
- `github-token`: A GitHub token to create or update PR comments with scan results. Typically passed as: secrets.GITHUB_TOKEN.

### What To Do If It Fails

If the JSCPD workflow fails, it means your code has exceeded the configured duplication threshold. You should:

1. Review the duplication report in the PR comments to identify duplicated code sections. Alternatively, you can run the command mentioned in the workflow [inputs](https://github.com/fylein/fyle-app/blob/master/.github/workflows/jscpd-duplication-check.yml) to check the duplicated files in your local system.

2. Refactor the duplicated code by:
    - Creating reusable functions or components.
    - Implementing design patterns to reduce duplication.
    - Extracting common logic into shared utilities.

3. If the duplication is unavoidable or intentional:
    - Get approval from one of the designated reviewers (specified in the workflow inputs).
    - Once approved, re-run the workflow - it will pass if approved by an authorized reviewer.

### Reviewer's Guide

If you are assigned as a reviewer on a pull request where the JSCPD duplication check fails, your responsibility is to ensure duplication is either justified or resolved. Follow this checklist to maintain technical integrity:

1. Request Technical Justification from the Author. Ask the author to explain why the duplication threshold was breached. Ensure the PR description includes:

    - Rationale for the duplication (e.g., performance optimization, unavoidable framework constraints).
    - Why existing abstractions (shared utilities/components) were not used.

2. Evaluate the duplication. Perform a code-level review of the duplicated sections:

    - Can the code be abstracted into a shared module, function, service, or component?
    - Would refactoring reduce duplication without hurting clarity or introducing performance issues?
    - Are there framework-specific patterns (e.g., Angular decorators, lifecycle hooks) that cause unavoidable duplication?
    - Are these duplicated blocks used in different scopes or modules that make unification non-trivial?

3. Request changes if the duplication is avoidable. The idea is to not increase the duplication threshold wherever possible.

### Edge Cases and Troubleshooting

1. **False Positives**: JSCPD may flag code that appears similar but serves different purposes. In such cases:
   - Document why the duplication is necessary in your PR description.
   - Consider adding comments in the code explaining why similar patterns exist.
   - Request reviewer approval with detailed justification.

2. **Third-Party Code**: If your project includes third-party libraries that contain duplication, exclude vendor directories from the scan.

## EOL/Outdated JS Scan

### What It Does

The EOL (End of Life) and Outdated JS Scan workflow checks your JavaScript dependencies for:
- Libraries that have reached end-of-life and are no longer maintained.
- Outdated JavaScript packages that may contain security vulnerabilities.
- Known vulnerabilities in your dependencies using the [dependency-check](https://github.com/dependency-check/Dependency-Check_Action).

### Why It's Needed

Using outdated or end-of-life JavaScript libraries poses significant risks:
- Security vulnerabilities that won't be patched.
- Compatibility issues with newer technologies.
- Missing out on performance improvements and bug fixes.

This workflow helps ensure your project uses maintained and secure dependencies.

### How to Use in your repository

Add the following to your workflow file:

```yaml
jobs:
  call-eol-scan:
    uses: fylein/workflows/.github/workflows/eol-outdated-js-scan.yml@v1
    name: Run scanner
    with:
      npm-run-cmd: 'npm ci && cd app-v2 && npm ci'
      suppression: 'suppression.xml'
    secrets:
      github-token: ${{ secrets.GITHUB_TOKEN }}
      nvd-api-key: ${{ secrets.NVD_API_KEY }}
```

**Inputs** - Inputs are passed to the workflow with the `with` keyword. 
- `npm-run-cmd` (string): The NPM command to install dependencies (e.g., npm ci or npm install) for example: 'npm ci'.

- `suppression` (string): Path to a suppression.xml file that lists known/accepted vulnerabilities to ignore during the scan, for example ['suppression.xml'](https://github.com/fylein/fyle-app/blob/master/suppression.xml). This is an optional input and you can skip it if you don't have a suppression file.

**Secrets** - Secrets are passed to the workflow with the `secrets` keyword.
- `github-token`: A GitHub token to create or update PR comments with scan results. Typically passed as: secrets.GITHUB_TOKEN.
- `nvd-api-key`: A key for querying the National Vulnerability Database for CVE data. Typically passed as: secrets.NVD_API_KEY.

### What To Do If It Fails

If the EOL/Outdated JS Scan fails, follow these steps:

1. Review the scan report in the PR comments to identify problematic dependencies.

2. For each flagged dependency:
    - Update to a newer, supported version if available.
    - Find an alternative library if the dependency is EOL.
    - Apply patches or workarounds for known vulnerabilities.
    - If a vulnerability cannot be addressed immediately, document it and create a plan to address it.

3. If certain vulnerabilities need to be temporarily suppressed:
    - Update the suppression.xml file (if configured) to exclude specific known issues.
    - Document why the suppression is necessary.

### Reviewer's Guide

If you are assigned as a reviewer on a pull request where the EOL/Outdated JS Scan fails, your responsibility is to ensure the dependencies are updated or the vulnerabilities are addressed. Follow this checklist:

1. If certain vulnerabilities are suppressed, ask the author to justify the suppression.

2. If the dependencies are added by the author, ask them to update the dependencies to the latest stable version or find an alternative library if the dependency is EOL.

## Configuration

Both workflows are designed to be called from other workflows with specific inputs. Refer to the workflow YAML files for detailed configuration options.