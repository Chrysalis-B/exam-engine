module.exports = {
  parserOptions: {
    project: '../tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'lodash',
            message: "Please use import * as _ from 'lodash-es' in the core module for better tree shaking.",
          },
          {
            name: 'react-i18next',
            importNames: ['useTranslation', 'Translation'],
            message: 'Please use the `useExamTranslation` wrapper instead.',
          },
        ],
      },
    ],
  },
}
