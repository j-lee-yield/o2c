import type { DomainModuleDefinition } from "@o2c/domain";

type ModuleCardProps = {
  module: DomainModuleDefinition;
};

export const ModuleCard = ({ module }: ModuleCardProps) => (
  <article>
    <h2>{module.name}</h2>
    <p>{module.description}</p>
    <small>{module.boundedContext}</small>
  </article>
);

