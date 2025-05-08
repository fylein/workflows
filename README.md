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

### Edge Cases and Troubleshooting

1. **False Positives**: JSCPD may flag code that appears similar but serves different purposes. In such cases:
   - Document why the duplication is necessary in your PR description.
   - Consider adding comments in the code explaining why similar patterns exist.
   - Request reviewer approval with detailed justification.

2. **Third-Party Code**: If your project includes third-party libraries that contain duplication:
   - Exclude vendor directories from the scan.
   - Document these exclusions in your project documentation.
   - Consider using package managers instead of including third-party code directly.

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

## Configuration

Both workflows are designed to be called from other workflows with specific inputs. Refer to the workflow YAML files for detailed configuration options.