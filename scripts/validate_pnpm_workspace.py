#!/usr/bin/env python3
import os
import re
import sys

import yaml

REQUIRED_TOP_LEVEL_KEYS = (
    "minimumReleaseAge",
    "verifyDepsBeforeRun",
    "trustPolicy",
    "blockExoticSubdeps",
    "strictDepBuilds",
    "allowBuilds",
)
MINIMUM_RELEASE_AGE_EXCLUDE_KEY = "minimumReleaseAgeExclude"
MIN_MINIMUM_RELEASE_AGE = 1440
ALLOWED_MINIMUM_RELEASE_AGE_EXCLUDE = re.compile(
    r"^@fylein/(?:\*|[A-Za-z0-9][A-Za-z0-9._-]*)$"
)
# Unquoted no-downgrade is valid YAML (same as pnpm.io/settings#trustpolicy); it is a
# string, not coerced like plain `off` (which PyYAML parses as boolean false).
EXPECTED_TRUST_POLICY = "no-downgrade"
EXPECTED_VERIFY_DEPS_BEFORE_RUN = "error"


def validate_workspace_data(data: object) -> list[str]:
    errors: list[str] = []

    if not isinstance(data, dict):
        return ["pnpm-workspace.yaml must be a YAML mapping (object) at the top level."]

    for key in REQUIRED_TOP_LEVEL_KEYS:
        if key not in data:
            errors.append(f"pnpm-workspace.yaml: missing required top-level key '{key}'.")

    if MINIMUM_RELEASE_AGE_EXCLUDE_KEY in data:
        exclude = data[MINIMUM_RELEASE_AGE_EXCLUDE_KEY]
        if not isinstance(exclude, list):
            errors.append(
                "pnpm-workspace.yaml: minimumReleaseAgeExclude must be a YAML "
                "sequence containing only '@fylein/*' or '@fylein/<packageName>' entries."
            )
        else:
            for i, item in enumerate(exclude):
                if not isinstance(item, str) or not ALLOWED_MINIMUM_RELEASE_AGE_EXCLUDE.fullmatch(item):
                    errors.append(
                        "pnpm-workspace.yaml: minimumReleaseAgeExclude entries must be "
                        "'@fylein/*' or '@fylein/<packageName>' "
                        f"(invalid item at index {i}: {item!r})."
                    )

    if "minimumReleaseAge" in data:
        mra = data["minimumReleaseAge"]
        if mra is None or isinstance(mra, bool):
            errors.append(
                "pnpm-workspace.yaml: minimumReleaseAge must be a numeric "
                f"value (minutes) and at least {MIN_MINIMUM_RELEASE_AGE}."
            )
        else:
            try:
                n = float(mra)
            except (TypeError, ValueError):
                errors.append(
                    "pnpm-workspace.yaml: minimumReleaseAge must be a numeric "
                    f"value (minutes) and at least {MIN_MINIMUM_RELEASE_AGE}."
                )
            else:
                if n != n or n in (float("inf"), float("-inf")):
                    errors.append(
                        "pnpm-workspace.yaml: minimumReleaseAge must be a numeric "
                        f"value (minutes) and at least {MIN_MINIMUM_RELEASE_AGE}."
                    )
                elif n < MIN_MINIMUM_RELEASE_AGE:
                    errors.append(
                        "pnpm-workspace.yaml: minimumReleaseAge must be at least "
                        f"{MIN_MINIMUM_RELEASE_AGE} minutes (found {mra!r})."
                    )

    if "verifyDepsBeforeRun" in data:
        if data["verifyDepsBeforeRun"] != EXPECTED_VERIFY_DEPS_BEFORE_RUN:
            errors.append(
                "pnpm-workspace.yaml: verifyDepsBeforeRun must be "
                f"{EXPECTED_VERIFY_DEPS_BEFORE_RUN!r} "
                f"(found {data['verifyDepsBeforeRun']!r})."
            )

    if "trustPolicy" in data:
        if data["trustPolicy"] != EXPECTED_TRUST_POLICY:
            errors.append(
                "pnpm-workspace.yaml: trustPolicy must be "
                f"{EXPECTED_TRUST_POLICY!r} (found {data['trustPolicy']!r})."
            )

    for bool_key in ("blockExoticSubdeps", "strictDepBuilds"):
        if bool_key in data and data[bool_key] is not True:
            errors.append(
                f"pnpm-workspace.yaml: {bool_key} must be YAML boolean true "
                f"(found {data[bool_key]!r})."
            )

    return errors


def validate_workspace_file(workspace_path: str) -> list[str]:
    try:
        with open(workspace_path, encoding="utf-8") as f:
            parsed = yaml.safe_load(f)
    except OSError as e:
        return [f"pnpm-workspace.yaml could not be read: {e}"]
    except yaml.YAMLError as e:
        return [f"pnpm-workspace.yaml is not valid YAML: {e}"]

    data = {} if parsed is None else parsed
    return validate_workspace_data(data)


def main() -> int:
    root = os.environ.get("GITHUB_WORKSPACE", ".")
    workspace_path = os.path.join(root, "pnpm-workspace.yaml")
    errors = validate_workspace_file(workspace_path)

    for msg in errors:
        print(f"::error title=validate pnpm config::{msg}")

    if errors:
        print(f"\nValidation failed with {len(errors)} error(s).", file=sys.stderr)
        return 1

    print("pnpm-workspace.yaml policy validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
