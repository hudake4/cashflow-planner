/**
 * Alias module for the debt payoff planner (issue #50). The canonical
 * implementation lives in `./debt-payoff`; this module re-exports it so that
 * either import path works.
 */
export * from "./debt-payoff";
export { default } from "./debt-payoff";