// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // `import/namespace` re-parses every imported TypeScript file with a
    // parser it resolves from the project root. The parser that ships with
    // eslint-config-expo is nested inside that package, so the rule could not
    // find it and reported "Parse errors in imported module" for every import
    // in the project - hundreds of failures that have nothing to do with the
    // code under lint.
    rules: {
      'import/namespace': 'off',
    },
  },
]);
