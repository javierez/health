import next from "eslint-config-next";

/**
 * Baseline is zero warnings. Lint the files you touched, not the repo.
 */
export default [
  { ignores: [".next/**", "node_modules/**"] },
  ...(Array.isArray(next) ? next : [next]),
];
