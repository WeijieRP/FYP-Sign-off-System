// ESLint 9 flat config. Errors fail CI; warnings are reported in the job summary.
import fs from 'node:fs';
import path from 'node:path';
import globals from 'globals';

// A page that loads several classic scripts shares one global scope between them. Collect the
// top-level names of every script in the folder so `no-undef` still catches real typos.
function sharedPageGlobals(dir) {
  const names = {};
  if (!fs.existsSync(dir)) return names;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of text.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) names[m[1]] = 'writable';
    for (const m of text.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names[m[1]] = 'writable';
  }
  return names;
}

const rules = {
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-else-if': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-unsafe-negation': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'no-cond-assign': 'error',
  'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
  'eqeqeq': 'warn',
  'no-empty': 'warn',
  'no-constant-condition': 'warn',
};

// Libraries the pages load from a CDN (so they are globals in the page scripts)
const cdnGlobals = { Chart: 'readonly', faceapi: 'readonly', QRCode: 'readonly', THREE: 'readonly' };

export default [
  { ignores: ['node_modules/**', 'legacy/**', 'uploads/**', 'assets/**', 'logs/**', 'docs/**', 'frontend/3dTree/vendor/**'] },
  {
    files: ['backend/**/*.js', 'database/**/*.js', 'startAll.js', 'tests/**/*.js', 'scripts/**/*.js', '.github/scripts/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: globals.node },
    rules,
  },
  {
    files: ['frontend/**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: { ...globals.browser, ...cdnGlobals } },
    rules,
  },
  {
    // The page's own top-level names are declared as globals above, so a declaration is not a "redeclaration".
    files: ['frontend/admin/js/*.js'],
    languageOptions: { globals: sharedPageGlobals('frontend/admin/js') },
    rules: { 'no-redeclare': ['error', { builtinGlobals: false }], 'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }] },
  },
  {
    // The 3D ESG Tree scene is built from ES modules (import/export), with three.js bundled in vendor/.
    files: ['frontend/3dTree/**/*.js'],
    languageOptions: { sourceType: 'module', ecmaVersion: 2024 },
  },
  {
    files: ['frontend/feedback/js/*.js'],
    languageOptions: { globals: sharedPageGlobals('frontend/feedback/js') },
    rules: { 'no-redeclare': ['error', { builtinGlobals: false }], 'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }] },
  },
];
