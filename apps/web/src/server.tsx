import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Dashboard,
  type CollectionsCallFilterInput,
  type CollectionsEmailFilterInput,
  type DashboardPage,
  type InvoiceFilterInput,
  type OnboardingImportStatus,
  type TaskFilterInput,
} from "./app/dashboard.js";
import {
  loadIntegrationInspectorPageData,
  loadIntegrationPortalData,
} from "./app/integration-portal-data.js";
import {
  ClientConnectAccessDeniedPage,
  ClientConnectInvitePage,
  type ClientConnectInviteData,
  IntegrationInspectorPage,
  IntegrationPortalPage,
} from "./app/integration-portal.js";
import {
  loadOperatorConsoleData,
  loadQuickBooksConnectViewState,
  loadSapBusinessOneConnectViewState,
} from "./app/data.js";
import type { CallInboxFilters, InvoiceIndexEntry } from "@o2c/contracts";
import type { OperatorConsoleData } from "./app/data.js";

export async function renderDashboardHtml(
  pathname = "/",
  options?: {
    cashAppTab?: string | undefined;
    analyticsTrend?: "weekly" | "monthly" | undefined;
    homeCalendarDate?: string | undefined;
    taskFilters?: TaskFilterInput | undefined;
    invoiceFilters?: InvoiceFilterInput | undefined;
    customerId?: string | undefined;
    customerTab?: string | undefined;
    invoiceNumber?: string | undefined;
    odooConnectState?: string | undefined;
    odooConnectError?: string | undefined;
    emailConnectError?: string | undefined;
    emailConnected?: string | undefined;
    emailSender?: string | undefined;
    quickbooksStatus?: string | undefined;
    quickbooksMessage?: string | undefined;
    quickbooksCompany?: string | undefined;
    sapStatus?: string | undefined;
    sapMessage?: string | undefined;
    sapCompany?: string | undefined;
    sapTestStatus?: string | undefined;
    sapTestMessage?: string | undefined;
    inboxSenderIdentityId?: string | undefined;
    inboxThreadId?: string | undefined;
    inboxReplyStatus?: string | undefined;
    inboxReplyError?: string | undefined;
    collectionsComposeStatus?: string | undefined;
    collectionsComposeError?: string | undefined;
    collectionsComposeDraftComposeId?: string | undefined;
    collectionsComposeDraftGenerator?: string | undefined;
    collectionsComposeDraftSubject?: string | undefined;
    collectionsComposeDraftBody?: string | undefined;
    collectionsComposeDraftAttachments?: string[] | undefined;
    taskComposeStatus?: string | undefined;
    taskComposeError?: string | undefined;
    taskInvoiceAttachmentStatus?: string | undefined;
    taskInvoiceAttachmentError?: string | undefined;
    taskComposeDraftComposeId?: string | undefined;
    taskComposeDraftGenerator?: string | undefined;
    taskComposeDraftSubject?: string | undefined;
    taskComposeDraftBody?: string | undefined;
    taskComposeDraftNote?: string | undefined;
    onboardingImportStatus?: OnboardingImportStatus | undefined;
    controlCenterTab?: "workflows" | "email-templates" | "call-agent" | "config" | undefined;
    controlCenterExpandedWorkflowId?: string | undefined;
    controlCenterSelectedTemplateId?: string | undefined;
    controlCenterTemplateSearch?: string | undefined;
    controlCenterActionStatus?: "success" | "error" | undefined;
    controlCenterActionMessage?: string | undefined;
    controlCenterEnrollModalWorkflowId?: string | undefined;
    controlCenterStageModalWorkflowId?: string | undefined;
    controlCenterStageModalChannel?: "email" | "call" | "sms" | undefined;
    controlCenterStageModalTemplateMode?: "pre_saved_template" | "ai_generated" | undefined;
    collectionsTab?: "email" | "call-inbox" | undefined;
    collectionsEmailFilters?: CollectionsEmailFilterInput | undefined;
    collectionsCallFilters?: CollectionsCallFilterInput | undefined;
    accessControlSelectedUserId?: string | undefined;
    customerCallStatus?: "started" | "failed" | undefined;
    customerCallMessage?: string | undefined;
    customerEmailStatus?: "sent" | "approval_needed" | "failed" | undefined;
    customerEmailMessage?: string | undefined;
  },
): Promise<string> {
  const page = pageFromPath(pathname);
  const consoleData = await loadOperatorConsoleData({
    odooConnectState: options?.odooConnectState,
    odooConnectError: options?.odooConnectError,
    emailConnectError: options?.emailConnectError,
    emailConnected: options?.emailConnected,
    emailSender: options?.emailSender,
    page,
    customerId: options?.customerId,
    inboxSenderIdentityId: options?.inboxSenderIdentityId,
    inboxThreadId: options?.inboxThreadId,
    inboxReplyStatus: options?.inboxReplyStatus,
    inboxReplyError: options?.inboxReplyError,
    collectionsComposeStatus: options?.collectionsComposeStatus,
    collectionsComposeError: options?.collectionsComposeError,
    collectionsComposeDraftComposeId: options?.collectionsComposeDraftComposeId,
    collectionsComposeDraftGenerator: options?.collectionsComposeDraftGenerator,
    collectionsComposeDraftSubject: options?.collectionsComposeDraftSubject,
    collectionsComposeDraftBody: options?.collectionsComposeDraftBody,
    collectionsComposeDraftAttachments: options?.collectionsComposeDraftAttachments,
    taskComposeStatus: options?.taskComposeStatus,
    taskComposeError: options?.taskComposeError,
    taskInvoiceAttachmentStatus: options?.taskInvoiceAttachmentStatus,
    taskInvoiceAttachmentError: options?.taskInvoiceAttachmentError,
    taskComposeDraftComposeId: options?.taskComposeDraftComposeId,
    taskComposeDraftGenerator: options?.taskComposeDraftGenerator,
    taskComposeDraftSubject: options?.taskComposeDraftSubject,
    taskComposeDraftBody: options?.taskComposeDraftBody,
    taskComposeDraftNote: options?.taskComposeDraftNote,
    collectionsTab: options?.collectionsTab,
    collectionsCallFilters: toCallInboxDataFilters(options?.collectionsCallFilters),
    controlCenterSelectedTemplateId: options?.controlCenterSelectedTemplateId,
    invoiceNumber: options?.invoiceNumber,
    accessControlSelectedUserId: options?.accessControlSelectedUserId,
  });
  const quickbooksConnect = await loadQuickBooksConnectViewState({
    quickbooksStatus: options?.quickbooksStatus,
    quickbooksMessage: options?.quickbooksMessage,
    quickbooksCompany: options?.quickbooksCompany,
  });
  const sapBusinessOneConnect = await loadSapBusinessOneConnectViewState({
    sapStatus: options?.sapStatus,
    sapMessage: options?.sapMessage,
    sapCompany: options?.sapCompany,
    sapTestStatus: options?.sapTestStatus,
    sapTestMessage: options?.sapTestMessage,
  });

  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>O2C Operator Console MVP</title>
      </head>
      <body style={{ margin: 0 }}>
        <Dashboard
          data={consoleData}
          page={page}
          pathname={pathname}
          {...(options?.cashAppTab ? { cashAppTab: options.cashAppTab } : {})}
          {...(options?.analyticsTrend ? { analyticsTrend: options.analyticsTrend } : {})}
          {...(options?.homeCalendarDate ? { homeCalendarDate: options.homeCalendarDate } : {})}
          {...(options?.taskFilters ? { taskFilters: options.taskFilters } : {})}
          {...(options?.invoiceFilters ? { invoiceFilters: options.invoiceFilters } : {})}
          {...(options?.customerId ? { customerId: options.customerId } : {})}
          {...(options?.customerTab ? { customerTab: options.customerTab } : {})}
          odooConnect={consoleData.odooConnect}
          odooConnectError={consoleData.odooConnectError}
          {...(consoleData.emailConnectError
            ? { emailConnectError: consoleData.emailConnectError }
            : {})}
          {...(consoleData.emailConnectStatus
            ? { emailConnectStatus: consoleData.emailConnectStatus }
            : {})}
          {...(options?.onboardingImportStatus
            ? { onboardingImportStatus: options.onboardingImportStatus }
            : {})}
          {...(options?.controlCenterTab
            ? { controlCenterTab: options.controlCenterTab }
            : {})}
          {...(options?.controlCenterExpandedWorkflowId
            ? { controlCenterExpandedWorkflowId: options.controlCenterExpandedWorkflowId }
            : {})}
          {...(options?.controlCenterSelectedTemplateId
            ? { controlCenterSelectedTemplateId: options.controlCenterSelectedTemplateId }
            : {})}
          {...(options?.controlCenterTemplateSearch
            ? { controlCenterTemplateSearch: options.controlCenterTemplateSearch }
            : {})}
          {...(options?.controlCenterActionStatus && options?.controlCenterActionMessage
            ? {
                controlCenterActionStatus: options.controlCenterActionStatus,
                controlCenterActionMessage: options.controlCenterActionMessage,
              }
            : {})}
          {...(options?.controlCenterEnrollModalWorkflowId
            ? { controlCenterEnrollModalWorkflowId: options.controlCenterEnrollModalWorkflowId }
            : {})}
          {...(options?.controlCenterStageModalWorkflowId
            ? { controlCenterStageModalWorkflowId: options.controlCenterStageModalWorkflowId }
            : {})}
          {...(options?.controlCenterStageModalChannel
            ? { controlCenterStageModalChannel: options.controlCenterStageModalChannel }
            : {})}
          {...(options?.controlCenterStageModalTemplateMode
            ? { controlCenterStageModalTemplateMode: options.controlCenterStageModalTemplateMode }
            : {})}
          {...(options?.collectionsTab ? { collectionsTab: options.collectionsTab } : {})}
          {...(options?.collectionsEmailFilters ? { collectionsEmailFilters: options.collectionsEmailFilters } : {})}
          {...(options?.collectionsCallFilters ? { collectionsCallFilters: options.collectionsCallFilters } : {})}
          {...(options?.customerCallStatus ? { customerCallStatus: options.customerCallStatus } : {})}
          {...(options?.customerCallMessage ? { customerCallMessage: options.customerCallMessage } : {})}
          {...(options?.customerEmailStatus ? { customerEmailStatus: options.customerEmailStatus } : {})}
          {...(options?.customerEmailMessage ? { customerEmailMessage: options.customerEmailMessage } : {})}
          {...(quickbooksConnect ? { quickbooksConnect } : {})}
          {...(sapBusinessOneConnect ? { sapBusinessOneConnect } : {})}
        />
        <script dangerouslySetInnerHTML={{ __html: buildDashboardBehaviorScript() }} />
      </body>
    </html>
  );

  return `<!DOCTYPE html>${html}`;
}

function toCallInboxDataFilters(filters?: CollectionsCallFilterInput): CallInboxFilters | undefined {
  if (!filters) {
    return undefined;
  }
  const output: CallInboxFilters = {};
  if (filters.direction && filters.direction !== "all") {
    output.direction = filters.direction;
  }
  if (filters.status && filters.status !== "all") {
    output.status = filters.status;
  }
  if (filters.voicemail === "yes") {
    output.voicemail = true;
  } else if (filters.voicemail === "no") {
    output.voicemail = false;
  }
  if (filters.customer?.trim() && filters.customer !== "all") {
    output.customer = filters.customer.trim();
  }
  if (filters.classification?.trim() && filters.classification !== "all") {
    output.classification = filters.classification.trim();
  }
  if (filters.workflow?.trim() && filters.workflow !== "all") {
    output.workflow = filters.workflow.trim();
  }
  const date = filters.date?.trim();
  if (date) {
    output.dateFrom = date;
    output.dateTo = date;
  } else {
    if (filters.dateFrom?.trim()) {
      output.dateFrom = filters.dateFrom.trim();
    }
    if (filters.dateTo?.trim()) {
      output.dateTo = filters.dateTo.trim();
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

export async function renderCustomerStatementHtml(options: {
  customerId?: string | undefined;
  asOf?: string | undefined;
}): Promise<string> {
  const asOf = options.asOf?.trim() || new Date().toISOString().slice(0, 10);
  const consoleData = await loadOperatorConsoleData({
    page: "customers",
    customerId: options.customerId,
  });
  const selectedCustomer =
    consoleData.customerIndex.find((item) => item.profileId === options.customerId) ??
    consoleData.customerIndex.find((item) => item.billingAccountId === options.customerId) ??
    consoleData.customerIndex[0];

  return renderCustomerStatementHtmlFromData({
    data: consoleData,
    customerId: selectedCustomer?.profileId,
    asOf,
  });
}

export function renderCustomerStatementHtmlFromData(input: {
  data: OperatorConsoleData;
  customerId?: string | undefined;
  asOf: string;
}) {
  const statementBody = input.customerId
    ? renderToStaticMarkup(
        <CustomerStatementPage data={input.data} customerId={input.customerId} asOf={input.asOf} />,
      )
    : renderToStaticMarkup(<CustomerStatementMissingPage />);

  return `<!DOCTYPE html>${statementBody}`;
}

function buildDashboardBehaviorScript() {
  return `
    (() => {
      const parseTemplateSampleVariables = (editor) => {
        if (!(editor instanceof HTMLElement)) {
          return {};
        }
        try {
          const raw = editor.getAttribute('data-template-sample-variables');
          if (!raw) {
            return {};
          }
          const parsed = JSON.parse(raw);
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          return {};
        }
      };

      const applyTemplatePreviewConditionals = (value, sampleVariables) =>
        value.replace(/\\{%\\s*if\\s+num_upcoming_invoices\\s*>\\s*0\\s*%\\}([\\s\\S]*?)\\{%\\s*endif\\s*%\\}/gi, (_match, content) =>
          Number(sampleVariables.num_upcoming_invoices || '0') > 0 ? content : '',
        );

      const applyTemplatePreviewVariables = (value, sampleVariables) =>
        [
          ['Customer Name', sampleVariables.customer_name],
          ['Customer Company Name', sampleVariables.customer_company_name],
          ['Sender Company Name', sampleVariables.sender_company_name],
          ['Overdue Invoices Summary', sampleVariables.overdue_invoice_summary],
          ['Overdue Balance', sampleVariables.overdue_balance],
          ['Upcoming Balance', sampleVariables.upcoming_balance],
          ['Total Account Balance', sampleVariables.total_account_balance],
          ['Payment URL', sampleVariables.payment_url],
        ].reduce(
          (output, [from, to]) => output.replaceAll(from, to || from),
          applyTemplatePreviewConditionals(value, sampleVariables)
          .replace(/\\{\\{\\s*([a-zA-Z0-9_]+)\\s*\\}\\}/g, (match, key) => sampleVariables[key] || match)
        )
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();

      const renderTemplatePreviewBody = (container, body) => {
        if (!(container instanceof HTMLElement)) {
          return;
        }
        const fragments = body.split('\\n').map((paragraph) => {
          const element = document.createElement('p');
          const trimmed = paragraph.trim();
          if (/^https?:\\/\\/\\S+$/i.test(trimmed)) {
            const link = document.createElement('a');
            link.href = trimmed;
            link.textContent = trimmed;
            element.appendChild(link);
            return element;
          }
          element.textContent = paragraph;
          return element;
        });
        container.replaceChildren(...fragments);
      };

      const syncTemplateDrawerPreview = (target) => {
        const editor = target.closest('[data-template-editor]');
        if (!(editor instanceof HTMLFormElement)) {
          return;
        }
        const sampleVariables = parseTemplateSampleVariables(editor);
        const title = document.querySelector('[data-template-drawer-title]');
        const previewSubject = document.querySelector('[data-template-preview-subject]');
        const previewBody = document.querySelector('[data-template-preview-body]');
        const nameInput = editor.querySelector('[data-template-name-input]');
        const subjectInput = editor.querySelector('[data-template-subject-input]');
        const bodyInput = editor.querySelector('[data-template-body-input]');

        if (title instanceof HTMLElement && nameInput instanceof HTMLInputElement) {
          title.textContent = nameInput.value.trim() || 'New Template';
        }
        if (previewSubject instanceof HTMLElement && subjectInput instanceof HTMLInputElement) {
          previewSubject.textContent = applyTemplatePreviewVariables(subjectInput.value, sampleVariables);
        }
        if (previewBody instanceof HTMLElement && bodyInput instanceof HTMLTextAreaElement) {
          renderTemplatePreviewBody(previewBody, applyTemplatePreviewVariables(bodyInput.value, sampleVariables));
        }
      };

      const insertTemplateVariable = (button) => {
        const picker = button.closest('[data-template-variable-picker]');
        const editor = button.closest('[data-template-editor]');
        if (!(picker instanceof HTMLElement) || !(editor instanceof HTMLFormElement)) {
          return;
        }
        const activeElement = document.activeElement;
        const targets = Array.from(editor.querySelectorAll('[data-template-variable-target]'));
        const preferredTarget = targets.find((element) => element === activeElement);
        const fallbackTarget = editor.querySelector('[data-template-body-input]') || targets[0];
        const target = preferredTarget || fallbackTarget;
        const variableValue = button.getAttribute('data-template-variable-insert') || '';

        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) || !variableValue) {
          return;
        }

        const selectionStart = target.selectionStart ?? target.value.length;
        const selectionEnd = target.selectionEnd ?? target.value.length;
        target.setRangeText(variableValue, selectionStart, selectionEnd, 'end');
        target.focus();
        target.dispatchEvent(new Event('input', { bubbles: true }));
      };

      const closeTemplateVariableMenus = () => {
        document.querySelectorAll('[data-template-variable-picker]').forEach((picker) => {
          if (!(picker instanceof HTMLElement)) {
            return;
          }
          picker.classList.remove('is-open');
          const toggle = picker.querySelector('[data-template-variable-toggle]');
          if (toggle instanceof HTMLButtonElement) {
            toggle.setAttribute('aria-expanded', 'false');
          }
        });
      };

      const updateStageModalState = () => {
        const modal = document.querySelector('.control-center-stage-modal');
        if (!(modal instanceof HTMLElement)) {
          return;
        }
        const comparator = modal.querySelector('[data-stage-trigger-comparator]');
        const builder = modal.querySelector('[data-stage-trigger-builder]');
        const offsetInput = modal.querySelector('[data-stage-offset-input]');
        const templateSelect = modal.querySelector('[data-stage-template-select]');
        const submit = modal.querySelector('[data-stage-submit]');
        const usingSavedTemplate = Boolean(modal.querySelector('input[name="templateMode"][value="pre_saved_template"]'));

        if (builder instanceof HTMLElement && comparator instanceof HTMLSelectElement) {
          const isOnDueDate = comparator.value === 'due_today';
          builder.classList.toggle('is-on-due-date', isOnDueDate);
          if (isOnDueDate && offsetInput instanceof HTMLInputElement) {
            offsetInput.value = '0';
          }
        }

        if (submit instanceof HTMLButtonElement) {
          const canSubmit =
            !usingSavedTemplate ||
            (templateSelect instanceof HTMLSelectElement && templateSelect.value.trim().length > 0);
          submit.disabled = !canSubmit;
        }
      };

      const updateEnrollModalState = () => {
        const modal = document.querySelector('.control-center-enroll-modal');
        if (!(modal instanceof HTMLElement)) {
          return;
        }
        const searchInput = modal.querySelector('.control-center-enroll-search-input');
        const selectAll = modal.querySelector('.control-center-enroll-modal-select-all');
        const options = Array.from(modal.querySelectorAll('.control-center-enroll-option'));
        const visibleOptions = options.filter((option) => !option.classList.contains('is-hidden'));
        const visibleCheckboxes = visibleOptions
          .map((option) => option.querySelector('.control-center-enroll-option-checkbox'))
          .filter((checkbox) => checkbox instanceof HTMLInputElement);

        if (searchInput instanceof HTMLInputElement) {
          const query = searchInput.value.trim().toLowerCase();
          options.forEach((option) => {
            const haystack = option.getAttribute('data-customer-search') ?? '';
            option.classList.toggle('is-hidden', query.length > 0 && !haystack.includes(query));
          });
        }

        if (selectAll instanceof HTMLInputElement) {
          const filteredOptions = options.filter((option) => !option.classList.contains('is-hidden'));
          const filteredCheckboxes = filteredOptions
            .map((option) => option.querySelector('.control-center-enroll-option-checkbox'))
            .filter((checkbox) => checkbox instanceof HTMLInputElement);
          const checkedCount = filteredCheckboxes.filter((checkbox) => checkbox.checked).length;
          selectAll.checked = filteredCheckboxes.length > 0 && checkedCount === filteredCheckboxes.length;
          selectAll.indeterminate = checkedCount > 0 && checkedCount < filteredCheckboxes.length;
        }
      };

      const updateGroupState = (workflowId) => {
        const selectAll = document.querySelector('.control-center-select-all-checkbox[data-workflow-id="' + workflowId + '"]');
        const checkboxes = Array.from(document.querySelectorAll('.control-center-enrollment-checkbox[data-workflow-id="' + workflowId + '"]'));
        if (!(selectAll instanceof HTMLInputElement) || checkboxes.length === 0) {
          return;
        }
        const checkedCount = checkboxes.filter((checkbox) => checkbox instanceof HTMLInputElement && checkbox.checked).length;
        selectAll.checked = checkedCount > 0 && checkedCount === checkboxes.length;
        selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
      };

      const updateEmailBody = (button) => {
        const command = button.getAttribute('data-task-format-command') || button.getAttribute('data-email-format-command');
        const form = button.closest('form');
        const editor = form instanceof HTMLFormElement ? form.querySelector('[data-task-email-body], [data-email-body]') : undefined;
        if (!(editor instanceof HTMLTextAreaElement) || !command) {
          return;
        }

        const start = editor.selectionStart ?? editor.value.length;
        const end = editor.selectionEnd ?? editor.value.length;
        const selected = editor.value.slice(start, end);
        const fallback = selected || 'text';
        let nextValue = fallback;
        if (command === 'bold') {
          nextValue = '**' + fallback + '**';
        } else if (command === 'italic') {
          nextValue = '_' + fallback + '_';
        } else if (command === 'underline') {
          nextValue = '<u>' + fallback + '</u>';
        } else if (command === 'link') {
          const href = window.prompt('Link URL');
          if (!href || !href.trim()) {
            editor.focus();
            return;
          }
          nextValue = '[' + fallback + '](' + href.trim() + ')';
        } else {
          return;
        }

        editor.setRangeText(nextValue, start, end, 'select');
        editor.focus();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      };

      const applyEmailTemplate = (button) => {
        const form = button.closest('form');
        if (!(form instanceof HTMLFormElement)) {
          return;
        }
        const select = form.querySelector('[data-email-template-select], [data-collections-email-template-select]');
        if (!(select instanceof HTMLSelectElement) || !select.value) {
          return;
        }
        const selectedOption = select.selectedOptions[0];
        const subject = selectedOption?.getAttribute('data-template-subject') || '';
        const body = selectedOption?.getAttribute('data-template-body') || '';
        const subjectInput = form.querySelector('input[name="subjectLine"]');
        const bodyInput = form.querySelector('textarea[name="bodyPreview"]');
        if (subjectInput instanceof HTMLInputElement && subject && !subjectInput.readOnly) {
          subjectInput.value = subject;
          subjectInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (bodyInput instanceof HTMLTextAreaElement && body) {
          bodyInput.value = body;
          bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
          bodyInput.focus();
        }
      };

      const TASK_SEARCH_HISTORY_KEY = 'yield-aros.tasks.search-history.v1';
      const readTaskSearchHistory = () => {
        try {
          const parsed = JSON.parse(window.localStorage.getItem(TASK_SEARCH_HISTORY_KEY) || '[]');
          return Array.isArray(parsed)
            ? parsed.filter((item) => typeof item === 'string' && item.trim().length > 0).slice(0, 8)
            : [];
        } catch {
          return [];
        }
      };
      const writeTaskSearchHistory = (history) => {
        try {
          window.localStorage.setItem(TASK_SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, 8)));
        } catch {
          // Browser storage can be unavailable in private or locked-down contexts.
        }
      };
      const renderTaskSearchHistory = () => {
        const list = document.querySelector('[data-task-search-history-list]');
        if (!(list instanceof HTMLDataListElement)) {
          return;
        }
        const options = readTaskSearchHistory().map((term) => {
          const option = document.createElement('option');
          option.value = term;
          return option;
        });
        list.replaceChildren(...options);
      };
      const saveTaskSearchTerm = (form) => {
        const input = form.querySelector('[data-task-search-input]');
        if (!(input instanceof HTMLInputElement)) {
          return;
        }
        const term = input.value.trim();
        if (!term) {
          return;
        }
        const nextHistory = [term, ...readTaskSearchHistory().filter((item) => item.toLowerCase() !== term.toLowerCase())];
        writeTaskSearchHistory(nextHistory);
        renderTaskSearchHistory();
      };

      const updateAnalyticsTrendState = (trend) => {
        document.querySelectorAll('[data-analytics-trend-link]').forEach((link) => {
          if (!(link instanceof HTMLAnchorElement)) {
            return;
          }
          const isSelected = link.getAttribute('data-analytics-trend-value') === trend;
          link.classList.toggle('is-active', isSelected);
          link.setAttribute('aria-selected', isSelected ? 'true' : 'false');
          if (isSelected) {
            link.setAttribute('aria-current', 'page');
          } else {
            link.removeAttribute('aria-current');
          }
        });
      };

      const swapAnalyticsTrend = async (link) => {
        const href = link.getAttribute('href');
        const trend = link.getAttribute('data-analytics-trend-value');
        const currentPage = link.closest('[data-analytics-page]');
        if (!href || !trend || !(currentPage instanceof HTMLElement)) {
          return false;
        }

        updateAnalyticsTrendState(trend);
        currentPage.classList.add('is-loading');
        currentPage.setAttribute('aria-busy', 'true');

        try {
          const targetUrl = new URL(href, window.location.origin);
          const response = await fetch(targetUrl.toString(), {
            headers: {
              accept: 'text/html',
              'x-requested-with': 'fetch',
            },
          });
          if (!response.ok) {
            return false;
          }
          const html = await response.text();
          const parsed = new DOMParser().parseFromString(html, 'text/html');
          const nextPage = parsed.querySelector('[data-analytics-page]');
          if (!(nextPage instanceof HTMLElement)) {
            return false;
          }
          currentPage.replaceWith(document.importNode(nextPage, true));
          window.history.pushState({ analyticsTrend: trend }, '', targetUrl.toString());
          return true;
        } catch {
          return false;
        } finally {
          if (currentPage.isConnected) {
            currentPage.classList.remove('is-loading');
            currentPage.removeAttribute('aria-busy');
          }
        }
      };

      document.addEventListener('change', (event) => {
        const target = event.target;
        if (target instanceof HTMLSelectElement && target.hasAttribute('data-stage-trigger-comparator')) {
          updateStageModalState();
          return;
        }
        if (target instanceof HTMLSelectElement && target.hasAttribute('data-stage-template-select')) {
          updateStageModalState();
          return;
        }
        if (target instanceof HTMLInputElement && target.classList.contains('control-center-enroll-modal-select-all')) {
          const modal = target.closest('.control-center-enroll-modal');
          if (modal instanceof HTMLElement) {
            modal
              .querySelectorAll('.control-center-enroll-option:not(.is-hidden) .control-center-enroll-option-checkbox')
              .forEach((checkbox) => {
                if (checkbox instanceof HTMLInputElement) {
                  checkbox.checked = target.checked;
                }
              });
            updateEnrollModalState();
          }
          return;
        }
        if (target instanceof HTMLInputElement && target.classList.contains('control-center-enroll-option-checkbox')) {
          updateEnrollModalState();
          return;
        }
        if (target instanceof HTMLInputElement && target.hasAttribute('data-task-search-input')) {
          const value = target.value.trim();
          if (value && readTaskSearchHistory().includes(value)) {
            const form = target.closest('form');
            if (form instanceof HTMLFormElement) {
              form.requestSubmit();
            }
          }
          return;
        }
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        const workflowId = target.dataset.workflowId;
        if (!workflowId) {
          return;
        }
        if (target.classList.contains('control-center-select-all-checkbox')) {
          document
            .querySelectorAll('.control-center-enrollment-checkbox[data-workflow-id="' + workflowId + '"]')
            .forEach((checkbox) => {
              if (checkbox instanceof HTMLInputElement) {
                checkbox.checked = target.checked;
              }
            });
          updateGroupState(workflowId);
          return;
        }
        if (target.classList.contains('control-center-enrollment-checkbox')) {
          updateGroupState(workflowId);
        }
      });

      document.addEventListener('input', (event) => {
        const target = event.target;
        if (target instanceof HTMLElement && target.closest('[data-template-editor]')) {
          syncTemplateDrawerPreview(target);
        }
        if (target instanceof HTMLInputElement && target.classList.contains('control-center-enroll-search-input')) {
          updateEnrollModalState();
        }
      });

      document.addEventListener('submit', (event) => {
        const form = event.target;
        if (form instanceof HTMLFormElement && form.classList.contains('collections-email-compose-form')) {
          const submitter = event.submitter;
          const submitButton = submitter instanceof HTMLButtonElement ? submitter : form.querySelector('button[type="submit"]');
          if (submitButton instanceof HTMLButtonElement) {
            submitButton.disabled = true;
            const action = submitButton.getAttribute('formaction') || form.getAttribute('action') || '';
            submitButton.textContent = action.includes('prepare-attachment') ? 'Attaching...' : 'Sending...';
          }
          return;
        }
        if (form instanceof HTMLFormElement && form.classList.contains('task-filter-bar')) {
          saveTaskSearchTerm(form);
          return;
        }
        if (form instanceof HTMLFormElement && form.matches('[data-control-center-action-form]')) {
          const submitter = event.submitter;
          const submitButton = submitter instanceof HTMLButtonElement ? submitter : form.querySelector('button[type="submit"]');
          if (submitButton instanceof HTMLButtonElement) {
            const loadingLabel = submitButton.getAttribute('data-loading-label') || 'Working...';
            submitButton.disabled = true;
            submitButton.textContent = loadingLabel;
          }
          return;
        }
        if (!(form instanceof HTMLFormElement) || !form.matches('[data-customer-call-form]')) {
          return;
        }
        const submitButton = form.querySelector('[data-loading-label]');
        if (!(submitButton instanceof HTMLButtonElement)) {
          return;
        }
        const loadingLabel = submitButton.getAttribute('data-loading-label') || 'Working...';
        submitButton.disabled = true;
        const label = submitButton.querySelector('span');
        if (label instanceof HTMLElement) {
          label.textContent = loadingLabel;
          return;
        }
        submitButton.textContent = loadingLabel;
      });

      document.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }
        const analyticsTrendLink = target.closest('[data-analytics-trend-link]');
        if (analyticsTrendLink instanceof HTMLAnchorElement) {
          event.preventDefault();
          void swapAnalyticsTrend(analyticsTrendLink).then((ok) => {
            if (!ok) {
              window.location.href = analyticsTrendLink.href;
            }
          });
          return;
        }
        const variableInsertButton = target.closest('[data-template-variable-insert]');
        if (variableInsertButton instanceof HTMLButtonElement) {
          event.preventDefault();
          insertTemplateVariable(variableInsertButton);
          closeTemplateVariableMenus();
          return;
        }
        const variableToggle = target.closest('[data-template-variable-toggle]');
        if (variableToggle instanceof HTMLButtonElement) {
          event.preventDefault();
          const picker = variableToggle.closest('[data-template-variable-picker]');
          if (!(picker instanceof HTMLElement)) {
            return;
          }
          const shouldOpen = !picker.classList.contains('is-open');
          closeTemplateVariableMenus();
          picker.classList.toggle('is-open', shouldOpen);
          variableToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
          return;
        }
        if (!target.closest('[data-template-variable-picker]')) {
          closeTemplateVariableMenus();
        }
        const taskFormatButton = target.closest('[data-task-format-command], [data-email-format-command]');
        if (taskFormatButton instanceof HTMLButtonElement) {
          event.preventDefault();
          updateEmailBody(taskFormatButton);
          return;
        }
        const clearTaskSearchHistory = target.closest('[data-task-search-clear-history]');
        if (clearTaskSearchHistory instanceof HTMLButtonElement) {
          event.preventDefault();
          writeTaskSearchHistory([]);
          renderTaskSearchHistory();
          const input = document.querySelector('[data-task-search-input]');
          if (input instanceof HTMLInputElement) {
            input.focus();
          }
          return;
        }
        const taskDeleteButton = target.closest('[data-confirm-message]');
        if (taskDeleteButton instanceof HTMLButtonElement) {
          const message = taskDeleteButton.getAttribute('data-confirm-message') || 'Delete this task?';
          if (!window.confirm(message)) {
            event.preventDefault();
            event.stopPropagation();
          }
          return;
        }
        const collectionsTemplateButton = target.closest('[data-email-template-apply], [data-collections-email-template-apply]');
        if (collectionsTemplateButton instanceof HTMLButtonElement) {
          event.preventDefault();
          applyEmailTemplate(collectionsTemplateButton);
          return;
        }
        const enrollmentToggle = target.closest('[data-enrollment-toggle]');
        if (enrollmentToggle instanceof HTMLButtonElement) {
          event.preventDefault();
          const targetId = enrollmentToggle.getAttribute('data-enrollment-target');
          if (!targetId) {
            return;
          }
          const panel = document.getElementById(targetId);
          if (!(panel instanceof HTMLElement)) {
            return;
          }
          const isCollapsed = panel.classList.toggle('is-collapsed');
          enrollmentToggle.setAttribute('aria-expanded', String(!isCollapsed));
          return;
        }
        const toggleButton = target.closest('[data-workflow-toggle-button]');
        if (!(toggleButton instanceof HTMLButtonElement)) {
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        const form = toggleButton.closest('[data-workflow-toggle-form]');
        if (form instanceof HTMLFormElement) {
          form.requestSubmit();
        }
      });

      document.addEventListener('focusin', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
          return;
        }
        if (!target.hasAttribute('data-template-variable-target')) {
          return;
        }
        const editor = target.closest('[data-template-editor]');
        if (!(editor instanceof HTMLFormElement)) {
          return;
        }
        editor.querySelectorAll('[data-template-variable-target]').forEach((element) => {
          if (element instanceof HTMLElement) {
            element.removeAttribute('data-template-variable-active');
          }
        });
        target.setAttribute('data-template-variable-active', 'true');
      });

      document
        .querySelectorAll('.control-center-select-all-checkbox[data-workflow-id]')
        .forEach((checkbox) => {
          if (checkbox instanceof HTMLInputElement && checkbox.dataset.workflowId) {
            updateGroupState(checkbox.dataset.workflowId);
          }
        });

      updateStageModalState();
      updateEnrollModalState();
      document.querySelectorAll('[data-template-editor]').forEach((editor) => {
        if (editor instanceof HTMLElement) {
          syncTemplateDrawerPreview(editor);
        }
      });
      renderTaskSearchHistory();
    })();
  `;
}

function CustomerStatementMissingPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Customer statement unavailable</title>
      </head>
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f5f7fb", color: "#13233b" }}>
        <main style={{ maxWidth: 960, margin: "48px auto", padding: "0 24px" }}>
          <section style={{ background: "#fff", borderRadius: 20, padding: 32, border: "1px solid #d9e1ec" }}>
            <h1 style={{ marginTop: 0 }}>Statement of account unavailable</h1>
            <p>No customer was selected, so Yield could not build a statement preview.</p>
          </section>
        </main>
      </body>
    </html>
  );
}

function CustomerStatementPage(input: { data: OperatorConsoleData; customerId: string; asOf: string }) {
  const customer =
    input.data.customerIndex.find((item) => item.profileId === input.customerId) ??
    input.data.customerIndex.find((item) => item.billingAccountId === input.customerId);

  if (!customer) {
    return <CustomerStatementMissingPage />;
  }

  const liveDetail =
    input.data.liveCustomerProfileDetail &&
    input.data.customerProfile.profileId === customer.profileId
      ? input.data.liveCustomerProfileDetail
      : undefined;
  const invoices = input.data.invoiceIndex.invoices
    .filter((invoice) => invoiceMatchesCustomer(invoice, customer))
    .filter((invoice) => invoice.openAmountCents > 0)
    .filter((invoice) => invoiceFallsWithinStatementCutoff(invoice, input.asOf))
    .sort((left, right) => (left.dueDate ?? left.issuedAt ?? "").localeCompare(right.dueDate ?? right.issuedAt ?? ""));
  const statementNumber = buildStatementNumber(customer.profileId, input.asOf);
  const issuerProfile = deriveIssuerProfile(invoices);
  const addressSummary = customerAddressSummary(liveDetail);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`SOA - ${customer.canonicalName}`}</title>
      </head>
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#eef3f8", color: "#13233b" }}>
        <main style={{ maxWidth: 1120, margin: "24px auto", padding: "0 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <a
              href={`/customers?customer=${encodeURIComponent(customer.profileId)}`}
              style={{ color: "#5f7491", textDecoration: "none", fontWeight: 700 }}
            >
              ← Back to customer
            </a>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <form method="get" action="/customers/soa" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input type="hidden" name="customer" value={customer.profileId} />
                <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#5f7491", fontWeight: 700 }}>
                  As of
                  <input
                    type="date"
                    name="asOf"
                    defaultValue={input.asOf}
                    style={{
                      border: "1px solid #d7e0eb",
                      background: "#fff",
                      color: "#13233b",
                      borderRadius: 12,
                      padding: "10px 12px",
                      font: "inherit",
                    }}
                  />
                </label>
                <button type="submit" style={statementActionButtonStyle()}>
                  Refresh statement
                </button>
              </form>
              <button type="button" id="soa-print-button" style={statementActionButtonStyle()}>
                Print / Save PDF
              </button>
            </div>
          </div>

          <section style={{ background: "#fff", border: "1px solid #d9e1ec", borderRadius: 20, padding: 32 }}>
            <header
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 320px",
                gap: 24,
                alignItems: "start",
                marginBottom: 20,
              }}
            >
              <div>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 10 }}>
                  {issuerProfile.companyName}
                </div>
                <div style={{ color: "#5f7491", lineHeight: 1.6 }}>
                  <div>{issuerProfile.addressSummary}</div>
                  <div>{issuerProfile.contactLine}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.03em" }}>Statement of Account</div>
                <div style={{ fontSize: 26, fontWeight: 700, marginTop: 8 }}>{statementNumber}</div>
                <div style={{ color: "#5f7491", marginTop: 18 }}>Print date</div>
                <div style={{ fontWeight: 700 }}>{formatDisplayDate(input.asOf)}</div>
              </div>
            </header>

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 260px",
                border: "1px solid #ccd6e3",
                marginBottom: 22,
              }}
            >
              <div style={{ padding: 16, borderRight: "1px solid #ccd6e3" }}>
                <div style={{ fontStyle: "italic", marginBottom: 10 }}>Name and Address of Customer:</div>
                <div style={{ fontWeight: 700, fontSize: 28 }}>{customer.canonicalName}</div>
                <div style={{ marginTop: 8, color: "#334b69", whiteSpace: "pre-line" }}>{addressSummary}</div>
              </div>
              <div>
                <div style={{ padding: 16, borderBottom: "1px solid #ccd6e3" }}>
                  <div style={{ fontStyle: "italic", marginBottom: 8 }}>As of:</div>
                  <div style={{ fontWeight: 700 }}>{formatDisplayDate(input.asOf)}</div>
                </div>
                <div style={{ padding: 16 }}>
                  <div style={{ fontStyle: "italic", marginBottom: 8 }}>Terms:</div>
                  <div style={{ fontWeight: 700 }}>Pulled per invoice when available</div>
                </div>
              </div>
            </section>

            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 15 }}>
              <thead>
                <tr style={{ background: "#d9d9d9" }}>
                  {["DATE", "REFERENCE", "TERMS", "DUE DATE", "P.O./S.O.#", "AMOUNT"].map((label) => (
                    <th
                      key={label}
                      style={{
                        textAlign: label === "AMOUNT" ? "right" : "left",
                        padding: "8px 10px",
                        border: "1px solid #8b98ab",
                        fontSize: 14,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td style={statementCellStyle()}>{formatStatementDate(invoice.issuedAt ?? invoice.dueDate)}</td>
                    <td style={statementCellStyle()}>{invoice.invoiceNumber}</td>
                    <td style={statementCellStyle()}>{readInvoiceTerms(invoice)}</td>
                    <td style={statementCellStyle()}>{formatStatementDate(invoice.dueDate)}</td>
                    <td style={statementCellStyle()}>{readInvoicePoSo(invoice)}</td>
                    <td style={statementCellStyle("right")}>{formatPhpAmount(invoice.openAmountCents, invoice.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <section
              style={{
                marginTop: 20,
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 320px",
                gap: 24,
                alignItems: "start",
              }}
            >
              <div
                style={{
                  border: "1px solid #d7e0eb",
                  borderRadius: 16,
                  padding: 18,
                  background: "#f8fbff",
                }}
              >
                <h2 style={{ marginTop: 0, marginBottom: 10, fontSize: 18 }}>Current SOA generation gaps</h2>
                <ul style={{ margin: 0, paddingLeft: 18, color: "#415a77", lineHeight: 1.65 }}>
                  <li>Logo still needs a dedicated issuer asset source.</li>
                  <li>Some BC tenants may still need custom field mapping for invoice-level terms labels.</li>
                  <li>Some BC tenants may still need custom field mapping for P.O./S.O. references.</li>
                  <li>Credit memos and adjustments are not yet included in this statement.</li>
                </ul>
              </div>
              <div
                style={{
                  border: "1px solid #d7e0eb",
                  borderRadius: 16,
                  padding: 18,
                  background: "#fff",
                }}
              >
                <h2 style={{ marginTop: 0, marginBottom: 16, fontSize: 18 }}>Summary</h2>
                <div style={summaryRowStyle()}>
                  <span>Open invoices</span>
                  <strong>{String(invoices.length)}</strong>
                </div>
                <div style={summaryRowStyle()}>
                  <span>Overdue</span>
                  <strong>{customer.overdueAmount}</strong>
                </div>
                <div style={{ ...summaryRowStyle(), borderBottom: "1px solid #e4ebf3", paddingBottom: 12 }}>
                  <span>Balance</span>
                  <strong>{customer.openAmount}</strong>
                </div>
                <div style={{ ...summaryRowStyle(), paddingTop: 12 }}>
                  <span>Credit</span>
                  <strong>₱0.00</strong>
                </div>
              </div>
            </section>
          </section>
        </main>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "document.getElementById('soa-print-button')?.addEventListener('click', function () { window.print(); });",
          }}
        />
      </body>
    </html>
  );
}

function invoiceMatchesCustomer(
  invoice: InvoiceIndexEntry,
  customer: OperatorConsoleData["customerIndex"][number],
) {
  return (
    invoice.billingAccountId === customer.billingAccountId ||
    invoice.billingAccountName === customer.billingAccountName ||
    invoice.customerName === customer.canonicalName
  );
}

function buildStatementNumber(customerId: string, asOf: string) {
  const yy = asOf.slice(2, 4) || "00";
  const suffix = customerId.replace(/[^a-zA-Z0-9]/g, "").slice(-4).toUpperCase() || "0000";
  return `${yy}-${suffix}`;
}

function formatDisplayDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(new Date(value));
}

function formatStatementDate(value?: string) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-PH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  }).format(new Date(value));
}

function formatPhpAmount(amountCents: number, currency = "PHP") {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

function readInvoiceTerms(invoice: InvoiceIndexEntry) {
  const metadata = invoice.metadata ?? {};
  const termLabel =
    readString(metadata, "paymentTermsCode") ??
    readString(metadata, "paymentTermsLabel") ??
    readString(metadata, "paymentTermsDescription");
  return termLabel ?? "Needs BC terms mapping";
}

function readInvoicePoSo(invoice: InvoiceIndexEntry) {
  const metadata = invoice.metadata ?? {};
  return (
    readString(metadata, "customerPurchaseOrderNumber") ??
    readString(metadata, "purchaseOrderNumber") ??
    readString(metadata, "salesOrderNumber") ??
    readString(metadata, "externalDocumentNumber") ??
    "Needs BC PO/SO mapping"
  );
}

function customerAddressSummary(detail: OperatorConsoleData["liveCustomerProfileDetail"] | undefined) {
  const raw =
    typeof detail?.rawComposeEmail?.account.metadata?.billAddressSummary === "string"
      ? detail.rawComposeEmail.account.metadata.billAddressSummary
      : undefined;
  return raw?.trim() || "Billing address not yet mapped from Business Central company profile.";
}

function deriveIssuerProfile(invoices: InvoiceIndexEntry[]) {
  const metadata = invoices[0]?.metadata ?? {};
  const companyName = readString(metadata, "issuerCompanyName") ?? readString(metadata, "companyName") ?? "Yield AROS";
  const addressSummary =
    readString(metadata, "issuerAddressSummary") ??
    "Issuer company profile still needs full Business Central company-information mapping.";
  const phone = readString(metadata, "issuerPhone");
  const fax = readString(metadata, "issuerFax");
  const contactLine =
    phone && fax ? `Tel. Nos. ${phone}   Fax ${fax}` : phone ? `Tel. Nos. ${phone}` : fax ? `Fax ${fax}` : "Contact details not yet mapped";

  return {
    companyName,
    addressSummary,
    contactLine,
  };
}

function invoiceFallsWithinStatementCutoff(invoice: InvoiceIndexEntry, asOf: string) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) {
    return true;
  }
  const candidate = invoice.issuedAt ?? invoice.dueDate;
  if (!candidate) {
    return true;
  }
  const value = Date.parse(candidate);
  return !Number.isFinite(value) || value <= cutoff;
}

function readString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function statementCellStyle(textAlign: "left" | "right" = "left"): React.CSSProperties {
  return {
    border: "1px solid #c7d2df",
    padding: "6px 10px",
    textAlign,
    color: "#1f2f46",
  };
}

function summaryRowStyle(): React.CSSProperties {
  return {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    padding: "6px 0",
  };
}

function statementActionButtonStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid #d7e0eb",
    background: "#fff",
    color: "#13233b",
    borderRadius: 12,
    padding: "10px 16px",
    fontWeight: 700,
    cursor: "pointer",
    textDecoration: "none",
    font: "inherit",
  };
}

export async function renderIntegrationPortalHtml(options: {
  tenantSlug: string;
  clientName: string;
  token: string;
  quickbooksStatus?: string | undefined;
  quickbooksMessage?: string | undefined;
  businessCentralStatus?: string | undefined;
  businessCentralMessage?: string | undefined;
  sapStatus?: string | undefined;
  sapMessage?: string | undefined;
  odooStatus?: string | undefined;
  odooMessage?: string | undefined;
  companyName?: string | undefined;
  odooConnectState?: string | undefined;
  businessCentralConnectState?: string | undefined;
}): Promise<string> {
  const data = await loadIntegrationPortalData({
    tenantSlug: options.tenantSlug,
    clientName: options.clientName,
    token: options.token,
    quickbooksStatus: options.quickbooksStatus,
    quickbooksMessage: options.quickbooksMessage,
    businessCentralStatus: options.businessCentralStatus,
    businessCentralMessage: options.businessCentralMessage,
    sapStatus: options.sapStatus,
    sapMessage: options.sapMessage,
    odooStatus: options.odooStatus,
    odooMessage: options.odooMessage,
    companyName: options.companyName,
    odooConnectState: options.odooConnectState,
    businessCentralConnectState: options.businessCentralConnectState,
  });

  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Connect your accounting software | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <IntegrationPortalPage data={data} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

export async function renderIntegrationInspectorHtml(options: {
  tenantSlug: string;
  clientName: string;
  token: string;
}): Promise<string> {
  const data = await loadIntegrationInspectorPageData({
    tenantSlug: options.tenantSlug,
    clientName: options.clientName,
    token: options.token,
  });

  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Integration inspector | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <IntegrationInspectorPage data={data} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

export async function renderClientConnectInviteHtml(options: {
  data: ClientConnectInviteData;
}): Promise<string> {
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Client connect invite | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <ClientConnectInvitePage data={options.data} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

export async function renderClientConnectAccessDeniedHtml(options: {
  title: string;
  message: string;
}): Promise<string> {
  const html = renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Client connect access denied | Yield AROS</title>
      </head>
      <body style={{ margin: 0 }}>
        <ClientConnectAccessDeniedPage title={options.title} message={options.message} />
      </body>
    </html>,
  );

  return `<!DOCTYPE html>${html}`;
}

function pageFromPath(pathname: string): DashboardPage {
  if (pathname.startsWith("/cash-app")) {
    return "cash-application";
  }

  if (pathname.startsWith("/integrations/quickbooks")) {
    return "quickbooks-connect";
  }

  if (pathname.startsWith("/integrations/sap-business-one")) {
    return "sap-business-one-connect";
  }

  if (pathname.startsWith("/deductions/") || pathname.startsWith("/exceptions/")) {
    return "exceptions";
  }

  if (pathname.startsWith("/org-credit-line/demo")) {
    return "borrowing";
  }

  switch (pathname) {
    case "/":
      return "home";
    case "/onboarding":
      return "onboarding";
    case "/inbox":
    case "/tasks":
      return "inbox";
    case "/analytics":
      return "analytics";
    case "/borrowing":
    case "/credit-line":
      return "borrowing";
    case "/borrowing/facilities":
    case "/credit-line/facilities":
      return "credit-facilities";
    case "/borrowing/statement":
    case "/credit-line/statement":
      return "loan-statement";
    case "/borrowing/repayments":
    case "/credit-line/repayments":
      return "loan-repayments";
    case "/borrowing/alerts":
    case "/credit-line/alerts":
      return "loan-alerts";
    case "/borrowing/tasks":
    case "/credit-line/tasks":
      return "loan-tasks";
    case "/invoices":
      return "invoices";
    case "/customers":
      return "customers";
    case "/collections":
      return "collections";
    case "/control-center":
      return "control-center";
    case "/cash-application":
      return "cash-application";
    case "/deductions":
    case "/exceptions":
      return "exceptions";
    case "/approvals":
      return "approvals";
    case "/ai-activity":
      return "ai-activity";
    case "/data-sources":
      return "data-sources";
    case "/integrations":
      return "integrations";
    case "/rules":
      return "rules";
    case "/account-workspace":
      return "account-workspace";
    case "/invoice-detail":
      return "invoice-detail";
    case "/screen-inventory":
      return "screen-inventory";
    case "/admin/users":
      return "admin-users";
    case "/admin/roles":
      return "admin-roles";
    default:
      return "home";
  }
}
