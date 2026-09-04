import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import prettier from 'eslint-config-prettier'

export default [
  { ignores: ['dist/**', 'unpackage/**', 'node_modules/**', 'backend/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  prettier,
  {
    languageOptions: {
      globals: {
        uni: 'readonly',
        UniApp: 'readonly',
        plus: 'readonly',
        getCurrentPages: 'readonly',
        wx: 'readonly',
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
          parser: tseslint.parser,
      },
    },
  },
  {
    /**
     * 类型声明补丁文件用的是 uni-app / Vue 官方 shim 写法：
     * `/// <reference path>` 和 `DefineComponent<{}, {}, any>` 都是模板原文，
     * 改写它们只会引入类型回归，这里按文件豁免而不是全局关规则。
     */
    files: ['**/*.d.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // TypeScript 与 uni-app 的声明文件负责未定义标识符检查；ESLint 的
      // no-undef 不理解这些运行时注入变量，会产生大量误报。
      'no-undef': 'off',
      'vue/multi-word-component-names': 'off',
      // 空 catch 是本项目里的有意写法：提醒、剪贴板、订阅消息这类
      // 尽力而为的调用失败时不该打断主流程，也没有可上报的额外信息。
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
]
