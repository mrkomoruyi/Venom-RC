module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2022: true, jest: true, node: true },
  ignorePatterns: ['node_modules/', '.expo/', 'android/', 'ios/'],
  rules: {
    // Native event payloads vary by platform and are narrowed at use sites.
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
