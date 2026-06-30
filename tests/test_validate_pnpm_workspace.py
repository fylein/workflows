import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "scripts" / "validate_pnpm_workspace.py"
FIXTURES_DIR = ROOT / "tests" / "fixtures"

spec = importlib.util.spec_from_file_location("validate_pnpm_workspace", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
assert spec is not None
assert spec.loader is not None
spec.loader.exec_module(module)


class ValidatePnpmWorkspaceTests(unittest.TestCase):
    def base_config(self) -> dict:
        return {
            "minimumReleaseAge": 1440,
            "verifyDepsBeforeRun": "error",
            "trustPolicy": "no-downgrade",
            "blockExoticSubdeps": True,
            "strictDepBuilds": True,
            "allowBuilds": [],
        }

    def test_accepts_valid_minimum_release_age_exclude_entries(self) -> None:
        data = self.base_config()
        data["minimumReleaseAgeExclude"] = ["@fylein/*", "@fylein/app-v2"]

        errors = module.validate_workspace_data(data)

        self.assertEqual(errors, [])

    def test_rejects_non_list_minimum_release_age_exclude(self) -> None:
        data = self.base_config()
        data["minimumReleaseAgeExclude"] = "@fylein/*"

        errors = module.validate_workspace_data(data)

        self.assertTrue(any("minimumReleaseAgeExclude must be a YAML sequence" in e for e in errors))

    def test_rejects_invalid_minimum_release_age_exclude_values(self) -> None:
        data = self.base_config()
        data["minimumReleaseAgeExclude"] = [
            "@fylein/",
            "@other/package",
            "@fylein",  # missing slash
            123,
        ]

        errors = module.validate_workspace_data(data)

        invalid_item_errors = [e for e in errors if "invalid item at index" in e]
        self.assertEqual(len(invalid_item_errors), 4)

    def test_rejects_too_low_minimum_release_age(self) -> None:
        data = self.base_config()
        data["minimumReleaseAge"] = 120

        errors = module.validate_workspace_data(data)

        self.assertTrue(any("minimumReleaseAge must be at least" in e for e in errors))

    def test_reports_missing_required_keys(self) -> None:
        data = {}

        errors = module.validate_workspace_data(data)

        self.assertEqual(len(errors), len(module.REQUIRED_TOP_LEVEL_KEYS))

    def test_validate_workspace_file_accepts_valid_fixture(self) -> None:
        errors = module.validate_workspace_file(
            str(FIXTURES_DIR / "pnpm-workspace.valid.yaml")
        )

        self.assertEqual(errors, [])

    def test_validate_workspace_file_rejects_invalid_exclude_fixture(self) -> None:
        errors = module.validate_workspace_file(
            str(FIXTURES_DIR / "pnpm-workspace.invalid-exclude.yaml")
        )

        self.assertTrue(any("minimumReleaseAgeExclude entries must be" in e for e in errors))

    def test_validate_workspace_file_rejects_invalid_yaml_fixture(self) -> None:
        errors = module.validate_workspace_file(
            str(FIXTURES_DIR / "pnpm-workspace.invalid-yaml.yaml")
        )

        self.assertTrue(any("is not valid YAML" in e for e in errors))


if __name__ == "__main__":
    unittest.main()
