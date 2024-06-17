module.exports = {
  root: true,
  ignorePatterns: ['**/dist/js/*.js', '**/node_modules/*.js'],
  parserOptions: {
    requireConfigFile: false,
  },
  extends: 'eslint-config-airbnb/base',
  rules: {
    indent: ['error', 2],
  },
  env: {
    browser: true,
    jquery: true,
  },
};
