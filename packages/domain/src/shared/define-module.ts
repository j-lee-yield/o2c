import type { DomainModuleDefinition } from "../contracts/module.js";

export const defineModule = (
  definition: DomainModuleDefinition
): Readonly<DomainModuleDefinition> => definition;

