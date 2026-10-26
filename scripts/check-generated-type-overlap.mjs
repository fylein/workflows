import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = process.cwd();
const requireFromRepository = createRequire(
  join(repositoryRoot, "package.json"),
);
const ts = requireFromRepository("typescript");
const defaultTypesDirectory = join(
  repositoryRoot,
  "node_modules/@fylein/types/dist",
);

const parseArguments = (argv) => {
  const options = {
    base: "master",
    head: "HEAD",
    files: [],
    threshold: 80,
    minimumKeys: 3,
    typesDirectory: defaultTypesDirectory,
    tsconfigPath: join(repositoryRoot, "tsconfig.json"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    const [name, inlineValue] = argument.slice(2).split("=", 2);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${name}`);
    }

    switch (name) {
      case "base":
        options.base = value;
        break;
      case "head":
        options.head = value;
        break;
      case "files":
        options.files.push(...value.split(",").filter(Boolean));
        break;
      case "threshold":
        options.threshold = Number(value);
        break;
      case "min-keys":
        options.minimumKeys = Number(value);
        break;
      case "types-directory":
        options.typesDirectory = resolve(value);
        break;
      case "tsconfig":
        options.tsconfigPath = resolve(value);
        break;
      case "json":
        options.jsonPath = resolve(value);
        break;
      case "markdown":
        options.markdownPath = resolve(value);
        break;
      default:
        throw new Error(`Unknown option: --${name}`);
    }
  }

  if (
    !Number.isFinite(options.threshold) ||
    options.threshold < 0 ||
    options.threshold > 100
  ) {
    throw new Error("--threshold must be a number between 0 and 100.");
  }
  if (!Number.isInteger(options.minimumKeys) || options.minimumKeys < 1) {
    throw new Error("--min-keys must be a positive integer.");
  }

  return options;
};

const walkGeneratedDeclarations = (directory) => {
  const declarations = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      declarations.push(...walkGeneratedDeclarations(path));
    } else if (entry.isFile() && entry.name === "types.gen.d.ts") {
      declarations.push(path);
    }
  }
  return declarations;
};

const getChangedModelFiles = ({ base, head }) => {
  const output = execFileSync(
    "git",
    [
      "diff",
      "--diff-filter=AMR",
      "--name-only",
      `${base}...${head}`,
      "--",
      "*.model.ts",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((path) => resolve(repositoryRoot, path));
};

const isExported = (declaration) =>
  declaration.modifiers?.some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  ) ?? false;

const isExportedTypeDeclaration = (declaration) =>
  ts.isTypeAliasDeclaration(declaration) && isExported(declaration);

const getGeneratedImports = (sourceFile) => {
  const importedNames = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    if (!statement.moduleSpecifier.text.startsWith("@fylein/types")) {
      continue;
    }

    const importClause = statement.importClause;
    if (importClause?.name) {
      importedNames.add(importClause.name.text);
    }
    const bindings = importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        importedNames.add(element.name.text);
      }
    } else if (bindings && ts.isNamespaceImport(bindings)) {
      importedNames.add(bindings.name.text);
    }
  }
  return importedNames;
};

const getTypeReferenceRootName = (typeName) => {
  let current = typeName;
  while (ts.isQualifiedName(current)) {
    current = current.left;
  }
  return ts.isIdentifier(current) ? current.text : null;
};

const referencesGeneratedTypeThroughWrappers = (node, generatedImports) => {
  if (ts.isParenthesizedTypeNode(node)) {
    return referencesGeneratedTypeThroughWrappers(node.type, generatedImports);
  }
  if (!ts.isTypeReferenceNode(node)) {
    return false;
  }
  if (generatedImports.has(getTypeReferenceRootName(node.typeName))) {
    return true;
  }
  return (
    node.typeArguments?.some((typeArgument) =>
      referencesGeneratedTypeThroughWrappers(typeArgument, generatedImports),
    ) ?? false
  );
};

const isGeneratedDerived = (declaration, generatedImports) =>
  ts.isIntersectionTypeNode(declaration.type) &&
  declaration.type.types.some((type) =>
    referencesGeneratedTypeThroughWrappers(type, generatedImports),
  );

const getPropertyNames = (checker, declaration) => {
  const type = checker.getTypeAtLocation(declaration.name);
  return checker
    .getPropertiesOfType(type)
    .map((property) => property.getName())
    .filter((name) => name !== "__proto__")
    .sort();
};

const leafTypeFlags =
  ts.TypeFlags.Any |
  ts.TypeFlags.Unknown |
  ts.TypeFlags.Never |
  ts.TypeFlags.StringLike |
  ts.TypeFlags.NumberLike |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.BigIntLike |
  ts.TypeFlags.ESSymbolLike;

const getStructuralSignatures = (checker, declaration) => {
  const signatures = new Set();
  const rootType = checker.getTypeAtLocation(declaration.name);

  const visit = (type, path, ancestors, depth) => {
    if (
      type.flags & leafTypeFlags ||
      type.getSymbol()?.getName() === "Date" ||
      checker.getSignaturesOfType(type, ts.SignatureKind.Call).length > 0
    ) {
      signatures.add(`${path}:value`);
      return;
    }

    if (depth >= 10 || ancestors.has(type)) {
      signatures.add(`${path}:object`);
      return;
    }

    if (type.isUnion()) {
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(type);
      for (const member of type.types) {
        if (
          member.flags &
          (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void)
        ) {
          continue;
        }
        visit(member, path, nextAncestors, depth + 1);
      }
      return;
    }

    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      signatures.add(`${path}:array`);
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(type);
      const typeArguments = checker.getTypeArguments(type);
      for (const elementType of typeArguments) {
        visit(elementType, `${path}[]`, nextAncestors, depth + 1);
      }
      return;
    }

    const properties = checker.getPropertiesOfType(type);
    if (path) {
      signatures.add(`${path}:object`);
    }

    const nextAncestors = new Set(ancestors);
    nextAncestors.add(type);
    for (const property of properties) {
      const propertyDeclaration =
        property.valueDeclaration ?? property.declarations?.[0] ?? declaration;
      const propertyType = checker.getTypeOfSymbolAtLocation(
        property,
        propertyDeclaration,
      );
      const propertyPath = path
        ? `${path}.${property.getName()}`
        : property.getName();
      visit(propertyType, propertyPath, nextAncestors, depth + 1);
    }
  };

  visit(rootType, "", new Set(), 0);
  return [...signatures].filter(Boolean).sort();
};

export const compareKeySets = (localKeys, generatedKeys) => {
  const generatedKeySet = new Set(generatedKeys);
  const localKeySet = new Set(localKeys);
  const matchedKeys = localKeys.filter((key) => generatedKeySet.has(key));
  const missingLocalKeys = localKeys.filter((key) => !generatedKeySet.has(key));
  const extraGeneratedKeys = generatedKeys.filter(
    (key) => !localKeySet.has(key),
  );
  const coverage =
    localKeys.length === 0 ? 0 : (matchedKeys.length / localKeys.length) * 100;
  const unionSize = new Set([...localKeys, ...generatedKeys]).size;
  const jaccard = unionSize === 0 ? 0 : matchedKeys.length / unionSize;

  return {
    coverage,
    jaccard,
    matchedKeys,
    missingLocalKeys,
    extraGeneratedKeys,
  };
};

const getGeneratedCandidates = (program, checker, generatedFiles) => {
  const candidates = [];
  for (const generatedFile of generatedFiles) {
    const sourceFile = program.getSourceFile(generatedFile);
    if (!sourceFile) {
      continue;
    }
    const role = basename(dirname(generatedFile));
    for (const declaration of sourceFile.statements) {
      if (!isExportedTypeDeclaration(declaration)) {
        continue;
      }
      const keys = getPropertyNames(checker, declaration);
      if (keys.length > 0) {
        candidates.push({
          name: declaration.name.text,
          role,
          keys,
          structuralSignatures: getStructuralSignatures(checker, declaration),
        });
      }
    }
  }
  return candidates;
};

const findClosestCandidate = (
  localKeys,
  localStructuralSignatures,
  candidates,
) => {
  let closest = null;
  for (const candidate of candidates) {
    const topLevelComparison = compareKeySets(localKeys, candidate.keys);
    const structuralComparison = compareKeySets(
      localStructuralSignatures,
      candidate.structuralSignatures,
    );
    if (
      !closest ||
      structuralComparison.coverage > closest.structuralCoverage ||
      (structuralComparison.coverage === closest.structuralCoverage &&
        topLevelComparison.coverage > closest.coverage) ||
      (structuralComparison.coverage === closest.structuralCoverage &&
        topLevelComparison.coverage === closest.coverage &&
        structuralComparison.jaccard > closest.structuralJaccard) ||
      (structuralComparison.coverage === closest.structuralCoverage &&
        topLevelComparison.coverage === closest.coverage &&
        structuralComparison.jaccard === closest.structuralJaccard &&
        candidate.keys.length < closest.generatedKeyCount)
    ) {
      closest = {
        name: candidate.name,
        role: candidate.role,
        generatedKeyCount: candidate.keys.length,
        ...topLevelComparison,
        structuralCoverage: structuralComparison.coverage,
        structuralJaccard: structuralComparison.jaccard,
        matchedStructuralSignatures: structuralComparison.matchedKeys,
        missingStructuralSignatures: structuralComparison.missingLocalKeys,
      };
    }
  }
  return closest?.coverage === 0 && closest.structuralCoverage === 0
    ? null
    : closest;
};

const readCompilerOptions = (tsconfigPath) => {
  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }
  return ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(tsconfigPath),
  ).options;
};

export const analyzeModelFiles = ({
  files,
  minimumKeys,
  threshold,
  typesDirectory,
  tsconfigPath,
}) => {
  if (!existsSync(typesDirectory)) {
    throw new Error(
      `Generated types directory not found: ${typesDirectory}. Run pnpm install first.`,
    );
  }

  const modelFiles = files
    .map((file) => resolve(file))
    .filter((file) => existsSync(file) && statSync(file).isFile());
  const generatedFiles = walkGeneratedDeclarations(typesDirectory);
  const program = ts.createProgram({
    rootNames: [...modelFiles, ...generatedFiles],
    options: {
      ...readCompilerOptions(tsconfigPath),
      noEmit: true,
      skipLibCheck: true,
    },
  });
  const checker = program.getTypeChecker();
  const candidates = getGeneratedCandidates(program, checker, generatedFiles);
  const results = [];

  for (const file of modelFiles) {
    const sourceFile = program.getSourceFile(file);
    if (!sourceFile) {
      continue;
    }
    const generatedImports = getGeneratedImports(sourceFile);
    for (const declaration of sourceFile.statements) {
      if (!isExportedTypeDeclaration(declaration)) {
        continue;
      }

      const localKeys = getPropertyNames(checker, declaration);
      if (localKeys.length === 0) {
        continue;
      }
      const localStructuralSignatures = getStructuralSignatures(
        checker,
        declaration,
      );
      const generatedDerived = isGeneratedDerived(
        declaration,
        generatedImports,
      );
      const closest = findClosestCandidate(
        localKeys,
        localStructuralSignatures,
        candidates,
      );
      const requiresReview = Boolean(
        closest &&
        !generatedDerived &&
        localStructuralSignatures.length >= minimumKeys &&
        closest.structuralCoverage >= threshold,
      );
      results.push({
        file: relative(repositoryRoot, file),
        exportName: declaration.name.text,
        localKeyCount: localKeys.length,
        localStructuralSignatureCount: localStructuralSignatures.length,
        generatedDerived,
        requiresReview,
        closest,
      });
    }
  }

  return {
    requiresReview: results.some((result) => result.requiresReview),
    results,
    candidateCount: candidates.length,
  };
};

const formatPercentage = (value) => `${value.toFixed(1)}%`;

const formatConsoleReport = (report, options, durationMs) => {
  const lines = [
    `Generated type overlap check: ${report.results.length} exported object model(s), ${report.candidateCount} generated candidate(s), ${durationMs.toFixed(0)} ms`,
    `Threshold: ${options.threshold}% of local structure; minimum structural members: ${options.minimumKeys}`,
  ];
  if (report.results.length === 0) {
    lines.push("No models to check.");
    return lines.join("\n");
  }

  for (const result of report.results) {
    const closest = result.closest;
    lines.push("", `${result.file} — ${result.exportName}`);
    if (!closest) {
      lines.push("  Closest generated type available in @fylein/types: none");
      continue;
    }
    lines.push(
      `  Closest generated type available in @fylein/types: @fylein/types/${closest.role} ${closest.name}`,
      `  Matching top-level keys: ${closest.matchedKeys.length}/${result.localKeyCount} (${formatPercentage(closest.coverage)})`,
      `  Matching nested structure: ${closest.matchedStructuralSignatures.length}/${result.localStructuralSignatureCount} (${formatPercentage(closest.structuralCoverage)})`,
      `  Extends generated type: ${result.generatedDerived ? "yes" : "no"}`,
      `  Result: ${result.requiresReview ? "❌ ACTION REQUIRED - REPLACE OR REQUEST APPROVAL" : "✅ PASS - NO ACTION REQUIRED"}`,
    );
  }
  return lines.join("\n");
};

const formatMarkdownReport = (report, options, durationMs) => {
  const rows = report.results.map((result) => {
    const closest = result.closest;
    return [
      `\`${result.file}\``,
      `\`${result.exportName}\``,
      closest
        ? `\`@fylein/types/${closest.role}\` \`${closest.name}\``
        : "None",
      closest
        ? `${closest.matchedStructuralSignatures.length}/${result.localStructuralSignatureCount} fields (${formatPercentage(closest.structuralCoverage)})`
        : "—",
      result.requiresReview
        ? "❌ Action required"
        : "✅ Pass - no action required",
    ].join(" | ");
  });
  return [
    "## Generated type overlap",
    "",
    `Threshold: **${options.threshold}%**, minimum structural members: **${options.minimumKeys}**, runtime: **${durationMs.toFixed(0)} ms**.`,
    "",
    "| File | Current model/type | Closest generated type available in `@fylein/types` | Structural overlap | Result |",
    "| --- | --- | --- | --- | --- |",
    ...(rows.length > 0 ? rows : ["| — | — | — | — | No models to check |"]),
    "",
  ].join("\n");
};

const main = () => {
  const options = parseArguments(process.argv.slice(2));
  const files =
    options.files.length > 0
      ? options.files.map((file) => resolve(file))
      : getChangedModelFiles(options);
  const startedAt = performance.now();
  const report = analyzeModelFiles({
    files,
    minimumKeys: options.minimumKeys,
    threshold: options.threshold,
    typesDirectory: options.typesDirectory,
    tsconfigPath: options.tsconfigPath,
  });
  const durationMs = performance.now() - startedAt;
  const output = {
    ...report,
    durationMs,
    threshold: options.threshold,
    minimumKeys: options.minimumKeys,
    checkedFiles: files.map((file) => relative(repositoryRoot, resolve(file))),
  };

  process.stdout.write(`${formatConsoleReport(report, options, durationMs)}\n`);
  if (options.jsonPath) {
    writeFileSync(options.jsonPath, `${JSON.stringify(output, null, 2)}\n`);
  }
  const markdownReport = formatMarkdownReport(report, options, durationMs);
  if (options.markdownPath) {
    writeFileSync(options.markdownPath, markdownReport);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdownReport);
  }
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
