export type Identifier<T extends string> = string & { readonly __brand: T };

export type ISODateString = string;

export type CurrencyCode = "USD" | "EUR" | "GBP" | "PHP";

export type LifecycleState = "draft" | "active" | "suspended" | "archived";

