import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  analyzeModelFiles,
  compareKeySets,
} from "../scripts/check-generated-type-overlap.mjs";

const writeTsconfig = (directory) => {
  const tsconfigPath = join(directory, "tsconfig.json");
  writeFileSync(
    tsconfigPath,
    `${JSON.stringify({ compilerOptions: { moduleResolution: "bundler", module: "es2020", strict: true } })}\n`,
  );
  return tsconfigPath;
};

test("calculates local-key coverage and diagnostic key lists", () => {
  const comparison = compareKeySets(
    ["id", "name", "state", "label"],
    ["id", "name", "state", "created_at"],
  );

  assert.equal(comparison.coverage, 75);
  assert.deepEqual(comparison.matchedKeys, ["id", "name", "state"]);
  assert.deepEqual(comparison.missingLocalKeys, ["label"]);
  assert.deepEqual(comparison.extraGeneratedKeys, ["created_at"]);
});

test("does not report overlap for an empty local key set", () => {
  assert.equal(compareKeySets([], ["id"]).coverage, 0);
});

test("finds and flags the closest generated model", () => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "generated-type-overlap-"),
  );
  const generatedDirectory = join(temporaryDirectory, "admin");
  const modelPath = join(temporaryDirectory, "legacy-expense-field.model.ts");
  mkdirSync(generatedDirectory, { recursive: true });
  const expenseFieldShape = `{
      id: number;
      org_id: string;
      created_at: string;
      updated_at: string;
      seq: number;
      field_name: string;
      column_name: string;
      type: string;
      options: string[];
      default_value: string | null;
      placeholder: string | null;
      category_ids: number[];
      is_enabled: boolean;
      is_custom: boolean;
      is_mandatory: boolean;
    }`;
  writeFileSync(
    join(generatedDirectory, "types.gen.d.ts"),
    `export type ExpenseFieldOut = ${expenseFieldShape};\n`,
  );
  writeFileSync(
    modelPath,
    `export type LegacyExpenseField = ${expenseFieldShape};\n`,
  );

  try {
    const report = analyzeModelFiles({
      files: [modelPath],
      minimumKeys: 3,
      threshold: 80,
      typesDirectory: temporaryDirectory,
      tsconfigPath: writeTsconfig(temporaryDirectory),
    });

    assert.equal(report.requiresReview, true);
    assert.equal(report.results[0].closest.name, "ExpenseFieldOut");
    assert.equal(report.results[0].closest.coverage, 100);
    assert.equal(report.results[0].closest.structuralCoverage, 100);
  } finally {
    rmSync(temporaryDirectory, { recursive: true });
  }
});

test("does not treat matching parent keys as matching nested objects or array elements", () => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "generated-type-overlap-nested-"),
  );
  const generatedDirectory = join(temporaryDirectory, "admin");
  const modelPath = join(temporaryDirectory, "nested-local.model.ts");
  const generatedPath = join(generatedDirectory, "types.gen.d.ts");

  mkdirSync(generatedDirectory, { recursive: true });
  writeFileSync(
    generatedPath,
    `export type NestedGenerated = {
      employee: { id: string; name: string };
      files: Array<{ id: string; url: string }>;
    };\n`,
  );
  writeFileSync(
    modelPath,
    `export type NestedLocal = {
      employee: { email: string; active: boolean };
      files: Array<{ size: number; state: string }>;
    };

    export type UnrelatedLocal = {
      benchmark_panel_heading: string;
      benchmark_panel_is_expanded: boolean;
      benchmark_panel_sort_index: number;
    };\n`,
  );

  try {
    const report = analyzeModelFiles({
      files: [modelPath],
      minimumKeys: 2,
      threshold: 80,
      typesDirectory: temporaryDirectory,
      tsconfigPath: writeTsconfig(temporaryDirectory),
    });

    const nestedResult = report.results.find(
      (result) => result.exportName === "NestedLocal",
    );
    const unrelatedResult = report.results.find(
      (result) => result.exportName === "UnrelatedLocal",
    );

    assert.equal(report.results.length, 2);
    assert.equal(nestedResult.closest.name, "NestedGenerated");
    assert.equal(nestedResult.closest.coverage, 100);
    assert.ok(nestedResult.closest.structuralCoverage < 80);
    assert.equal(nestedResult.requiresReview, false);
    assert.equal(unrelatedResult.closest, null);
  } finally {
    rmSync(temporaryDirectory, { recursive: true });
  }
});

test("only exempts top-level generated intersections, not nested generated properties", () => {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), "generated-type-overlap-derived-"),
  );
  const generatedDirectory = join(temporaryDirectory, "admin");
  const packageDirectory = join(
    temporaryDirectory,
    "node_modules/@fylein/types",
  );
  const modelPath = join(temporaryDirectory, "generated-usage.model.ts");
  mkdirSync(generatedDirectory, { recursive: true });
  mkdirSync(packageDirectory, { recursive: true });
  const generatedType = `export type ExpenseFieldOut = {
      id: string;
      name: string;
      state: string;
    };\n`;
  writeFileSync(join(generatedDirectory, "types.gen.d.ts"), generatedType);
  writeFileSync(join(packageDirectory, "cross-role.d.ts"), generatedType);
  writeFileSync(
    join(packageDirectory, "package.json"),
    `${JSON.stringify({ exports: { "./cross-role": "./cross-role.d.ts" } })}\n`,
  );
  writeFileSync(
    modelPath,
    `import { ExpenseFieldOut } from '@fylein/types/cross-role';

    type Wrapper<T> = Readonly<T>;

    export type UIExpenseFieldExtension = Wrapper<ExpenseFieldOut> & { label: string };

    export type ExpenseFieldContainer = {
      expenseField: ExpenseFieldOut;
      label: string;
      selected: boolean;
    };\n`,
  );

  try {
    const report = analyzeModelFiles({
      files: [modelPath],
      minimumKeys: 3,
      threshold: 80,
      typesDirectory: temporaryDirectory,
      tsconfigPath: writeTsconfig(temporaryDirectory),
    });
    const extension = report.results.find(
      (result) => result.exportName === "UIExpenseFieldExtension",
    );
    const container = report.results.find(
      (result) => result.exportName === "ExpenseFieldContainer",
    );

    assert.equal(extension.generatedDerived, true);
    assert.equal(container.generatedDerived, false);
  } finally {
    rmSync(temporaryDirectory, { recursive: true });
  }
});
