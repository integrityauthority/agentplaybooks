/**
 * Flat config, loaded natively.
 *
 * `eslint-config-next` 16 ships flat configs — `core-web-vitals` and
 * `typescript` each export a `Linter.Config[]`. Reaching them through
 * `FlatCompat`, as this file used to, asks the legacy eslintrc bridge to
 * normalize a config that is already flat, and its validator then walks a
 * structure that references itself:
 *
 *   TypeError: Converting circular structure to JSON
 *       at ConfigValidator.formatErrors (@eslint/eslintrc/lib/shared/config-validator.js)
 *       --- property 'react' closes the circle
 *
 * That crash is what made the `eslint-config-next` 16 bump look unmergeable on
 * its own. Spreading the arrays directly removes the bridge, and with it the
 * `@eslint/eslintrc` dependency.
 */

import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Rules that `eslint-plugin-react-hooks` 7 brings with this upgrade and that
 * fire on existing code: 16 `set-state-in-effect` and 5 `immutability`
 * findings across 15 components. They are real findings, not noise — but each
 * is a question about what that effect is for, and answering 21 of them is a
 * separate piece of work from moving to Next 16.
 *
 * Downgraded to warnings so they stay visible in every lint run rather than
 * being switched off, and so the upgrade does not turn CI red on day one.
 * Deleting this is the definition of done for issue #50, which lists every
 * site. Do not add rules here to quiet a new finding.
 *
 * The severity is rewritten where the shared config defines the rule, instead
 * of in an override object: flat config resolves a rule against the plugins
 * declared in the *same* object, so an override would have to redeclare
 * `react-hooks` — which ESLint then rejects as a redefined plugin.
 */
const PENDING_REACT_HOOKS_RULES = new Set([
  "react-hooks/set-state-in-effect",
  "react-hooks/immutability",
]);

function warnPendingRules(configs) {
  return configs.map((config) => {
    if (!config.rules) return config;
    const rules = Object.fromEntries(
      Object.entries(config.rules).map(([rule, setting]) => [
        rule,
        PENDING_REACT_HOOKS_RULES.has(rule) ? "warn" : setting,
      ]),
    );
    return { ...config, rules };
  });
}

const eslintConfig = [
  {
    ignores: [
      ".cloudflare/**",
      ".cloudflare-pages/**",
      ".next/**",
      ".open-next/**",
      ".tmp/**",
      ".wrangler/**",
      "node_modules/**",
      "next-env.d.ts",
    ],
  },
  ...warnPendingRules(coreWebVitals),
  ...warnPendingRules(nextTypescript),
];

export default eslintConfig;
