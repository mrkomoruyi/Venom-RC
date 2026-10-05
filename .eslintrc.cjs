module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { es2022: true, jest: true, node: true },
  ignorePatterns: ['node_modules/', '.expo/', 'android/', 'ios/'],
  rules: {},
};
