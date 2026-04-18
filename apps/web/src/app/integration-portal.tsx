import React from "react";

export interface IntegrationInspectorProviderSummary {
  invoiceCount: number;
  customerCount: number;
  contactCount: number;
  paymentCount: number;
  totalInvoiceAmountCents: number;
  totalOpenInvoiceAmountCents: number;
  totalPaymentAmountCents: number;
  totalUnappliedPaymentAmountCents: number;
  currencyCodes: string[];
}

export interface IntegrationInspectorProvider {
  provider: "quickbooks" | "business-central" | "sap-business-one" | "odoo";
  label: string;
  tenantSlug: string;
  connectionStatus: "connected" | "not_connected" | "error";
  lifecycleState?: string;
  detail: string;
  companyName?: string;
  environment?: string;
  pulledObjects: string[];
  summary: IntegrationInspectorProviderSummary;
  raw: Record<string, unknown>;
  errorMessage?: string;
  latestPullStartedAt?: string;
  latestPullCompletedAt?: string;
  validationStatus?: "validated" | "failed" | "pending";
}

export interface IntegrationPortalBanner {
  provider: IntegrationInspectorProvider["provider"];
  status: "connected" | "error" | "info";
  message: string;
}

export interface OdooDatabaseSelection {
  state: string;
  baseUrl: string;
  username: string;
  databases: string[];
}

export interface BusinessCentralCompanySelection {
  state: string;
  environment: string;
  loginHint?: string;
  domainHint?: string;
  companies: Array<{
    id: string;
    name: string;
  }>;
}

export interface IntegrationPortalData {
  tenantSlug: string;
  clientName: string;
  providers: IntegrationInspectorProvider[];
  inspectorPath: string;
  token: string;
  banner?: IntegrationPortalBanner;
  odooSelection?: OdooDatabaseSelection;
  businessCentralSelection?: BusinessCentralCompanySelection;
}

export interface IntegrationInspectorPageData {
  tenantSlug: string;
  clientName: string;
  providers: IntegrationInspectorProvider[];
  portalPath: string;
}

export interface ClientConnectInviteData {
  tenantSlug: string;
  clientName: string;
  inviteId?: string;
  portalLink?: string;
  inspectorLink?: string;
  statusMessage?: string;
  errorMessage?: string;
  invites: ClientConnectInviteRecord[];
}

export interface ClientConnectInviteRecord {
  inviteId: string;
  tenantSlug: string;
  clientName: string;
  status: "active" | "cancelled";
  createdAtLabel: string;
  updatedAtLabel: string;
  lastUsedAtLabel?: string;
  cancelledAtLabel?: string;
  createdByLabel: string;
  cancelledByLabel?: string;
  portalLink?: string;
  inspectorLink?: string;
}

export const IntegrationPortalPage = ({ data }: { data: IntegrationPortalData }) => {
  const totals = buildPulledDataTotals(data.providers);
  const connectedProviders = data.providers.filter((provider) => provider.connectionStatus === "connected");
  const hasPulledData =
    totals.invoiceCount > 0 || totals.customerCount > 0 || totals.paymentCount > 0;
  const shouldShowResults =
    connectedProviders.length > 0 ||
    hasPulledData;

  return (
    <>
      <style>{standaloneStyles}</style>
      <main className="standalone-shell">
        <section className="portal-hero">
          <img
            className="yield-wordmark"
            src="/yield-wordmark.png"
            alt="Yield"
            width="144"
            height="64"
          />
          <div className="hero-copy-wrap">
            <h1>Securely connect your accounting platform</h1>
            <p className="hero-copy">
              We access only the data required for onboarding validation and credit analysis. All
              information remains fully auditable and under your control throughout the process.
            </p>
            <div className="trust-row" aria-label="Trust signals">
              <TrustChip icon="shield" label="Bank-grade encryption" />
              <TrustChip icon="lock" label="Read-only access" />
              <TrustChip icon="eye" label="Fully auditable" />
            </div>
          </div>
        </section>

        <section className="headline-metrics" aria-label="Connection overview">
          <MetricCard icon="invoice" label="Invoices" value={formatCount(totals.invoiceCount)} />
          <MetricCard icon="customers" label="Customers" value={formatCount(totals.customerCount)} />
          <MetricCard icon="payments" label="Payments" value={formatCount(totals.paymentCount)} />
          <MetricCard
            icon="open-ar"
            label="Open A/R"
            value={formatCompactCurrency(totals.totalOpenInvoiceAmountCents)}
          />
        </section>

        {data.banner && data.banner.status !== "connected" ? (
          <section className={`banner banner-${data.banner.status}`}>
            <strong>{providerLabel(data.banner.provider)}</strong>
            <p>{data.banner.message}</p>
          </section>
        ) : null}

        <section className="section-heading">
          <h2>Supported Platforms</h2>
        </section>

        <section className="provider-grid">
          {data.providers.map((provider) => (
            <article key={provider.provider} className="provider-card provider-connect-card">
              <div className="platform-header">
                <div className="platform-title-row">
                  <h3>{providerLabel(provider.provider)}</h3>
                  <span
                    className={`platform-status platform-status-${provider.connectionStatus}`}
                  >
                    {provider.connectionStatus === "connected" ? "Connected" : "Not Connected"}
                  </span>
                </div>
                <p className="platform-description">{connectionCardDescription(provider)}</p>
              </div>

              {provider.connectionStatus === "connected" ? (
                <div className="connection-success-panel">
                  <span className="connection-success-pill">
                    {data.banner?.provider === provider.provider &&
                    data.banner.status === "connected"
                      ? data.banner.message
                      : "Connected Successfully"}
                  </span>
                </div>
              ) : provider.provider === "quickbooks" ? (
                <a
                  className="platform-primary-button"
                  href={`/connect/accounting/quickbooks?token=${encodeURIComponent(data.token)}`}
                >
                  Connect QuickBooks
                </a>
              ) : provider.provider === "business-central" && data.businessCentralSelection ? (
                <ProviderConnectModal
                  triggerLabel="Continue Business Central setup"
                  title="Connect Business Central"
                  description="We found more than one Business Central company for this Microsoft account. Choose the company you want Yield to connect."
                  method="POST"
                  action="/connect/accounting/business-central/select"
                  cancelHref={`/connect/accounting?token=${encodeURIComponent(data.token)}`}
                  open
                  compact
                >
                  <input type="hidden" name="token" value={data.token} />
                  <input type="hidden" name="state" value={data.businessCentralSelection.state} />
                  <label>
                    Select company
                    <select
                      className="form-input"
                      name="companyId"
                      defaultValue={data.businessCentralSelection.companies[0]?.id}
                    >
                      {data.businessCentralSelection.companies.map((company) => (
                        <option key={company.id} value={company.id}>
                          {company.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </ProviderConnectModal>
              ) : provider.provider === "business-central" ? (
                <a
                  className="platform-primary-button"
                  href={`/connect/accounting/business-central?token=${encodeURIComponent(data.token)}`}
                >
                  Connect Business Central
                </a>
              ) : provider.provider === "sap-business-one" ? (
                <ProviderConnectModal
                  triggerLabel="Connect SAP Business One"
                  title="Connect SAP Business One"
                  description="Enter the SAP Business One service-layer details required to access the company database for validation."
                  method="POST"
                  action="/connect/accounting/sap-business-one"
                  cancelHref={`/connect/accounting?token=${encodeURIComponent(data.token)}`}
                >
                  <input type="hidden" name="tenantSlug" value={data.tenantSlug} />
                  <input type="hidden" name="client" value={data.clientName} />
                  <input type="hidden" name="token" value={data.token} />
                  <label>
                    Base URL
                    <input
                      className="form-input"
                      name="baseUrl"
                      placeholder="https://sap.example.com:50000"
                      required
                    />
                  </label>
                  <label>
                    Company database
                    <input
                      className="form-input"
                      name="companyDatabase"
                      placeholder="SBODEMO_PH"
                      required
                    />
                  </label>
                  <label>
                    Username
                    <input className="form-input" name="username" placeholder="manager" required />
                  </label>
                  <label>
                    Password
                    <input className="form-input" type="password" name="password" required />
                  </label>
                  <label>
                    Language code
                    <input className="form-input" name="language" placeholder="EN" />
                  </label>
                </ProviderConnectModal>
              ) : data.odooSelection ? (
                <ProviderConnectModal
                  triggerLabel="Continue Odoo setup"
                  title="Connect Odoo"
                  description={`We found multiple databases for ${data.odooSelection.username}. Choose the one you want Yield to validate against.`}
                  method="POST"
                  action="/connect/accounting/odoo/select"
                  cancelHref={`/connect/accounting?token=${encodeURIComponent(data.token)}`}
                  open
                  compact
                >
                  <input type="hidden" name="tenantSlug" value={data.tenantSlug} />
                  <input type="hidden" name="client" value={data.clientName} />
                  <input type="hidden" name="state" value={data.odooSelection.state} />
                  <input type="hidden" name="token" value={data.token} />
                  <label>
                    Select database for {data.odooSelection.username}
                    <select className="form-input" name="database" defaultValue={data.odooSelection.databases[0]}>
                      {data.odooSelection.databases.map((database) => (
                        <option key={database} value={database}>
                          {database}
                        </option>
                      ))}
                    </select>
                  </label>
                </ProviderConnectModal>
              ) : (
                <ProviderConnectModal
                  triggerLabel="Connect Odoo"
                  title="Connect Odoo"
                  description="Provide the Odoo server login and, if known, the exact accounting defaults you want Yield to use for onboarding validation."
                  method="POST"
                  action="/connect/accounting/odoo"
                  cancelHref={`/connect/accounting?token=${encodeURIComponent(data.token)}`}
                >
                  <input type="hidden" name="tenantSlug" value={data.tenantSlug} />
                  <input type="hidden" name="client" value={data.clientName} />
                  <input type="hidden" name="token" value={data.token} />
                  <label>
                    Base URL
                    <input className="form-input" name="baseUrl" placeholder="https://odoo.example.com" required />
                  </label>
                  <label>
                    Username or email
                    <input className="form-input" name="username" placeholder="finance@client.com" required />
                  </label>
                  <label>
                    Password
                    <input className="form-input" type="password" name="password" required />
                  </label>
                  <label>
                    Database
                    <input className="form-input" name="database" placeholder="Optional if only one database exists" />
                  </label>
                  <label>
                    Company ID
                    <input className="form-input" name="companyId" placeholder="Optional" />
                  </label>
                  <label>
                    Default journal ID
                    <input className="form-input" name="defaultJournalId" placeholder="Optional" />
                  </label>
                  <label>
                    Default product ID
                    <input className="form-input" name="defaultProductId" placeholder="Optional" />
                  </label>
                </ProviderConnectModal>
              )}
            </article>
          ))}
        </section>

        {shouldShowResults ? (
          <>
            <section className="section-heading section-heading-row">
              <h2>Pulled Data Results</h2>
              <a className="section-link" href={data.inspectorPath}>
                Refresh Data
              </a>
            </section>

            <section className="results-grid">
              <ResultCard
                icon="invoice"
                label="Invoices"
                value={formatCount(totals.invoiceCount)}
                subtitle="Total records synced"
                rows={[
                  { label: "Total value", value: formatCompactCurrency(totals.totalInvoiceAmountCents) },
                  { label: "Outstanding", value: formatCompactCurrency(totals.totalOpenInvoiceAmountCents) },
                  { label: "Connected sources", value: String(connectedProviders.length) },
                ]}
              />
              <ResultCard
                icon="customers"
                label="Customers"
                value={formatCount(totals.customerCount)}
                subtitle="Active accounts"
                rows={[
                  { label: "Contacts", value: formatCount(totals.contactCount) },
                  { label: "Currencies", value: String(totals.currencyCodes.length || 0) },
                  { label: "Validation", value: totals.validationLabel },
                ]}
              />
              <ResultCard
                icon="payments"
                label="Payments"
                value={formatCount(totals.paymentCount)}
                subtitle="Total transactions"
                rows={[
                  { label: "Total value", value: formatCompactCurrency(totals.totalPaymentAmountCents) },
                  { label: "Unapplied", value: formatCompactCurrency(totals.totalUnappliedPaymentAmountCents) },
                  { label: "Open A/R", value: formatCompactCurrency(totals.totalOpenInvoiceAmountCents), accent: true },
                ]}
              />
            </section>

            <section className="validation-panel">
              <div className="validation-icon" aria-hidden="true">
                {renderIcon(hasPulledData ? "check" : "open-ar")}
              </div>
              <div>
                <h3>{hasPulledData ? "Data validation complete" : "Connection established"}</h3>
                <p>
                  {hasPulledData
                    ? "All records have been successfully synced and validated. Your accounting data is ready for onboarding review."
                    : "Your platform has been connected successfully. Yield is now pulling the initial accounting data for review."}
                </p>
              </div>
            </section>
          </>
        ) : (
          <section className="review-panel">
            <div>
              <h2>Review synced data</h2>
              <p>
                View and validate all information pulled from your connected accounting systems. Full
                transparency into what we access.
              </p>
            </div>
            <a className="review-link" href={data.inspectorPath}>
              <span className="review-link-icon" aria-hidden="true">
                {renderIcon("invoice")}
              </span>
              View Pulled Data
            </a>
          </section>
        )}
      </main>
    </>
  );
};

export const IntegrationInspectorPage = ({ data }: { data: IntegrationInspectorPageData }) => (
  <>
    <style>{standaloneStyles}</style>
    <main className="standalone-shell">
      <section className="hero-card">
        <span className="eyebrow">Integration inspection</span>
        <h1>Pulled data for {data.clientName}</h1>
        <p className="hero-copy">
          This view shows the latest read results by connector so we can validate real-client onboarding safely before any workflow uses the data.
        </p>
        <div className="hero-meta">
          <span className="chip">Tenant: {data.tenantSlug}</span>
          <a className="secondary-link" href={data.portalPath}>
            Open client connect page
          </a>
        </div>
      </section>

      {data.providers.map((provider) => (
        <article key={provider.provider} className="provider-card inspector-card">
          <div className="provider-card-header">
            <div>
              <h2>{provider.label}</h2>
              <p>{provider.companyName ? `${provider.companyName} · ${provider.detail}` : provider.detail}</p>
            </div>
            <span className={`status-pill status-${provider.connectionStatus}`}>
              {provider.connectionStatus === "connected" ? "Connected" : "Not connected"}
            </span>
          </div>

          <div className="summary-grid summary-grid-large">
            <Metric label="Invoices" value={String(provider.summary.invoiceCount)} />
            <Metric label="Customers" value={String(provider.summary.customerCount)} />
            <Metric label="Contacts" value={String(provider.summary.contactCount)} />
            <Metric label="Payments" value={String(provider.summary.paymentCount)} />
            <Metric
              label="Invoice total"
              value={formatCurrency(provider.summary.totalInvoiceAmountCents)}
            />
            <Metric
              label="Open A/R"
              value={formatCurrency(provider.summary.totalOpenInvoiceAmountCents)}
            />
            <Metric
              label="Payments total"
              value={formatCurrency(provider.summary.totalPaymentAmountCents)}
            />
            <Metric
              label="Unapplied"
              value={formatCurrency(provider.summary.totalUnappliedPaymentAmountCents)}
            />
          </div>

          <div className="object-row">
            {(provider.summary.currencyCodes.length > 0
              ? provider.summary.currencyCodes
              : ["No currencies found"]
            ).map((currencyCode) => (
              <span key={currencyCode} className="chip">
                {currencyCode}
              </span>
            ))}
            {provider.lifecycleState ? (
              <span className="chip">Lifecycle: {humanize(provider.lifecycleState)}</span>
            ) : null}
            {provider.validationStatus ? (
              <span className="chip">Validation: {humanize(provider.validationStatus)}</span>
            ) : null}
          </div>

          {provider.latestPullCompletedAt ? (
            <p className="empty-copy">
              Latest pull completed {formatTimestamp(provider.latestPullCompletedAt)}.
            </p>
          ) : provider.latestPullStartedAt ? (
            <p className="empty-copy">
              Latest pull started {formatTimestamp(provider.latestPullStartedAt)}.
            </p>
          ) : null}

          {Object.entries(provider.raw).length === 0 ? (
            <p className="empty-copy">No raw payload has been pulled for this provider yet.</p>
          ) : (
            <div className="details-stack">
              {Object.entries(provider.raw).map(([key, value]) => (
                <details key={key} className="raw-block">
                  <summary>Raw {humanize(key)}</summary>
                  <pre>{JSON.stringify(value, null, 2)}</pre>
                </details>
              ))}
            </div>
          )}
        </article>
      ))}
    </main>
  </>
);

export const ClientConnectInvitePage = ({ data }: { data: ClientConnectInviteData }) => (
  <>
    <style>{standaloneStyles}</style>
    <main className="standalone-shell">
      <section className="hero-card">
        <span className="eyebrow">Invite generator</span>
        <h1>Create a client connect link</h1>
        <p className="hero-copy">
          Generate a controlled link before sending it to a customer. Links stay active until you
          cancel them, and every issued link stays visible for operator audit.
        </p>
      </section>

      <article className="provider-card">
        <form method="POST" action="/connect/accounting/invite" className="stack-form">
          <label>
            Tenant slug
            <input className="form-input" name="tenantSlug" defaultValue={data.tenantSlug} required />
          </label>
          <label>
            Client name
            <input className="form-input" name="client" defaultValue={data.clientName} required />
          </label>
          <button type="submit" className="primary-button">Generate link</button>
        </form>

        {data.errorMessage ? (
          <section className="banner banner-error">
            <strong>Invite request failed</strong>
            <p>{data.errorMessage}</p>
          </section>
        ) : null}

        {data.statusMessage ? (
          <section className="banner banner-info">
            <strong>Invite updated</strong>
            <p>{data.statusMessage}</p>
          </section>
        ) : null}

        {data.portalLink && data.inspectorLink ? (
          <div className="details-stack">
            <div className="metric-card">
              <span>Portal link</span>
              <strong className="link-copy">{data.portalLink}</strong>
            </div>
            <div className="metric-card">
              <span>Inspector link</span>
              <strong className="link-copy">{data.inspectorLink}</strong>
            </div>
          </div>
        ) : null}

        {data.invites.length > 0 ? (
          <div className="details-stack">
            <div className="panel-header">
              <h2>Issued links</h2>
            </div>
            {data.invites.map((invite) => (
              <article key={invite.inviteId} className="provider-card inspector-card">
                <div className="provider-card-header">
                  <div>
                    <h2>{invite.clientName}</h2>
                    <p>
                      Created {invite.createdAtLabel} by {invite.createdByLabel}
                    </p>
                  </div>
                  <span className={`status-pill status-${invite.status === "active" ? "connected" : "error"}`}>
                    {invite.status === "active" ? "Active" : "Cancelled"}
                  </span>
                </div>
                <div className="details-stack">
                  {invite.portalLink ? (
                    <div className="metric-card">
                      <span>Portal link</span>
                      <strong className="link-copy">{invite.portalLink}</strong>
                    </div>
                  ) : null}
                  {invite.inspectorLink ? (
                    <div className="metric-card">
                      <span>Inspector link</span>
                      <strong className="link-copy">{invite.inspectorLink}</strong>
                    </div>
                  ) : null}
                  <div className="object-row">
                    <span className="chip">Updated {invite.updatedAtLabel}</span>
                    {invite.lastUsedAtLabel ? (
                      <span className="chip">Last used {invite.lastUsedAtLabel}</span>
                    ) : null}
                    {invite.cancelledAtLabel ? (
                      <span className="chip">
                        Cancelled {invite.cancelledAtLabel}
                        {invite.cancelledByLabel ? ` by ${invite.cancelledByLabel}` : ""}
                      </span>
                    ) : null}
                  </div>
                </div>
                {invite.status === "active" ? (
                  <form method="POST" action="/connect/accounting/invite/cancel">
                    <input type="hidden" name="inviteId" value={invite.inviteId} />
                    <input type="hidden" name="tenantSlug" value={data.tenantSlug} />
                    <input type="hidden" name="client" value={data.clientName} />
                    <button type="submit" className="secondary-button">Cancel link</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </article>
    </main>
  </>
);

export const ClientConnectAccessDeniedPage = ({
  title,
  message,
}: {
  title: string;
  message: string;
}) => (
  <>
    <style>{standaloneStyles}</style>
    <main className="standalone-shell">
      <section className="hero-card">
        <span className="eyebrow">Access blocked</span>
        <h1>{title}</h1>
        <p className="hero-copy">{message}</p>
      </section>
    </main>
  </>
);

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="metric-card">
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const MetricCard = ({
  icon,
  label,
  value,
}: {
  icon: IconName;
  label: string;
  value: string;
}) => (
  <article className="headline-metric-card">
    <div className="metric-topline">
      <span className="metric-icon" aria-hidden="true">
        {renderIcon(icon)}
      </span>
      <span>{label}</span>
    </div>
    <strong>{value}</strong>
  </article>
);

const ResultCard = ({
  icon,
  label,
  value,
  subtitle,
  rows,
}: {
  icon: IconName;
  label: string;
  value: string;
  subtitle: string;
  rows: Array<{ label: string; value: string; accent?: boolean }>;
}) => (
  <article className="result-card">
    <div className="result-card-top">
      <div>
        <span className="result-card-label">{label}</span>
        <strong className="result-card-value">{value}</strong>
        <p className="result-card-subtitle">{subtitle}</p>
      </div>
      <span className="result-card-icon" aria-hidden="true">
        {renderIcon(icon)}
      </span>
    </div>
    <div className="result-card-rows">
      {rows.map((row) => (
        <div key={row.label} className="result-card-row">
          <span>{row.label}</span>
          <strong className={row.accent ? "result-card-accent" : undefined}>{row.value}</strong>
        </div>
      ))}
    </div>
  </article>
);

const TrustChip = ({ icon, label }: { icon: IconName; label: string }) => (
  <span className="trust-chip">
    <span className="trust-icon" aria-hidden="true">
      {renderIcon(icon)}
    </span>
    {label}
  </span>
);

const ProviderConnectModal = ({
  triggerLabel,
  title,
  description,
  action,
  method,
  cancelHref,
  children,
  open = false,
  compact = false,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  action: string;
  method: "GET" | "POST";
  cancelHref: string;
  children: React.ReactNode;
  open?: boolean;
  compact?: boolean;
}) => (
  <details className="platform-details" {...(open ? { open: true } : {})}>
    <summary className="platform-primary-button">{triggerLabel}</summary>
    <div className="modal-sheet-wrap">
      <div className="modal-backdrop" />
      <div className="modal-dialog">
        <div className="modal-dialog-header">
          <div>
            <h4>{title}</h4>
            <p className="modal-copy">{description}</p>
          </div>
        </div>
        <form
          method={method}
          action={action}
          className={`stack-form modal-form${compact ? " compact-connect-form" : ""}`}
        >
          {children}
          <div className="modal-actions modal-actions-split">
            <a className="modal-cancel" href={cancelHref} aria-label={`Cancel ${title} connection`}>
              Cancel
            </a>
            <button type="submit" className="primary-button modal-submit">Connect</button>
          </div>
        </form>
      </div>
    </div>
  </details>
);

function providerLabel(provider: IntegrationInspectorProvider["provider"]) {
  switch (provider) {
    case "quickbooks":
      return "QuickBooks";
    case "business-central":
      return "Business Central";
    case "sap-business-one":
      return "SAP Business One";
    case "odoo":
      return "Odoo";
  }
}

function humanize(value: string) {
  return value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(amountCents: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(amountCents / 100);
}

function formatCompactCurrency(amountCents: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amountCents / 100);
}

function formatCount(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function sumProviderValues(
  providers: IntegrationPortalData["providers"],
  select: (provider: IntegrationPortalData["providers"][number]) => number,
) {
  return providers.reduce((total, provider) => total + select(provider), 0);
}

function buildPulledDataTotals(providers: IntegrationPortalData["providers"]) {
  const connectedProviders = providers.filter((provider) => provider.connectionStatus === "connected");
  const currencyCodes = Array.from(
    new Set(connectedProviders.flatMap((provider) => provider.summary.currencyCodes)),
  );
  const validationValues = connectedProviders
    .map((provider) => provider.validationStatus)
    .filter(
      (value): value is NonNullable<IntegrationInspectorProvider["validationStatus"]> => Boolean(value),
    );

  return {
    invoiceCount: sumProviderValues(providers, (provider) => provider.summary.invoiceCount),
    customerCount: sumProviderValues(providers, (provider) => provider.summary.customerCount),
    contactCount: sumProviderValues(providers, (provider) => provider.summary.contactCount),
    paymentCount: sumProviderValues(providers, (provider) => provider.summary.paymentCount),
    totalInvoiceAmountCents: sumProviderValues(
      providers,
      (provider) => provider.summary.totalInvoiceAmountCents,
    ),
    totalOpenInvoiceAmountCents: sumProviderValues(
      providers,
      (provider) => provider.summary.totalOpenInvoiceAmountCents,
    ),
    totalPaymentAmountCents: sumProviderValues(
      providers,
      (provider) => provider.summary.totalPaymentAmountCents,
    ),
    totalUnappliedPaymentAmountCents: sumProviderValues(
      providers,
      (provider) => provider.summary.totalUnappliedPaymentAmountCents,
    ),
    currencyCodes,
    validationLabel:
      validationValues.length === 0
        ? "Pending"
        : validationValues.every((value) => value === "validated")
          ? "Complete"
          : validationValues.some((value) => value === "failed")
            ? "Needs review"
            : "In progress",
  };
}

function connectionCardDescription(provider: IntegrationInspectorProvider) {
  switch (provider.provider) {
    case "quickbooks":
      return "Connect your QuickBooks Online account for real-time financial data synchronization.";
    case "business-central":
      return "Integrate Microsoft Dynamics 365 Business Central for comprehensive ERP data access.";
    case "sap-business-one":
      return "Link your SAP Business One system to enable invoice and payment tracking.";
    case "odoo":
      return "Connect to your Odoo database for complete accounting system integration.";
  }
}

type IconName =
  | "shield"
  | "lock"
  | "eye"
  | "invoice"
  | "customers"
  | "payments"
  | "open-ar"
  | "check";

function renderIcon(name: IconName) {
  switch (name) {
    case "shield":
      return "◌";
    case "lock":
      return "⌂";
    case "eye":
      return "◉";
    case "invoice":
      return "▤";
    case "customers":
      return "◔";
    case "payments":
      return "$";
    case "open-ar":
      return "◷";
    case "check":
      return "◌";
  }
}

const standaloneStyles = `
  :root {
    color-scheme: light;
    font-family: Inter, "Segoe UI", Arial, sans-serif;
    background: #f7f8fa;
    color: #13233b;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background:
      linear-gradient(rgba(212, 219, 228, 0.55) 1px, transparent 1px),
      linear-gradient(90deg, rgba(212, 219, 228, 0.55) 1px, transparent 1px),
      #f7f8fa;
    background-size: 64px 64px, 64px 64px, auto;
  }

  .standalone-shell {
    max-width: 1120px;
    margin: 0 auto;
    padding: 28px 24px 56px;
  }

  .portal-hero {
    padding: 6px 0 10px;
  }

  .yield-wordmark {
    display: block;
    width: 116px;
    height: auto;
    object-fit: contain;
    margin-bottom: 22px;
  }

  .hero-copy-wrap {
    max-width: 860px;
  }

  .hero-card,
  .provider-card,
  .review-panel,
  .headline-metric-card {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #dbe3ef;
    border-radius: 20px;
    box-shadow: 0 8px 24px rgba(19, 35, 59, 0.04);
  }

  .hero-card {
    padding: 32px;
    margin-bottom: 24px;
  }

  .eyebrow {
    display: inline-flex;
    padding: 6px 10px;
    border-radius: 999px;
    background: #e2eefc;
    color: #1c5aa6;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h1, h2, p { margin: 0; }

  h1 {
    font-size: clamp(2.7rem, 5vw, 4rem);
    line-height: 1.05;
    letter-spacing: -0.04em;
    max-width: 980px;
  }

  .hero-copy {
    margin-top: 18px;
    max-width: 820px;
    color: #4d617d;
    font-size: 17px;
    line-height: 1.65;
  }

  .hero-meta,
  .action-row,
  .object-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  .hero-meta { margin-top: 20px; }

  .trust-row {
    display: flex;
    flex-wrap: wrap;
    gap: 14px 20px;
    margin-top: 26px;
  }

  .trust-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #617694;
    font-size: 14px;
    font-weight: 500;
  }

  .trust-icon {
    color: #f08a34;
    font-size: 15px;
    line-height: 1;
  }

  .headline-metrics {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 16px;
    margin: 34px 0 62px;
  }

  .headline-metric-card {
    padding: 20px 24px 18px;
  }

  .metric-topline {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #60738f;
    font-size: 14px;
    font-weight: 500;
  }

  .metric-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    color: #5d708a;
    font-size: 16px;
  }

  .headline-metric-card strong {
    display: block;
    margin-top: 14px;
    color: #13233b;
    font-size: clamp(2rem, 3vw, 2.5rem);
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .chip,
  .status-pill {
    display: inline-flex;
    align-items: center;
    padding: 7px 12px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
  }

  .chip {
    background: #eef4fb;
    color: #34506d;
  }

  .status-connected { background: #e1f6ea; color: #166534; }
  .status-not_connected,
  .status-error { background: #fff3dc; color: #9a5b00; }

  .banner {
    padding: 18px 22px;
    border-radius: 18px;
    margin-bottom: 24px;
    border: 1px solid transparent;
  }

  .banner p { margin-top: 6px; color: inherit; }
  .banner-connected { background: #e9f9ef; border-color: #b8e8c9; color: #166534; }
  .banner-error { background: #fff4ef; border-color: #f3c4b6; color: #9f3412; }
  .banner-info { background: #eef4fb; border-color: #d8e3ef; color: #24405c; }

  .provider-grid {
    display: grid;
    gap: 24px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .provider-card {
    padding: 24px 24px 24px;
  }

  .provider-connect-card {
    min-height: 212px;
  }

  .inspector-card {
    margin-bottom: 20px;
  }

  .section-heading {
    margin-bottom: 20px;
  }

  .section-heading-row {
    margin-top: 54px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  .section-heading h2 {
    font-size: 18px;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .section-link {
    color: #6b7f9b;
    text-decoration: none;
    font-size: 14px;
    font-weight: 700;
  }

  .platform-header {
    min-height: 92px;
  }

  .platform-title-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: baseline;
  }

  .platform-title-row h3 {
    margin: 0;
    font-size: 20px;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .platform-status {
    font-size: 14px;
    font-weight: 600;
  }

  .platform-status-connected {
    color: #09b96d;
  }

  .platform-status-not_connected,
  .platform-status-error {
    color: #6b7f9b;
  }

  .platform-description {
    margin-top: 16px;
    color: #5f7491;
    font-size: 14px;
    line-height: 1.75;
    max-width: 420px;
  }

  .platform-actions {
    display: grid;
    gap: 10px;
    margin-top: 18px;
  }

  .platform-primary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 48px;
    padding: 13px 18px;
    border-radius: 13px;
    background: #102036;
    color: #ffffff;
    font-size: 16px;
    font-weight: 700;
    text-decoration: none;
    border: none;
    cursor: pointer;
  }

  .platform-details {
    margin-top: 18px;
  }

  .connection-success-panel {
    margin-top: 18px;
  }

  .connection-success-pill {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    width: 100%;
    border-radius: 14px;
    background: #eaf8f1;
    color: #09b96d;
    font-size: 15px;
    font-weight: 700;
    text-align: center;
  }

  .platform-details summary {
    list-style: none;
  }

  .platform-details summary::-webkit-details-marker {
    display: none;
  }

  .modal-sheet-wrap {
    position: relative;
  }

  .platform-details .modal-backdrop,
  .platform-details .modal-sheet {
    display: none;
  }

  .platform-details[open] .modal-backdrop,
  .platform-details[open] .modal-sheet {
    display: block;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(16, 32, 54, 0.18);
    backdrop-filter: blur(2px);
    z-index: 50;
  }

  .modal-dialog {
    position: fixed;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: min(456px, calc(100vw - 24px));
    padding: 28px 30px 30px;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid #dbe3ef;
    border-radius: 20px;
    box-shadow: 0 24px 80px rgba(16, 32, 54, 0.22);
    overflow: auto;
    z-index: 60;
  }

  .modal-dialog-header h4 {
    margin: 0;
    font-size: 24px;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }

  .modal-copy {
    margin-top: 12px;
    color: #5f7491;
    font-size: 15px;
    line-height: 1.7;
  }

  .modal-cancel {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    width: 100%;
    min-height: 52px;
    padding: 0 18px;
    border-radius: 14px;
    background: #ffffff;
    border: 1px solid #d7e0eb;
    color: #13233b;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    user-select: none;
  }

  .modal-form {
    margin-top: 22px;
  }

  .modal-field-note {
    margin: -2px 0 0;
    color: #6a7d97;
    font-size: 13px;
    line-height: 1.6;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }

  .modal-actions-split {
    gap: 12px;
  }

  .modal-actions-split > * {
    flex: 1 1 0;
  }

  .modal-submit {
    min-height: 52px;
    border-radius: 14px;
    font-size: 16px;
  }

  .provider-card-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
  }

  .provider-card-header p {
    margin-top: 8px;
    color: #58728b;
    line-height: 1.5;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 18px 0;
  }

  .summary-grid-large {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .metric-card {
    padding: 14px;
    border-radius: 16px;
    background: #f7fafc;
    border: 1px solid #e2eaf2;
  }

  .metric-card span {
    display: block;
    color: #58728b;
    font-size: 13px;
    margin-bottom: 8px;
  }

  .metric-card strong {
    font-size: 22px;
  }

  .link-copy {
    display: block;
    font-size: 14px;
    line-height: 1.5;
    word-break: break-all;
  }

  .stack-form {
    display: grid;
    gap: 12px;
    margin-top: 18px;
    padding-top: 2px;
  }

  .stack-form label {
    display: grid;
    gap: 8px;
    color: #13233b;
    font-size: 14px;
    font-weight: 700;
  }

  .form-input {
    width: 100%;
    min-height: 52px;
    padding: 13px 15px;
    border-radius: 14px;
    border: 1px solid #d7e0eb;
    background: #ffffff;
    color: #13233b;
    font-size: 15px;
  }

  .form-input::placeholder {
    color: #93a3b8;
  }

  .primary-link,
  .secondary-link,
  .primary-button {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    padding: 12px 16px;
    border-radius: 12px;
    font-weight: 700;
    text-decoration: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
  }

  .primary-link,
  .primary-button {
    background: #102036;
    color: white;
  }

  .secondary-link {
    background: #ffffff;
    color: #13233b;
    border: 1px solid #dbe3ef;
  }

  .secondary-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 11px 16px;
    border-radius: 12px;
    border: 1px solid #d5deea;
    background: #ffffff;
    color: #13233b;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .empty-copy {
    margin-top: 18px;
    color: #58728b;
  }

  .details-stack {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 22px;
  }

  .result-card {
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #dbe3ef;
    border-radius: 20px;
    box-shadow: 0 8px 24px rgba(19, 35, 59, 0.04);
    padding: 22px 24px;
  }

  .result-card-top {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 16px;
  }

  .result-card-label {
    display: block;
    color: #13233b;
    font-size: 15px;
    font-weight: 700;
  }

  .result-card-value {
    display: block;
    margin-top: 18px;
    color: #13233b;
    font-size: 3rem;
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .result-card-subtitle {
    margin-top: 10px;
    color: #5f7491;
    font-size: 14px;
    line-height: 1.5;
  }

  .result-card-icon {
    color: #627593;
    font-size: 22px;
    line-height: 1;
  }

  .result-card-rows {
    margin-top: 18px;
    display: grid;
    gap: 10px;
  }

  .result-card-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: baseline;
    color: #5f7491;
    font-size: 14px;
  }

  .result-card-row strong {
    color: #13233b;
    font-size: 14px;
  }

  .result-card-accent {
    color: #f08a34 !important;
  }

  .validation-panel {
    margin-top: 26px;
    padding: 22px 24px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    background: rgba(255, 255, 255, 0.94);
    border: 1px solid #dbe3ef;
    border-radius: 20px;
    box-shadow: 0 8px 24px rgba(19, 35, 59, 0.04);
  }

  .validation-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
    border-radius: 999px;
    border: 1.5px solid #09b96d;
    color: #09b96d;
    font-size: 12px;
    margin-top: 2px;
  }

  .validation-panel h3 {
    margin: 0;
    font-size: 16px;
    line-height: 1.2;
    letter-spacing: -0.02em;
  }

  .validation-panel p {
    margin-top: 10px;
    color: #5f7491;
    font-size: 14px;
    line-height: 1.6;
  }

  .raw-block {
    border: 1px solid #d8e3ef;
    border-radius: 16px;
    background: #fbfdff;
    overflow: hidden;
  }

  .raw-block summary {
    padding: 14px 16px;
    cursor: pointer;
    font-weight: 700;
  }

  .raw-block pre {
    margin: 0;
    padding: 0 16px 16px;
    overflow: auto;
    font-size: 12px;
    line-height: 1.5;
    color: #24405c;
  }

  .review-panel {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    margin-top: 48px;
    padding: 34px 32px;
  }

  .review-panel h2 {
    font-size: 20px;
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .review-panel p {
    margin-top: 14px;
    max-width: 620px;
    color: #5f7491;
    font-size: 15px;
    line-height: 1.6;
  }

  .review-link {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-height: 54px;
    padding: 0 24px;
    border-radius: 16px;
    border: 2px solid #13233b;
    color: #13233b;
    text-decoration: none;
    font-size: 15px;
    font-weight: 700;
    background: rgba(255, 255, 255, 0.96);
    white-space: nowrap;
  }

  .review-link-icon {
    display: inline-flex;
    font-size: 16px;
  }

  .compact-connect-form {
    margin-top: 18px;
  }

  @media (max-width: 720px) {
    .standalone-shell { padding: 22px 16px 40px; }
    .yield-wordmark { width: 102px; margin-bottom: 20px; }
    h1 { font-size: 2.7rem; }
    .headline-metrics,
    .provider-grid,
    .results-grid {
      grid-template-columns: 1fr;
    }
    .provider-card-header,
    .review-panel,
    .section-heading-row,
    .validation-panel {
      flex-direction: column;
      align-items: stretch;
    }
    .modal-dialog {
      width: calc(100vw - 24px);
      max-height: calc(100vh - 24px);
      padding: 22px 18px 18px;
    }
    .summary-grid { grid-template-columns: 1fr 1fr; }
    .review-link { width: 100%; justify-content: center; }
  }
`;
