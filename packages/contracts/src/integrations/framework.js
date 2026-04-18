export const defaultIntegrationRetryPolicy = {
    maxAttempts: 3,
    backoffSeconds: [30, 120, 600],
};
export const providerEnvironmentCatalog = {
    netsuite: {
        provider: "netsuite",
        authStrategy: "oauth2",
        endpoints: {
            timeoutMs: 30000,
        },
        credentials: {
            requiredKeys: ["INTEGRATION_NETSUITE_CLIENT_ID", "INTEGRATION_NETSUITE_CLIENT_SECRET"],
            optionalKeys: ["INTEGRATION_NETSUITE_ACCOUNT_ID", "INTEGRATION_NETSUITE_BASE_URL"],
        },
    },
    sap_business_one: {
        provider: "sap_business_one",
        authStrategy: "basic_auth",
        endpoints: {
            timeoutMs: 30000,
        },
        credentials: {
            requiredKeys: [
                "INTEGRATION_SAP_B1_BASE_URL",
                "INTEGRATION_SAP_B1_COMPANY_DATABASE",
                "INTEGRATION_SAP_B1_USERNAME",
                "INTEGRATION_SAP_B1_PASSWORD",
            ],
            optionalKeys: ["INTEGRATION_SAP_B1_LANGUAGE"],
        },
        notes: "SAP Business One Service Layer connection for invoice, customer, and payment pulls.",
    },
    quickbooks_online: {
        provider: "quickbooks_online",
        authStrategy: "oauth2",
        endpoints: {
            timeoutMs: 30000,
            baseUrl: "https://quickbooks.api.intuit.com",
            sandboxBaseUrl: "https://sandbox-quickbooks.api.intuit.com",
        },
        credentials: {
            requiredKeys: ["INTEGRATION_QUICKBOOKS_CLIENT_ID", "INTEGRATION_QUICKBOOKS_CLIENT_SECRET"],
            optionalKeys: ["INTEGRATION_QUICKBOOKS_REALM_ID"],
        },
    },
    xero: {
        provider: "xero",
        authStrategy: "oauth2",
        endpoints: {
            timeoutMs: 30000,
            baseUrl: "https://api.xero.com",
        },
        credentials: {
            requiredKeys: ["INTEGRATION_XERO_CLIENT_ID", "INTEGRATION_XERO_CLIENT_SECRET"],
            optionalKeys: ["INTEGRATION_XERO_TENANT_ID"],
        },
    },
    zoho_books: {
        provider: "zoho_books",
        authStrategy: "oauth2",
        endpoints: {
            timeoutMs: 30000,
            baseUrl: "https://www.zohoapis.com/books/v3",
        },
        credentials: {
            requiredKeys: ["INTEGRATION_ZOHO_CLIENT_ID", "INTEGRATION_ZOHO_CLIENT_SECRET"],
            optionalKeys: ["INTEGRATION_ZOHO_ORGANIZATION_ID"],
        },
    },
    odoo: {
        provider: "odoo",
        authStrategy: "basic_auth",
        endpoints: {
            timeoutMs: 30000,
        },
        credentials: {
            requiredKeys: [
                "INTEGRATION_ODOO_BASE_URL",
                "INTEGRATION_ODOO_DATABASE",
                "INTEGRATION_ODOO_USERNAME",
                "INTEGRATION_ODOO_PASSWORD",
            ],
            optionalKeys: [
                "INTEGRATION_ODOO_COMPANY_ID",
                "INTEGRATION_ODOO_DEFAULT_JOURNAL_ID",
                "INTEGRATION_ODOO_DEFAULT_PRODUCT_ID",
            ],
        },
        notes: "Odoo JSON-RPC invoice CRUD and guarded import path.",
    },
    dear_erp: {
        provider: "dear_erp",
        authStrategy: "api_key",
        endpoints: {
            timeoutMs: 30000,
            baseUrl: "https://inventory.dearsystems.com/ExternalApi/v2",
        },
        credentials: {
            requiredKeys: ["INTEGRATION_DEAR_ACCOUNT_ID", "INTEGRATION_DEAR_API_KEY"],
        },
    },
    google_sheets: {
        provider: "google_sheets",
        authStrategy: "service_account",
        endpoints: {
            timeoutMs: 30000,
        },
        credentials: {
            requiredKeys: [
                "INTEGRATION_GOOGLE_SHEETS_CLIENT_EMAIL",
                "INTEGRATION_GOOGLE_SHEETS_PRIVATE_KEY",
            ],
            optionalKeys: ["INTEGRATION_GOOGLE_SHEETS_SPREADSHEET_ID"],
        },
        notes: "MVP path is import-only and typically full or cursor-based sheet reads.",
    },
    email_inbox: {
        provider: "email_inbox",
        authStrategy: "basic_auth",
        endpoints: {
            timeoutMs: 30000,
        },
        credentials: {
            requiredKeys: [
                "INTEGRATION_EMAIL_HOST",
                "INTEGRATION_EMAIL_USERNAME",
                "INTEGRATION_EMAIL_PASSWORD",
            ],
            optionalKeys: ["INTEGRATION_EMAIL_PORT", "INTEGRATION_EMAIL_MAILBOX"],
        },
        notes: "Inbox connector is scoped to import and monitoring workflows, not outbound email delivery.",
    },
    yield: {
        provider: "yield",
        authStrategy: "service_account",
        endpoints: {
            timeoutMs: 30000,
        },
        credentials: {
            requiredKeys: ["INTEGRATION_YIELD_PROJECT_ID"],
            optionalKeys: ["INTEGRATION_YIELD_REGION"],
        },
    },
    perfios: {
        provider: "perfios",
        authStrategy: "api_key",
        endpoints: {
            timeoutMs: 30000,
        },
        credentials: {
            requiredKeys: ["INTEGRATION_PERFIOS_API_KEY"],
            optionalKeys: ["INTEGRATION_PERFIOS_BASE_URL"],
        },
        notes: "Perfios remains an adapter contract until tenant credentials and payload guarantees are available.",
    },
};
//# sourceMappingURL=framework.js.map
