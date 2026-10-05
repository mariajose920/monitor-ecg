import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import security from 'eslint-plugin-security'
import globals from 'globals'

// SEC-53: reglas de codificación segura (sin v-html, eval, new Function, innerHTML...).
// SEC-24: prohibido localStorage.setItem fuera de los módulos autorizados.
const prohibicionesHtml = [
  {
    selector: "AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]",
    message: 'Prohibido asignar innerHTML/outerHTML (SEC-53). Usa interpolación {{ }} o textContent.',
  },
  {
    selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
    message: 'Prohibido insertAdjacentHTML (SEC-53).',
  },
  {
    selector: "CallExpression[callee.object.name='document'][callee.property.name=/^write(ln)?$/]",
    message: 'Prohibido document.write (SEC-53).',
  },
]

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  security.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'vue/no-v-html': 'error',
      'vue/multi-word-component-names': 'off',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-console': 'error',
      'no-restricted-syntax': ['error', ...prohibicionesHtml],
      'no-restricted-properties': [
        'error',
        {
          object: 'localStorage',
          property: 'setItem',
          message: 'Usa secureStorage para datos Confidenciales o superiores (SEC-24).',
        },
      ],
      // Demasiados falsos positivos con índices numéricos en arrays tipados.
      'security/detect-object-injection': 'off',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
    },
  },
  {
    // Módulos autorizados a usar localStorage (credencial hasheada, bloqueo y preferencias de UI no sensibles).
    files: ['src/services/security/adminAuth.js', 'src/utils/prefs.js'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.mjs', '*.config.js'],
    languageOptions: { globals: { ...globals.node } },
    rules: { 'no-console': 'off', 'security/detect-non-literal-fs-filename': 'off' },
  },
]
