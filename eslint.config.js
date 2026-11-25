import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        FileReader: 'readonly',
        AudioContext: 'readonly',
        webkitAudioContext: 'readonly',
        firebase: 'readonly',
        confetti: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        CustomEvent: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        sessionStorage: 'readonly',
        Blob: 'readonly',
        URL: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'log'] }],
      'no-empty': ['warn', { allowEmptyCatch: true }]
    }
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'playwright-report/**']
  }
];
