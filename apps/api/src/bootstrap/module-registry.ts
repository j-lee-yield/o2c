import { domainModules } from "@o2c/domain";

type ModuleRegistryItem = (typeof domainModules)[number] & {
  routePrefix: string;
};

export const moduleRegistry: ModuleRegistryItem[] = domainModules.map((moduleDefinition) => ({
  ...moduleDefinition,
  routePrefix: `/v1/${moduleDefinition.name}`
}));
