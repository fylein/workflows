import pathlib
import os
import shutil
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPT_PATH = ROOT / "scripts" / "validate_pnpm_workspace.py"
FIXTURES_DIR = ROOT / "tests" / "fixtures"


class ValidatePnpmWorkspaceE2ETests(unittest.TestCase):
    def run_validator_with_fixture(self, fixture_name: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as tmp_dir:
            workspace_dir = pathlib.Path(tmp_dir)
            shutil.copyfile(
                FIXTURES_DIR / fixture_name,
                workspace_dir / "pnpm-workspace.yaml",
            )
            return subprocess.run(
                ["python3", str(SCRIPT_PATH)],
                cwd=ROOT,
                env={**os.environ, "GITHUB_WORKSPACE": str(workspace_dir)},
                text=True,
                capture_output=True,
                check=False,
            )

    def test_cli_passes_for_valid_fixture(self) -> None:
        result = self.run_validator_with_fixture("pnpm-workspace.valid.yaml")

        self.assertEqual(result.returncode, 0)
        self.assertIn("policy validation passed", result.stdout)

    def test_cli_fails_for_invalid_exclude_fixture(self) -> None:
        result = self.run_validator_with_fixture("pnpm-workspace.invalid-exclude.yaml")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("minimumReleaseAgeExclude", result.stdout)

    def test_cli_fails_for_invalid_yaml_fixture(self) -> None:
        result = self.run_validator_with_fixture("pnpm-workspace.invalid-yaml.yaml")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not valid YAML", result.stdout)


if __name__ == "__main__":
    unittest.main()
