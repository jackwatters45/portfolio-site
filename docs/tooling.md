# Formatting and linting

## Commands

- `bun run format`: format supported files in place.
- `bun run format:check`: check formatting without writes.
- `bun run lint`: check lint rules, including type-aware rules.
- `bun run lint:fix`: apply safe lint fixes.
- `bun run check`: apply safe lint fixes, then format.
- `bun run typecheck`: run TypeScript and Astro checks.

The pre-commit hook fixes staged files and stages those fixes.
The pre-push hook checks the full project without writes. It does not depend on staged files.
Both hooks also run type checks. The map tests remain manual.

## Formatting settings

Oxfmt 0.70.0 replaces Biome 2.2.5. Oxlint 1.85.0 handles lint rules.
The versions are pinned to prevent unexpected changes from tool updates.

The settings preserve two-space indentation, an 80-column target, JavaScript single quotes,
JSX/CSS double quotes, semicolons, trailing commas, and arrow parentheses.
Package field and dependency sorting is disabled.
Markdown, MDX, YAML, HTML, Vue, and Svelte formatting is excluded.
This avoids adding whole-document formatting beyond the previous Biome setup.
There are no Vue or Svelte files in this repository.
Oxfmt does not format Astro files; Oxlint checks their scripts with the previous unused-variable and import-type exceptions.

Import sorting keeps blank-line groups and places protocol imports before package imports.
Tailwind class sorting remains enabled for JavaScript/JSX. It does not sort CSS `@apply` directives.
These sorters are not identical to Biome's sorters.

The source formatting changes in this migration are:

- Two interface `extends` clauses wrap differently (`badge.tsx` and `button.tsx`).
- Two JSX class lists change order (`line-graph.tsx` and `mode-toggle.tsx`).
- `packages/portfolio/src/styles/globals.css` gets consistent spaces, double quotes, and blank lines.
  Biome 2.2.5 could not parse this file's Tailwind `@theme` syntax with the old configuration.

Four files replace Biome suppression comments with Oxlint comments.
The graph pointer handler also stops reassigning a parameter. Its calculation is unchanged.

## Rule compatibility

This is not an exact rule-for-rule replacement. Do not infer parity from similar rule names.
The table below records the mappings and gaps instead of silently using Oxlint's default preset.

The audit uses the Biome 2.2.5 recommended rules, React rules, and the project's explicit overrides.
Rule sources and default severities come from the tagged Biome source:
https://github.com/biomejs/biome/tree/%40biomejs/biome%402.2.5

Oxlint's default correctness category is disabled. The config explicitly selects the mapped rules.
Existing warning levels, disabled rules, and lint exclusions are retained where supported.
Rules with similar purposes can still differ in diagnostics, options, and fixes.

Important differences:

- Oxlint does not replace Biome's CSS, JSON, or GraphQL lint rules.
- Some JavaScript rules have no selected equivalent; the table marks each gap.
- `useSortedClasses` was informational. Oxfmt now sorts classes during formatting, rather than reporting an informational lint.
- `consistent-type-exports`, `prefer-optional-chain`, and `dot-notation` use type information.
  `oxlint-tsgolint` provides that support. Its TypeScript 7 engine requires removing `baseUrl`.
  Existing aliases are retained with explicit relative paths.
- TypeScript checks handle redeclarations in TypeScript files. Oxlint's `no-redeclare` rejects valid type/value name sharing.
- `no-use-before-define` permits hoisted functions, type references, and references across nested scopes.
  Same-scope variable use before declaration is still checked.
- `no-unused-vars` combines unused variables, imports, and parameters. Its fixes differ from Biome's separate rules.
- Hooks apply safe lint fixes only. The old hooks also applied unsafe fixes.

## Rule audit

“Not mapped” means the migration does not preserve that check through an Oxlint rule.
Some syntax errors are still rejected by the parser or TypeScript compiler.
An `off` level records an existing disabled rule, not lost enforcement.

| Biome rule | Level | Replacement |
| --- | --- | --- |
| `a11y/noAccessKey` | error | `jsx-a11y/no-access-key` |
| `a11y/noAriaHiddenOnFocusable` | error | `jsx-a11y/no-aria-hidden-on-focusable` |
| `a11y/noAriaUnsupportedElements` | error | `jsx-a11y/aria-unsupported-elements` |
| `a11y/noAutofocus` | error | `jsx-a11y/no-autofocus` |
| `a11y/noDistractingElements` | error | `jsx-a11y/no-distracting-elements` |
| `a11y/noHeaderScope` | error | `jsx-a11y/scope` |
| `a11y/noInteractiveElementToNoninteractiveRole` | error | `jsx-a11y/no-interactive-element-to-noninteractive-role` |
| `a11y/noLabelWithoutControl` | error | `jsx-a11y/label-has-associated-control` |
| `a11y/noNoninteractiveElementToInteractiveRole` | error | `jsx-a11y/no-noninteractive-element-to-interactive-role` |
| `a11y/noNoninteractiveTabindex` | error | `jsx-a11y/no-noninteractive-tabindex` |
| `a11y/noPositiveTabindex` | error | `jsx-a11y/tabindex-no-positive` |
| `a11y/noRedundantAlt` | error | `jsx-a11y/img-redundant-alt` |
| `a11y/noRedundantRoles` | error | `jsx-a11y/no-redundant-roles` |
| `a11y/noStaticElementInteractions` | error | `jsx-a11y/no-static-element-interactions` |
| `a11y/noSvgWithoutTitle` | error | **Not mapped** |
| `a11y/useAltText` | error | `jsx-a11y/alt-text` |
| `a11y/useAnchorContent` | error | `jsx-a11y/anchor-has-content` |
| `a11y/useAriaActivedescendantWithTabindex` | error | `jsx-a11y/aria-activedescendant-has-tabindex` |
| `a11y/useAriaPropsForRole` | error | `jsx-a11y/role-has-required-aria-props` |
| `a11y/useAriaPropsSupportedByRole` | error | `jsx-a11y/role-supports-aria-props` |
| `a11y/useButtonType` | error | `react/button-has-type` |
| `a11y/useFocusableInteractive` | error | `jsx-a11y/interactive-supports-focus` |
| `a11y/useGenericFontNames` | error | **Not mapped** |
| `a11y/useHeadingContent` | error | `jsx-a11y/heading-has-content` |
| `a11y/useHtmlLang` | error | `jsx-a11y/html-has-lang` |
| `a11y/useIframeTitle` | error | `jsx-a11y/iframe-has-title` |
| `a11y/useKeyWithClickEvents` | error | `jsx-a11y/click-events-have-key-events` |
| `a11y/useKeyWithMouseEvents` | error | `jsx-a11y/mouse-events-have-key-events` |
| `a11y/useMediaCaption` | error | `jsx-a11y/media-has-caption` |
| `a11y/useSemanticElements` | error | `jsx-a11y/prefer-tag-over-role` |
| `a11y/useValidAnchor` | warn | `jsx-a11y/anchor-is-valid` |
| `a11y/useValidAriaProps` | error | `jsx-a11y/aria-props` |
| `a11y/useValidAriaRole` | error | `jsx-a11y/aria-role` |
| `a11y/useValidAriaValues` | error | `jsx-a11y/aria-proptypes` |
| `a11y/useValidAutocomplete` | error | `jsx-a11y/autocomplete-valid` |
| `a11y/useValidLang` | error | `jsx-a11y/lang` |
| `complexity/noAdjacentSpacesInRegex` | warn | `eslint/no-regex-spaces` |
| `complexity/noArguments` | warn | `eslint/prefer-rest-params` |
| `complexity/noBannedTypes` | warn | `typescript/ban-types` |
| `complexity/noCommaOperator` | warn | `eslint/no-sequences` |
| `complexity/noEmptyTypeParameters` | warn | **Not mapped** |
| `complexity/noExtraBooleanCast` | warn | `eslint/no-extra-boolean-cast` |
| `complexity/noFlatMapIdentity` | warn | **Not mapped** |
| `complexity/noImportantStyles` | warn | **Not mapped** |
| `complexity/noStaticOnlyClass` | warn | `typescript/no-extraneous-class`, `unicorn/no-static-only-class` |
| `complexity/noThisInStatic` | warn | **Not mapped** |
| `complexity/noUselessCatch` | warn | `eslint/no-useless-catch` |
| `complexity/noUselessConstructor` | warn | `eslint/no-useless-constructor` |
| `complexity/noUselessContinue` | warn | **Not mapped** |
| `complexity/noUselessEmptyExport` | off | `typescript/no-useless-empty-export` |
| `complexity/noUselessEscapeInRegex` | warn | `eslint/no-useless-escape` |
| `complexity/noUselessFragments` | warn | `react/jsx-no-useless-fragment` |
| `complexity/noUselessLabel` | warn | `eslint/no-extra-label` |
| `complexity/noUselessLoneBlockStatements` | warn | `eslint/no-lone-blocks` |
| `complexity/noUselessRename` | warn | `eslint/no-useless-rename` |
| `complexity/noUselessStringRaw` | warn | **Not mapped** |
| `complexity/noUselessSwitchCase` | warn | `unicorn/no-useless-switch-case` |
| `complexity/noUselessTernary` | warn | `eslint/no-unneeded-ternary` |
| `complexity/noUselessThisAlias` | warn | `typescript/no-this-alias` |
| `complexity/noUselessTypeConstraint` | warn | `typescript/no-unnecessary-type-constraint` |
| `complexity/noUselessUndefinedInitialization` | warn | **Not mapped** |
| `complexity/useArrowFunction` | warn | `eslint/prefer-arrow-callback` |
| `complexity/useDateNow` | warn | `unicorn/prefer-date-now` |
| `complexity/useFlatMap` | warn | `unicorn/prefer-array-flat-map` |
| `complexity/useIndexOf` | warn | `unicorn/prefer-array-index-of` |
| `complexity/useLiteralKeys` | warn | `eslint/no-useless-computed-key`, `typescript/dot-notation` |
| `complexity/useNumericLiterals` | warn | `eslint/prefer-numeric-literals` |
| `complexity/useOptionalChain` | warn | `typescript/prefer-optional-chain` |
| `complexity/useRegexLiterals` | warn | `eslint/prefer-regex-literals` |
| `complexity/useSimpleNumberKeys` | warn | **Not mapped** |
| `correctness/noChildrenProp` | error | `react/no-children-prop` |
| `correctness/noConstAssign` | error | `eslint/no-const-assign` |
| `correctness/noConstantCondition` | error | `eslint/no-constant-condition` |
| `correctness/noConstantMathMinMaxClamp` | error | `oxc/bad-min-max-func` |
| `correctness/noConstructorReturn` | error | `eslint/no-constructor-return` |
| `correctness/noEmptyCharacterClassInRegex` | error | `eslint/no-empty-character-class` |
| `correctness/noEmptyPattern` | error | `eslint/no-empty-pattern` |
| `correctness/noGlobalObjectCalls` | error | `eslint/no-obj-calls` |
| `correctness/noInnerDeclarations` | error | `eslint/no-inner-declarations` |
| `correctness/noInvalidBuiltinInstantiation` | error | `unicorn/new-for-builtins`, `eslint/no-new-native-nonconstructor` |
| `correctness/noInvalidConstructorSuper` | error | `eslint/constructor-super` |
| `correctness/noInvalidDirectionInLinearGradient` | error | **Not mapped** |
| `correctness/noInvalidGridAreas` | error | **Not mapped** |
| `correctness/noInvalidPositionAtImportRule` | error | **Not mapped** |
| `correctness/noInvalidUseBeforeDeclaration` | error | `eslint/no-use-before-define` |
| `correctness/noMissingVarFunction` | error | **Not mapped** |
| `correctness/noNonoctalDecimalEscape` | error | `eslint/no-nonoctal-decimal-escape` |
| `correctness/noPrecisionLoss` | error | `eslint/no-loss-of-precision` |
| `correctness/noRenderReturnValue` | error | **Not mapped** |
| `correctness/noSelfAssign` | error | `eslint/no-self-assign` |
| `correctness/noSetterReturn` | error | `eslint/no-setter-return` |
| `correctness/noStringCaseMismatch` | error | **Not mapped** |
| `correctness/noSwitchDeclarations` | error | `eslint/no-case-declarations` |
| `correctness/noUnknownFunction` | error | **Not mapped** |
| `correctness/noUnknownMediaFeatureName` | error | **Not mapped** |
| `correctness/noUnknownProperty` | error | **Not mapped** |
| `correctness/noUnknownPseudoClass` | error | **Not mapped** |
| `correctness/noUnknownPseudoElement` | error | **Not mapped** |
| `correctness/noUnknownTypeSelector` | error | **Not mapped** |
| `correctness/noUnknownUnit` | error | **Not mapped** |
| `correctness/noUnmatchableAnbSelector` | error | **Not mapped** |
| `correctness/noUnreachable` | error | `eslint/no-unreachable` |
| `correctness/noUnreachableSuper` | error | `eslint/no-this-before-super` |
| `correctness/noUnsafeFinally` | error | `eslint/no-unsafe-finally` |
| `correctness/noUnsafeOptionalChaining` | error | `eslint/no-unsafe-optional-chaining` |
| `correctness/noUnusedFunctionParameters` | warn | `eslint/no-unused-vars` |
| `correctness/noUnusedImports` | warn | `eslint/no-unused-vars` |
| `correctness/noUnusedLabels` | warn | `eslint/no-unused-labels` |
| `correctness/noUnusedPrivateClassMembers` | warn | `eslint/no-unused-private-class-members` |
| `correctness/noUnusedVariables` | warn | `eslint/no-unused-vars` |
| `correctness/noVoidElementsWithChildren` | error | `react/void-dom-elements-no-children` |
| `correctness/noVoidTypeReturn` | error | **Not mapped** |
| `correctness/useExhaustiveDependencies` | error | `react/exhaustive-deps` |
| `correctness/useGraphqlNamedOperations` | error | **Not mapped** |
| `correctness/useHookAtTopLevel` | error | `react/rules-of-hooks` |
| `correctness/useIsNan` | error | `eslint/use-isnan` |
| `correctness/useJsxKeyInIterable` | error | `react/jsx-key` |
| `correctness/useParseIntRadix` | warn | `eslint/radix` |
| `correctness/useValidForDirection` | error | `eslint/for-direction` |
| `correctness/useValidTypeof` | error | `eslint/valid-typeof` |
| `correctness/useYield` | off | `eslint/require-yield` |
| `nursery/useSortedClasses` | info | Oxfmt `sortTailwindcss` (formatter, not lint) |
| `performance/noAccumulatingSpread` | warn | `oxc/no-accumulating-spread` |
| `performance/noDynamicNamespaceImportAccess` | warn | **Not mapped** |
| `security/noBlankTarget` | error | `react/jsx-no-target-blank` |
| `security/noDangerouslySetInnerHtml` | error | `react/no-danger` |
| `security/noDangerouslySetInnerHtmlWithChildren` | error | `react/no-danger-with-children` |
| `security/noGlobalEval` | error | `eslint/no-eval` |
| `style/noDescendingSpecificity` | warn | **Not mapped** |
| `style/noInferrableTypes` | error | `typescript/no-inferrable-types` |
| `style/noNonNullAssertion` | off | `typescript/no-non-null-assertion` |
| `style/noParameterAssign` | error | `eslint/no-param-reassign` |
| `style/noUnusedTemplateLiteral` | error | **Not mapped** |
| `style/noUselessElse` | error | `eslint/no-else-return` |
| `style/useArrayLiterals` | warn | `eslint/no-array-constructor` |
| `style/useAsConstAssertion` | error | `typescript/prefer-as-const` |
| `style/useConst` | warn | `eslint/prefer-const` |
| `style/useDefaultParameterLast` | error | `eslint/default-param-last` |
| `style/useDeprecatedReason` | warn | **Not mapped** |
| `style/useEnumInitializers` | error | `typescript/prefer-enum-initializers` |
| `style/useExponentiationOperator` | warn | `eslint/prefer-exponentiation-operator` |
| `style/useExportType` | error | `typescript/consistent-type-exports` |
| `style/useImportType` | error | `typescript/consistent-type-imports` |
| `style/useLiteralEnumMembers` | warn | `typescript/prefer-literal-enum-member` |
| `style/useNodejsImportProtocol` | warn | `unicorn/prefer-node-protocol` |
| `style/useNumberNamespace` | error | `unicorn/prefer-number-properties` |
| `style/useSelfClosingElements` | error | `react/self-closing-comp` |
| `style/useShorthandFunctionType` | warn | `typescript/prefer-function-type` |
| `style/useSingleVarDeclarator` | error | `eslint/one-var` |
| `style/useTemplate` | warn | `eslint/prefer-template` |
| `suspicious/foo` | warn | `unicorn/no-document-cookie` |
| `suspicious/noApproximativeNumericConstant` | warn | `oxc/approx-constant` |
| `suspicious/noArrayIndexKey` | warn | `react/no-array-index-key` |
| `suspicious/noAssignInExpressions` | error | `eslint/no-cond-assign` |
| `suspicious/noAsyncPromiseExecutor` | error | `eslint/no-async-promise-executor` |
| `suspicious/noBiomeFirstException` | error | **Not mapped** |
| `suspicious/noCatchAssign` | warn | `eslint/no-ex-assign` |
| `suspicious/noClassAssign` | error | `eslint/no-class-assign` |
| `suspicious/noCommentText` | error | `react/jsx-no-comment-textnodes` |
| `suspicious/noCompareNegZero` | error | `eslint/no-compare-neg-zero` |
| `suspicious/noConfusingLabels` | warn | `eslint/no-labels` |
| `suspicious/noConfusingVoidType` | warn | `typescript/no-invalid-void-type` |
| `suspicious/noConstEnum` | warn | `oxc/no-const-enum` |
| `suspicious/noControlCharactersInRegex` | error | `eslint/no-control-regex` |
| `suspicious/noDebugger` | error | `eslint/no-debugger` |
| `suspicious/noDocumentCookie` | error | `unicorn/no-document-cookie` |
| `suspicious/noDoubleEquals` | error | `eslint/eqeqeq` |
| `suspicious/noDuplicateAtImportRules` | error | **Not mapped** |
| `suspicious/noDuplicateCase` | error | `eslint/no-duplicate-case` |
| `suspicious/noDuplicateClassMembers` | error | `eslint/no-dupe-class-members` |
| `suspicious/noDuplicateCustomProperties` | error | **Not mapped** |
| `suspicious/noDuplicateElseIf` | error | `eslint/no-dupe-else-if` |
| `suspicious/noDuplicateFields` | warn | **Not mapped** |
| `suspicious/noDuplicateFontNames` | error | **Not mapped** |
| `suspicious/noDuplicateJsxProps` | error | `react/jsx-no-duplicate-props` |
| `suspicious/noDuplicateObjectKeys` | error | `eslint/no-dupe-keys` |
| `suspicious/noDuplicateParameters` | error | **Not mapped** |
| `suspicious/noDuplicateProperties` | error | **Not mapped** |
| `suspicious/noDuplicateSelectorsKeyframeBlock` | error | **Not mapped** |
| `suspicious/noEmptyBlock` | warn | **Not mapped** |
| `suspicious/noEmptyInterface` | error | `typescript/no-empty-interface` |
| `suspicious/noExplicitAny` | warn | `typescript/no-explicit-any` |
| `suspicious/noExtraNonNullAssertion` | warn | `typescript/no-extra-non-null-assertion` |
| `suspicious/noFallthroughSwitchClause` | error | `eslint/no-fallthrough` |
| `suspicious/noFunctionAssign` | error | `eslint/no-func-assign` |
| `suspicious/noGlobalAssign` | error | `eslint/no-global-assign` |
| `suspicious/noGlobalIsFinite` | warn | `unicorn/prefer-number-properties` |
| `suspicious/noGlobalIsNan` | warn | `unicorn/prefer-number-properties` |
| `suspicious/noImplicitAnyLet` | error | **Not mapped** |
| `suspicious/noImportAssign` | error | `eslint/no-import-assign` |
| `suspicious/noImportantInKeyframe` | error | **Not mapped** |
| `suspicious/noIrregularWhitespace` | warn | `eslint/no-irregular-whitespace` |
| `suspicious/noLabelVar` | error | `eslint/no-label-var` |
| `suspicious/noMisleadingCharacterClass` | error | `eslint/no-misleading-character-class` |
| `suspicious/noMisleadingInstantiator` | error | `typescript/no-misused-new` |
| `suspicious/noMisrefactoredShorthandAssign` | error | `oxc/misrefactored-assign-op` |
| `suspicious/noOctalEscape` | warn | **Not mapped** |
| `suspicious/noPrototypeBuiltins` | warn | `eslint/no-prototype-builtins`, `eslint/prefer-object-has-own` |
| `suspicious/noQuickfixBiome` | warn | **Not mapped** |
| `suspicious/noRedeclare` | error | `eslint/no-redeclare` |
| `suspicious/noRedundantUseStrict` | warn | **Not mapped** |
| `suspicious/noSelfCompare` | error | `eslint/no-self-compare` |
| `suspicious/noShadowRestrictedNames` | error | `eslint/no-shadow-restricted-names` |
| `suspicious/noShorthandPropertyOverrides` | error | **Not mapped** |
| `suspicious/noSparseArray` | error | `eslint/no-sparse-arrays` |
| `suspicious/noSuspiciousSemicolonInJsx` | warn | **Not mapped** |
| `suspicious/noTemplateCurlyInString` | warn | `eslint/no-template-curly-in-string` |
| `suspicious/noThenProperty` | error | `unicorn/no-thenable` |
| `suspicious/noTsIgnore` | warn | `typescript/ban-ts-comment` |
| `suspicious/noUnknownAtRules` | error | **Not mapped** |
| `suspicious/noUnsafeDeclarationMerging` | error | `typescript/no-unsafe-declaration-merging` |
| `suspicious/noUnsafeNegation` | error | `eslint/no-unsafe-negation` |
| `suspicious/noUselessEscapeInString` | warn | `eslint/no-useless-escape` |
| `suspicious/noUselessRegexBackrefs` | warn | `eslint/no-useless-backreference` |
| `suspicious/noWith` | error | `eslint/no-with` |
| `suspicious/useAdjacentOverloadSignatures` | warn | `typescript/adjacent-overload-signatures` |
| `suspicious/useBiomeIgnoreFolder` | warn | **Not mapped** |
| `suspicious/useDefaultSwitchClauseLast` | warn | `eslint/default-case-last` |
| `suspicious/useGetterReturn` | error | `eslint/getter-return` |
| `suspicious/useGoogleFontDisplay` | warn | `nextjs/google-font-display` |
| `suspicious/useIsArray` | warn | `unicorn/no-instanceof-array` |
| `suspicious/useIterableCallbackReturn` | error | `eslint/array-callback-return` |
| `suspicious/useNamespaceKeyword` | error | `typescript/prefer-namespace-keyword` |
