import type { LifecycleState } from "@o2c/types";
export type DomainModuleDefinition = {
    name: string;
    boundedContext: string;
    description: string;
    capabilities: string[];
    integrations: string[];
    lifecycle: LifecycleState;
};
//# sourceMappingURL=module.d.ts.map