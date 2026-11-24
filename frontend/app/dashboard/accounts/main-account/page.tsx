'use client';

import PageSkeleton from '@/app/components/PageSkeleton';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isAxiosError } from '@/lib/http';
import { createApiClient } from '../../../../lib/apiClient';

type CompanyAccountEntry = {
  id: number;
  bank_name?: string;
  branch?: string;
  account_no?: string;
  current_balance?: number;
};

type CompanyProfile = {
  id: number;
  name: string;
  email?: string;
  address?: string;
  phone?: string;
  website?: string;
  country?: string;
  currency?: string;
  current_cash_balance?: number;
  current_bank_balance?: number;
  current_cheque_balance?: number;
  bank_accounts?: CompanyAccountEntry[];
  cheque_accounts?: CompanyAccountEntry[];
};

type OutletProfile = {
  id: number;
  name: string;
  code?: string;
  status?: 'active' | 'inactive';
};

type LedgerEntry = {
  id: string;
  date: string;
  type: 'in' | 'out';
  amount: number;
  note: string;
  reference: string;
};

type MainCashTransactionRow = {
  id: number | string;
  date: string;
  created_at?: string | null;
  type: 'in' | 'out';
  amount: number | string;
  reference?: string | null;
  note?: string | null;
};

type JournalEntry = {
  id: string;
  date: string;
  posted_at?: string;
  entry_type?: 'transfer' | 'withdrawal';
  status?: 'pending' | 'accepted' | 'completed';
  company_name: string;
  source_account: string;
  target_account: string;
  target_outlet_id?: number;
  target_outlet_account?: 'cash' | 'bank' | 'cheque';
  debit_account: string;
  credit_account: string;
  amount: number;
  debit_amount?: number;
  credit_amount?: number;
  balance?: number;
  reference: string;
  note: string;
};

type PendingMainFundRequest = {
  id: string;
  date: string;
  status: 'pending';
  outlet_id: number;
  outlet_name: string;
  company_id: number;
  company_name: string;
  target_account: 'cash' | 'bank' | 'cheque';
  target_account_label: string;
  amount: number;
  reference: string;
  note: string;
};

type PendingOutletTransfer = {
  id: number;
  outlet_id?: number;
  outlet_name?: string;
  outlet_code?: string;
  session_date?: string;
  amount: number;
  total_sale?: number;
  start_amount?: number;
  card_collection_total?: number;
  bank_transfer_total?: number;
  cash_collection_total?: number;
  status?: string;
  requested_at?: string;
  requested_by_name?: string;
  note?: string;
};

type PendingDistributionBankTransfer = {
  id: number;
  payment_number?: string;
  payment_date?: string;
  amount: number;
  payment_method?: string;
  reference_no?: string;
  bank_name?: string;
  status?: string;
  created_at?: string;
  customer?: {
    id?: number;
    shop_name?: string;
    customer_code?: string;
  } | null;
  invoice?: {
    id?: number;
    invoice_number?: string;
  } | null;
};

type PendingDeliveryCompletionCashTransfer = {
  id: number;
  load_id?: number;
  load_number?: string;
  delivery_date?: string;
  amount: number;
  status?: string;
  requested_at?: string;
  requested_by_name?: string;
  note?: string;
};

type MainJournalRow = JournalEntry & {
  row_source?: 'main' | 'outlet_request';
};

type JournalUiRow = MainJournalRow & {
  txMark: 'Transfer In' | 'Transfer Out' | 'Pending Receipt' | 'Withdrawal' | 'Transfer' | 'Cheque Deposit' | 'Cheque Return';
  accountMark: 'Cash' | 'Bank' | 'Cheque' | 'Mixed';
  runningBalance: number;
  balanceLabel: string;
  displayDebitAccount: string;
  displayCreditAccount: string;
  displayDebitAmount: number;
  displayCreditAmount: number;
};

type NoticeModalState = {
  open: boolean;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'error';
};

type ConfirmModalState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type PendingCardBankAccountModalState = {
  open: boolean;
  title: string;
  message: string;
  companyName: string;
  bankAccounts: CompanyAccountEntry[];
};

const money = (value: number) =>
  Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const JOURNAL_PAGE_SIZE = 10;
const BANK_HISTORY_PAGE_SIZE = 10;

const parseJournalDate = (value?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const parsed = new Date(`${raw}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/.test(raw)) {
    const parsed = new Date(raw.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatJournalDateTime = (postedAt?: string, dateValue?: string) => {
  const parsed = parseJournalDate(postedAt) || parseJournalDate(dateValue);
  if (!parsed) return '-';

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(parsed);
};

export default function MainAccountPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CompanyProfile[]>([]);
  const [outlets, setOutlets] = useState<OutletProfile[]>([]);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [transferSaving, setTransferSaving] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccess, setTransferSuccess] = useState('');
  const [addCashSaving, setAddCashSaving] = useState(false);
  const [addCashError, setAddCashError] = useState('');
  const [addCashSuccess, setAddCashSuccess] = useState('');
  const [withdrawSaving, setWithdrawSaving] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [withdrawSuccess, setWithdrawSuccess] = useState('');
  const [depositSaving, setDepositSaving] = useState(false);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showAddBankAccountModal, setShowAddBankAccountModal] = useState(false);
  const [addBankAccountSaving, setAddBankAccountSaving] = useState(false);
  const [showEditCashBalanceModal, setShowEditCashBalanceModal] = useState(false);
  const [showEditBankBalanceModal, setShowEditBankBalanceModal] = useState(false);
  const [editCashBalanceSaving, setEditCashBalanceSaving] = useState(false);
  const [editBankBalanceSaving, setEditBankBalanceSaving] = useState(false);
  const [showBankHistoryModal, setShowBankHistoryModal] = useState(false);
  const [showCashHistoryModal, setShowCashHistoryModal] = useState(false);
  const [showChequeHistoryModal, setShowChequeHistoryModal] = useState(false);
  const [showPostingModal, setShowPostingModal] = useState(false);
  const [selectedBankHistoryCompanyId, setSelectedBankHistoryCompanyId] = useState('');
  const [selectedCashHistoryCompanyId, setSelectedCashHistoryCompanyId] = useState('');
  const [selectedChequeHistoryCompanyId, setSelectedChequeHistoryCompanyId] = useState('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [pendingMainFundRequests, setPendingMainFundRequests] = useState<PendingMainFundRequest[]>([]);
  const [pendingOutletTransfers, setPendingOutletTransfers] = useState<PendingOutletTransfer[]>([]);
  const [pendingOutletTransfersLoading, setPendingOutletTransfersLoading] = useState(false);
  const [pendingDistributionBankTransfers, setPendingDistributionBankTransfers] = useState<PendingDistributionBankTransfer[]>([]);
  const [pendingDistributionBankTransfersLoading, setPendingDistributionBankTransfersLoading] = useState(false);
  const [pendingDeliveryCompletionCashTransfers, setPendingDeliveryCompletionCashTransfers] = useState<PendingDeliveryCompletionCashTransfer[]>([]);
  const [pendingDeliveryCompletionCashTransfersLoading, setPendingDeliveryCompletionCashTransfersLoading] = useState(false);
  const [processingPendingOutletTransferId, setProcessingPendingOutletTransferId] = useState('');
  const [rejectingPendingOutletTransferId, setRejectingPendingOutletTransferId] = useState('');
  const [processingPendingDistributionBankTransferId, setProcessingPendingDistributionBankTransferId] = useState('');
  const [rejectingPendingDistributionBankTransferId, setRejectingPendingDistributionBankTransferId] = useState('');
  const [processingPendingDeliveryCompletionCashTransferId, setProcessingPendingDeliveryCompletionCashTransferId] = useState('');
  const [rejectingPendingDeliveryCompletionCashTransferId, setRejectingPendingDeliveryCompletionCashTransferId] = useState('');
  const [acceptingRequestId, setAcceptingRequestId] = useState('');
  const [decliningRequestId, setDecliningRequestId] = useState('');
  const [deletingJournalEntryId, setDeletingJournalEntryId] = useState('');
  const [journalPage, setJournalPage] = useState(1);
  const [bankHistoryPage, setBankHistoryPage] = useState(1);
  const [bankHistoryFilters, setBankHistoryFilters] = useState({
    status: 'all',
    fromDate: '',
    toDate: '',
    search: '',
  });
  const [journalFilters, setJournalFilters] = useState({
    entryType: 'all',
    txMark: 'all',
    accountMark: 'all',
    status: 'all',
    fromDate: '',
    toDate: '',
    search: '',
  });
  const [noticeModal, setNoticeModal] = useState<NoticeModalState>({
    open: false,
    title: '',
    message: '',
    tone: 'info',
  });
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  });
  const [confirmAction, setConfirmAction] = useState<null | (() => void)>(null);
  const [confirmCancelAction, setConfirmCancelAction] = useState<null | (() => void)>(null);
  const [pendingCardBankAccountModal, setPendingCardBankAccountModal] = useState<PendingCardBankAccountModalState>({
    open: false,
    title: '',
    message: '',
    companyName: '',
    bankAccounts: [],
  });
  const [pendingCardBankAccountSelection, setPendingCardBankAccountSelection] = useState('');
  const [pendingCardBankAccountResolver, setPendingCardBankAccountResolver] = useState<null | ((bankAccountId: number | null) => void)>(null);
  const [transferForm, setTransferForm] = useState({
    companyId: '',
    sourceType: 'cash' as 'cash' | 'bank',
    sourceBankAccountId: '',
    targetLedger: 'petty' as 'petty' | 'delivery' | 'outlet',
    targetOutletId: '',
    targetOutletAccount: 'cash' as 'cash' | 'bank' | 'cheque',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
  });
  const [withdrawForm, setWithdrawForm] = useState({
    companyId: '',
    sourceType: 'cash' as 'cash' | 'bank',
    sourceBankAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
    debitAccount: 'Cash Withdrawal Expense',
  });
  const [addCashForm, setAddCashForm] = useState({
    companyId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
    creditAccount: 'Capital Injection',
  });
  const [depositForm, setDepositForm] = useState({
    companyId: '',
    sourceType: 'cash' as 'cash' | 'cheque' | 'external_cash',
    bankAccountId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reference: '',
    note: '',
  });
  const [addBankAccountForm, setAddBankAccountForm] = useState({
    companyId: '',
    bankName: '',
    branch: '',
    accountNo: '',
    openingBalance: '',
  });
  const [editCashBalanceForm, setEditCashBalanceForm] = useState({
    companyId: '',
    amount: '',
    note: '',
  });
  const [editBankBalanceForm, setEditBankBalanceForm] = useState({
    companyId: '',
    bankAccountId: '',
    amount: '',
    note: '',
  });

  const router = useRouter();
  const api = useMemo(() => createApiClient(token), [token]);

  const showNoticeModal = (title: string, message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    setNoticeModal({ open: true, title, message, tone });
  };

  const openConfirmModal = (
    title: string,
    message: string,
    action: () => void,
    options?: { confirmLabel?: string; cancelLabel?: string; onCancel?: () => void }
  ) => {
    setConfirmAction(() => action);
    setConfirmCancelAction(options?.onCancel ? () => options.onCancel! : null);
    setConfirmModal({
      open: true,
      title,
      message,
      confirmLabel: options?.confirmLabel || 'Confirm',
      cancelLabel: options?.cancelLabel || 'Cancel',
    });
  };

  const closeConfirmModal = () => {
    setConfirmModal({ open: false, title: '', message: '', confirmLabel: 'Confirm', cancelLabel: 'Cancel' });
    setConfirmAction(null);
    setConfirmCancelAction(null);
  };

  const runConfirmAction = () => {
    const action = confirmAction;
    closeConfirmModal();
    if (action) action();
  };

  const runConfirmCancelAction = () => {
    const action = confirmCancelAction;
    closeConfirmModal();
    if (action) action();
  };

  const isBankDepositNarration = (text: string) => {
    const normalized = String(text || '').toLowerCase();
    return (
      normalized.includes('bank deposit') ||
      (normalized.includes('dr bank') &&
        (normalized.includes('cr cash') || normalized.includes('cr external cash')))
    );
  };

  const detectEntryType = (reference?: string | null, note?: string | null): 'transfer' | 'withdrawal' | null => {
    const ref = String(reference || '').toLowerCase();
    const narration = String(note || '').toLowerCase();

    if (ref.startsWith('dep-') || isBankDepositNarration(narration)) {
      return 'transfer';
    }

    if (ref.startsWith('chq-')) {
      return ref.startsWith('chq-ret-') ? 'withdrawal' : 'transfer';
    }

    if (ref.startsWith('trf-') || narration.includes('transfer')) {
      return 'transfer';
    }

    if (ref.startsWith('wdr-') || narration.includes('withdraw')) {
      return 'withdrawal';
    }

    return null;
  };

  const extractDebitCredit = (note: string | null | undefined, fallbackType: 'in' | 'out') => {
    const narration = String(note || '');
    const match = narration.match(/Dr\s+([^,]+),\s*Cr\s+([^\.\n]+)/i);

    if (match) {
      return {
        debit: match[1].trim(),
        credit: match[2].trim(),
      };
    }

    if (fallbackType === 'in') {
      return {
        debit: 'Main Cash Account',
        credit: 'External Source',
      };
    }

    return {
      debit: 'Transfer / Withdrawal Expense',
      credit: 'Main Cash Account',
    };
  };

  const mapTransactionToJournal = (row: MainCashTransactionRow): JournalEntry => {
    const entryType = detectEntryType(row.reference, row.note) || (row.type === 'out' ? 'withdrawal' : 'transfer');

    const amount = Number(row.amount || 0);
    const { debit, credit } = extractDebitCredit(row.note, row.type);
    const narration = String(row.note || '').toLowerCase();
    const status: JournalEntry['status'] = narration.includes('accepted batch') ? 'accepted' : 'completed';

    return {
      id: `main-tx-${row.id}`,
      date: row.date,
      posted_at: String(row.created_at || row.date || ''),
      entry_type: entryType,
      status,
      company_name: 'Main Account',
      source_account: credit,
      target_account: debit,
      debit_account: debit,
      credit_account: credit,
      amount,
      debit_amount: amount,
      credit_amount: amount,
      balance: undefined,
      reference: String(row.reference || '-'),
      note: String(row.note || ''),
    };
  };

  const getTxMark = (entry: MainJournalRow): JournalUiRow['txMark'] => {
    const reference = String(entry.reference || '').toLowerCase();
    const narration = String(entry.note || '').toLowerCase();
    const debitAccount = String(entry.debit_account || '').toLowerCase();
    const creditAccount = String(entry.credit_account || '').toLowerCase();

    if (entry.status === 'pending' && entry.row_source === 'outlet_request') {
      return 'Pending Receipt';
    }

    if (reference.startsWith('chq-ret-') || narration.includes('cheque return')) {
      return 'Cheque Return';
    }

    if (
      reference.startsWith('chq-dep-') ||
      reference.startsWith('chq-endclr-') ||
      narration.includes('cheque deposit') ||
      narration.includes('end cheque clearance')
    ) {
      return 'Cheque Deposit';
    }

    if (
      reference.startsWith('dep-') ||
      isBankDepositNarration(narration) ||
      (debitAccount.includes('bank') && creditAccount.includes('cash'))
    ) {
      return 'Transfer In';
    }

    if (entry.entry_type === 'withdrawal') {
      return 'Withdrawal';
    }

    if (narration.includes('transfer received') || String(entry.source_account || '').toLowerCase().includes('outlet')) {
      return 'Transfer In';
    }

    if (narration.includes('transfer issued')) {
      return 'Transfer Out';
    }

    return 'Transfer';
  };

  const getAccountMark = (entry: MainJournalRow): JournalUiRow['accountMark'] => {
    const tagText = [
      entry.source_account,
      entry.target_account,
      entry.debit_account,
      entry.credit_account,
      entry.note,
    ]
      .join(' ')
      .toLowerCase();

    const normalizedTagText = tagText.replace(/external cash/g, 'external source');

    const hasCash = normalizedTagText.includes('cash');
    const hasBank = normalizedTagText.includes('bank');
    const hasCheque = normalizedTagText.includes('cheque') || normalizedTagText.includes('check');

    const marks = [hasCash, hasBank, hasCheque].filter(Boolean).length;

    if (marks > 1) return 'Mixed';
    if (hasCheque) return 'Cheque';
    if (hasBank) return 'Bank';
    return 'Cash';
  };

  const extractBankLabel = (entry: MainJournalRow): string | null => {
    const fields = [
      String(entry.source_account || ''),
      String(entry.target_account || ''),
      String(entry.debit_account || ''),
      String(entry.credit_account || ''),
      String(entry.note || ''),
    ];

    for (const field of fields) {
      const match = field.match(/Bank\s*-\s*([^,\.\n]+)/i);
      if (match?.[1]) {
        return `Bank - ${match[1].trim()}`;
      }

      const alt = field.match(/Bank\s*:\s*([^|,\.\n]+)/i);
      if (alt?.[1]) {
        return `Bank - ${alt[1].trim()}`;
      }
    }

    return null;
  };

  const toBankBalanceKey = (label?: string | null) => {
    const text = String(label || '').trim();
    if (!text) return '';

    const accountNoMatch = text.match(/A\/C:\s*([^)]+)/i);
    const accountNo = normalizeAccountNo(accountNoMatch?.[1] || '');
    if (accountNo) {
      return `acct:${accountNo}`;
    }

    const normalizedBankName = text
      .replace(/^bank\s*-\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    return normalizedBankName ? `name:${normalizedBankName}` : '';
  };

  const affectsMainCash = (entry: MainJournalRow): boolean => {
    const text = [
      entry.source_account,
      entry.target_account,
      entry.debit_account,
      entry.credit_account,
      entry.note,
    ]
      .join(' ')
      .toLowerCase();

    if (text.includes('external cash')) {
      return false;
    }

    return text.includes('cash');
  };

  const mapToUiJournalRow = (entry: MainJournalRow, currentRunningBalance: number): JournalUiRow => {
    const amount = Number(entry.amount || 0);
    const txMark = getTxMark(entry);

    // User-facing rule for transfer rows: main account shown on debit side, receiving account on credit side.
    const shouldFlipTransferSides = txMark === 'Transfer Out';

    const defaultDebitAccount = String(entry.debit_account || '-');
    const defaultCreditAccount = String(entry.credit_account || '-');
    const defaultDebitAmount = Number(entry.debit_amount ?? amount);
    const defaultCreditAmount = Number(entry.credit_amount ?? amount);

    const displayDebitAccount = shouldFlipTransferSides ? defaultCreditAccount : defaultDebitAccount;
    const displayCreditAccount = shouldFlipTransferSides ? defaultDebitAccount : defaultCreditAccount;
    const displayDebitAmount = shouldFlipTransferSides ? defaultCreditAmount : defaultDebitAmount;
    const displayCreditAmount = shouldFlipTransferSides ? defaultDebitAmount : defaultCreditAmount;

    return {
      ...entry,
      txMark,
      accountMark: getAccountMark(entry),
      // This value is set by the journal mapper using current main cash as anchor.
      runningBalance: currentRunningBalance,
      balanceLabel: 'Main Cash',
      displayDebitAccount,
      displayCreditAccount,
      displayDebitAmount,
      displayCreditAmount,
    };
  };

  const refreshJournalFromBackend = async () => {
    try {
      const journalRes = await api.get('/main-cash-transactions', { params: { per_page: 500 } });
      const payload = journalRes.data;
      const rows = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);

      const mapped = (Array.isArray(rows) ? rows : [])
        .map((row) => mapTransactionToJournal(row as MainCashTransactionRow));

      setJournalEntries(mapped);
    } catch (error) {
      console.error('Failed to load journal from backend main-cash-transactions:', error);
      setJournalEntries([]);
    }
  };

  const refreshCompaniesFromBackend = async () => {
    try {
      const companiesRes = await api.get('/companies');
      const payload = companiesRes.data;
      const companyRows = Array.isArray(payload) ? payload : (payload?.data || []);
      setRows(Array.isArray(companyRows) ? companyRows : []);
    } catch (error) {
      console.error('Failed to refresh companies from backend:', error);
    }
  };

  const refreshPendingOutletTransfers = async () => {
    try {
      setPendingOutletTransfersLoading(true);
      const response = await api.get('/outlet-cash-drawer-transfers/pending');
      const payload = response.data;
      const rows = Array.isArray(payload) ? payload : (payload?.data || []);
      setPendingOutletTransfers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load pending outlet transfers:', error);
      setPendingOutletTransfers([]);
      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to load pending outlet transactions.';
      setTransferError(apiMessage);
    } finally {
      setPendingOutletTransfersLoading(false);
    }
  };

  const refreshPendingDistributionBankTransfers = async () => {
    try {
      setPendingDistributionBankTransfersLoading(true);
      const response = await api.get('/distribution/payments/pending-bank-transfers', { params: { per_page: 200 } });
      const payload = response.data;
      const rows = Array.isArray(payload)
        ? payload
        : (payload?.data?.data || payload?.data || []);
      setPendingDistributionBankTransfers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load pending distribution bank transfers:', error);
      setPendingDistributionBankTransfers([]);
      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to load pending distribution bank transfer transactions.';
      setTransferError(apiMessage);
    } finally {
      setPendingDistributionBankTransfersLoading(false);
    }
  };

  const refreshPendingDeliveryCompletionCashTransfers = async () => {
    try {
      setPendingDeliveryCompletionCashTransfersLoading(true);
      const response = await api.get('/delivery-completion-cash-transfers/pending');
      const payload = response.data;
      const rows = Array.isArray(payload) ? payload : (payload?.data || []);
      setPendingDeliveryCompletionCashTransfers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      console.error('Failed to load pending delivery completion cash transfers:', error);
      setPendingDeliveryCompletionCashTransfers([]);
      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to load pending delivery completion cash transfer transactions.';
      setTransferError(apiMessage);
    } finally {
      setPendingDeliveryCompletionCashTransfersLoading(false);
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      router.push('/');
      return;
    }

    setToken(storedToken);
  }, [router]);

  useEffect(() => {
    if (!token) return;

    const load = async () => {
      try {
        setLoading(true);
        const [userResult, companiesResult, outletsResult] = await Promise.allSettled([
          api.get('/user'),
          api.get('/companies'),
          api.get('/outlets', { params: { per_page: 200 } }),
        ]);

        if (userResult.status === 'fulfilled') {
          const userData = userResult.value.data || {};
          const employeeId = Number(userData?.employee_id || userData?.employee?.id || 0);
          const roleNames = [
            String(userData?.role || ''),
            ...(Array.isArray(userData?.roles)
              ? userData.roles.map((role: unknown) => {
                  if (role && typeof role === 'object' && 'name' in role) {
                    return String((role as { name?: unknown }).name || '');
                  }
                  return String(role || '');
                })
              : []),
          ]
            .join(' ')
            .toLowerCase();

          const adminUser =
            !employeeId ||
            roleNames.includes('super admin') ||
            roleNames.includes('superadmin') ||
            roleNames.includes('administrator') ||
            roleNames.includes('admin');
          setIsAdminUser(adminUser);
        } else {
          setIsAdminUser(false);
        }

        if (companiesResult.status === 'fulfilled') {
          const companiesData = Array.isArray(companiesResult.value.data)
            ? companiesResult.value.data
            : (companiesResult.value.data?.data || []);
          setRows(Array.isArray(companiesData) ? companiesData : []);
        } else {
          throw companiesResult.reason;
        }

        if (outletsResult.status === 'fulfilled') {
          const outletPayload = outletsResult.value.data;
          const outletData = outletPayload?.success
            ? (outletPayload?.data?.data || outletPayload?.data || [])
            : (Array.isArray(outletPayload) ? outletPayload : []);
          setOutlets(Array.isArray(outletData) ? outletData : []);
        } else {
          setOutlets([]);
        }
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 401) {
          localStorage.removeItem('token');
          setToken('');
          router.push('/');
          return;
        }
        console.error('Error loading company main account data:', error);
        setRows([]);
        setOutlets([]);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [token, api, router]);

  useEffect(() => {
    if (!token) return;
    refreshJournalFromBackend();
    refreshPendingOutletTransfers();
    refreshPendingDistributionBankTransfers();
    refreshPendingDeliveryCompletionCashTransfers();
  }, [token]);

  useEffect(() => {
    const raw = localStorage.getItem('main_account_pending_fund_requests');
    if (!raw) {
      setPendingMainFundRequests([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      setPendingMainFundRequests(Array.isArray(parsed) ? parsed : []);
    } catch (error) {
      console.error('Failed to parse pending main fund requests:', error);
      setPendingMainFundRequests([]);
    }
  }, []);

  useEffect(() => {
    if (!rows.length) return;

    setTransferForm((prev) => {
      if (prev.companyId) return prev;
      return {
        ...prev,
        companyId: String(rows[0].id),
      };
    });

    setWithdrawForm((prev) => {
      if (prev.companyId) return prev;
      return {
        ...prev,
        companyId: String(rows[0].id),
      };
    });

    setAddCashForm((prev) => {
      if (prev.companyId) return prev;
      return {
        ...prev,
        companyId: String(rows[0].id),
      };
    });
  }, [rows]);

  useEffect(() => {
    if (!addCashError) return;
    showNoticeModal('Add Cash Failed', addCashError, 'error');
    setAddCashError('');
  }, [addCashError]);

  useEffect(() => {
    if (!addCashSuccess) return;
    showNoticeModal('Add Cash', addCashSuccess, 'success');
    setAddCashSuccess('');
  }, [addCashSuccess]);

  useEffect(() => {
    if (!transferError) return;
    showNoticeModal('Transfer Failed', transferError, 'error');
    setTransferError('');
  }, [transferError]);

  useEffect(() => {
    if (!transferSuccess) return;
    showNoticeModal('Transfer', transferSuccess, 'success');
    setTransferSuccess('');
  }, [transferSuccess]);

  useEffect(() => {
    if (!withdrawError) return;
    showNoticeModal('Withdrawal Failed', withdrawError, 'error');
    setWithdrawError('');
  }, [withdrawError]);

  useEffect(() => {
    if (!withdrawSuccess) return;
    showNoticeModal('Withdrawal', withdrawSuccess, 'success');
    setWithdrawSuccess('');
  }, [withdrawSuccess]);

  const normalizeAccountNo = (value?: string) =>
    String(value || '')
      .replace(/\s+/g, '')
      .toLowerCase();

  const formatBankAccountLabel = (account?: CompanyAccountEntry | null) => {
    if (!account) return 'Bank - Account';
    const bankName = String(account.bank_name || 'Bank Account').trim();
    const branch = String(account.branch || '').trim();
    const accountNo = String(account.account_no || '').trim();
    return `Bank - ${bankName}${branch ? ` - ${branch}` : ''}${accountNo ? ` (A/C: ${accountNo})` : ''}`;
  };

  const resolveCompanyOverlapInfo = (company: CompanyProfile) => {
    const bankByAccount = new Map<string, number>();
    const chequeByAccount = new Map<string, number>();

    (company.bank_accounts || []).forEach((account) => {
      const key = normalizeAccountNo(account.account_no);
      if (!key) return;
      bankByAccount.set(key, Number(account.current_balance || 0));
    });

    (company.cheque_accounts || []).forEach((account) => {
      const key = normalizeAccountNo(account.account_no);
      if (!key) return;
      chequeByAccount.set(key, Number(account.current_balance || 0));
    });

    let overlappedChequeAmount = 0;
    let overlappedBankAmount = 0;
    let nonOverlappedChequeAmount = 0;
    const overlappedAccounts: string[] = [];

    chequeByAccount.forEach((chequeBalance, accountNo) => {
      if (bankByAccount.has(accountNo)) {
        overlappedChequeAmount += Number(chequeBalance || 0);
        overlappedBankAmount += Number(bankByAccount.get(accountNo) || 0);
        overlappedAccounts.push(accountNo);
      } else {
        nonOverlappedChequeAmount += Number(chequeBalance || 0);
      }
    });

    // For shared account numbers, mirror cheque display to linked bank balance.
    const displayChequeBalance = nonOverlappedChequeAmount + overlappedBankAmount;

    return {
      overlappedChequeAmount,
      overlappedBankAmount,
      nonOverlappedChequeAmount,
      displayChequeBalance,
      overlappedAccounts,
      hasOverlap: overlappedAccounts.length > 0,
    };
  };

  const getCompanyDisplayTotal = (company: CompanyProfile) => {
    const cash = Number(company.current_cash_balance || 0);
    const bank = Number(company.current_bank_balance || 0);
    const overlapInfo = resolveCompanyOverlapInfo(company);
    // Shared cheque/bank account numbers represent the same funds; add only non-overlapped cheque.
    return cash + bank + Number(overlapInfo.nonOverlappedChequeAmount || 0);
  };

  const getCompanyAdjustedChequeBalance = (company: CompanyProfile) => {
    return Number(resolveCompanyOverlapInfo(company).displayChequeBalance || 0);
  };

  const summary = useMemo(() => {
    const totalCash = rows.reduce((sum, company) => sum + Number(company.current_cash_balance || 0), 0);
    const totalBank = rows.reduce((sum, company) => sum + Number(company.current_bank_balance || 0), 0);
    const totalChequeRaw = rows.reduce((sum, company) => sum + Number(company.current_cheque_balance || 0), 0);
    const totalChequeDisplay = rows.reduce(
      (sum, company) => sum + Number(resolveCompanyOverlapInfo(company).displayChequeBalance || 0),
      0
    );
    const overlappedCheque = rows.reduce(
      (sum, company) => sum + resolveCompanyOverlapInfo(company).overlappedChequeAmount,
      0
    );
    const overlappedBankMirror = rows.reduce(
      (sum, company) => sum + Number(resolveCompanyOverlapInfo(company).overlappedBankAmount || 0),
      0
    );
    const totalChequeNetForGrand = rows.reduce(
      (sum, company) => sum + Number(resolveCompanyOverlapInfo(company).nonOverlappedChequeAmount || 0),
      0
    );

    return {
      totalCash,
      totalBank,
      totalCheque: totalChequeDisplay,
      totalChequeRaw,
      overlappedCheque,
      overlappedBankMirror,
      totalChequeNetForGrand,
      grandTotal: totalCash + totalBank + totalChequeNetForGrand,
    };
  }, [rows]);

  const currentBankBalancesByLabel = useMemo<Record<string, number>>(() => {
    const balances: Record<string, number> = {};
    const bankNameTotals: Record<string, number> = {};
    const bankNameAccountKeys: Record<string, Set<string>> = {};

    rows.forEach((company) => {
      (company.bank_accounts || []).forEach((account) => {
        const bankName = String(account.bank_name || 'Account').trim().toLowerCase();
        const accountNoNormalized = normalizeAccountNo(account.account_no);
        const amount = Number(account.current_balance || 0);
        const nameKey = `name:${bankName}`;
        const key = accountNoNormalized ? `acct:${accountNoNormalized}` : `name:${bankName}`;
        balances[key] = Number(balances[key] || 0) + amount;
        bankNameTotals[nameKey] = Number(bankNameTotals[nameKey] || 0) + amount;

        if (accountNoNormalized) {
          if (!bankNameAccountKeys[nameKey]) {
            bankNameAccountKeys[nameKey] = new Set<string>();
          }
          bankNameAccountKeys[nameKey].add(key);
        }
      });
    });

    Object.entries(bankNameAccountKeys).forEach(([nameKey, accountKeySet]) => {
      if (accountKeySet.size > 1) {
        balances[nameKey] = Number(bankNameTotals[nameKey] || 0);
      }
    });

    return balances;
  }, [rows]);

  const bankNameToUniqueAccountKey = useMemo<Record<string, string>>(() => {
    const lookup: Record<string, Set<string>> = {};

    rows.forEach((company) => {
      (company.bank_accounts || []).forEach((account) => {
        const bankName = String(account.bank_name || 'Account').trim().toLowerCase();
        const accountNoNormalized = normalizeAccountNo(account.account_no);
        if (!accountNoNormalized) return;
        const nameKey = `name:${bankName}`;
        if (!lookup[nameKey]) {
          lookup[nameKey] = new Set<string>();
        }
        lookup[nameKey].add(`acct:${accountNoNormalized}`);
      });
    });

    const resolved: Record<string, string> = {};
    Object.entries(lookup).forEach(([nameKey, keys]) => {
      if (keys.size === 1) {
        resolved[nameKey] = Array.from(keys)[0];
      }
    });

    return resolved;
  }, [rows]);

  const resolveBankBalanceKey = (label?: string | null) => {
    const rawKey = toBankBalanceKey(label);
    if (!rawKey) return '';
    if (rawKey.startsWith('acct:')) return rawKey;
    return bankNameToUniqueAccountKey[rawKey] || rawKey;
  };

  const selectedCompany = useMemo(
    () => rows.find((company) => String(company.id) === transferForm.companyId) || null,
    [rows, transferForm.companyId]
  );

  const availableBankAccounts = useMemo(() => selectedCompany?.bank_accounts || [], [selectedCompany]);

  const selectedTransferOutlet = useMemo(
    () => outlets.find((outlet) => String(outlet.id) === transferForm.targetOutletId) || null,
    [outlets, transferForm.targetOutletId]
  );

  const selectedWithdrawCompany = useMemo(
    () => rows.find((company) => String(company.id) === withdrawForm.companyId) || null,
    [rows, withdrawForm.companyId]
  );

  const selectedDepositCompany = useMemo(
    () => rows.find((company) => String(company.id) === depositForm.companyId) || null,
    [rows, depositForm.companyId]
  );

  const selectedAddBankCompany = useMemo(
    () => rows.find((company) => String(company.id) === addBankAccountForm.companyId) || null,
    [rows, addBankAccountForm.companyId]
  );

  const selectedEditCashCompany = useMemo(
    () => rows.find((company) => String(company.id) === editCashBalanceForm.companyId) || null,
    [rows, editCashBalanceForm.companyId]
  );

  const selectedEditBankCompany = useMemo(
    () => rows.find((company) => String(company.id) === editBankBalanceForm.companyId) || null,
    [rows, editBankBalanceForm.companyId]
  );

  const selectedEditBankAccount = useMemo(
    () =>
      (selectedEditBankCompany?.bank_accounts || []).find(
        (account) => String(account.id) === editBankBalanceForm.bankAccountId
      ) || null,
    [selectedEditBankCompany, editBankBalanceForm.bankAccountId]
  );

  const availableDepositBankAccounts = useMemo(
    () => selectedDepositCompany?.bank_accounts || [],
    [selectedDepositCompany]
  );

  const selectedBankHistoryCompany = useMemo(
    () => rows.find((company) => String(company.id) === selectedBankHistoryCompanyId) || null,
    [rows, selectedBankHistoryCompanyId]
  );

  const selectedCashHistoryCompany = useMemo(
    () => rows.find((company) => String(company.id) === selectedCashHistoryCompanyId) || null,
    [rows, selectedCashHistoryCompanyId]
  );

  const selectedChequeHistoryCompany = useMemo(
    () => rows.find((company) => String(company.id) === selectedChequeHistoryCompanyId) || null,
    [rows, selectedChequeHistoryCompanyId]
  );

  const selectedAddCashCompany = useMemo(
    () => rows.find((company) => String(company.id) === addCashForm.companyId) || null,
    [rows, addCashForm.companyId]
  );

  const availableWithdrawBankAccounts = useMemo(
    () => selectedWithdrawCompany?.bank_accounts || [],
    [selectedWithdrawCompany]
  );

  const journalRows = useMemo<JournalUiRow[]>(() => {
    const pendingRows: MainJournalRow[] = pendingMainFundRequests.map((request) => ({
      id: request.id,
      date: request.date,
      entry_type: 'transfer',
      status: 'pending',
      company_name: request.company_name,
      source_account: `Outlet - ${request.outlet_name}`,
      target_account: request.target_account_label,
      debit_account: request.target_account_label,
      credit_account: `Outlet - ${request.outlet_name}`,
      amount: Number(request.amount || 0),
      debit_amount: Number(request.amount || 0),
      credit_amount: Number(request.amount || 0),
      balance: undefined,
      reference: request.reference,
      note: request.note || `Pending receipt from outlet ${request.outlet_name}`,
      row_source: 'outlet_request',
    }));

    const ownRows: MainJournalRow[] = journalEntries.map((entry) => ({
      ...entry,
      row_source: 'main',
    }));

    const combined = [...pendingRows, ...ownRows].sort((a, b) => {
      const at = new Date(a.date).getTime();
      const bt = new Date(b.date).getTime();
      return bt - at;
    });

    // Latest-first table: anchor at current balances, then roll backward per affected account.
    let currentBalance = Number(summary.totalCash || 0);
    const bankBalances = { ...currentBankBalancesByLabel };

    return combined.map((entry) => {
      const mapped = mapToUiJournalRow(entry, currentBalance);
      const bankLabel = extractBankLabel(entry);
      const bankBalanceKey = resolveBankBalanceKey(bankLabel);

      if (bankLabel) {
        mapped.balanceLabel = bankLabel;
        mapped.runningBalance = Number(bankBalances[bankBalanceKey] || 0);
      } else {
        mapped.balanceLabel = 'Main Cash';
        mapped.runningBalance = currentBalance;
      }

      if (entry.status !== 'pending' && affectsMainCash(entry)) {
        const amount = Number(entry.amount || 0);

        if (mapped.txMark === 'Transfer In' || mapped.txMark === 'Cheque Deposit') {
          // Reverse of increase when walking backward in time.
          currentBalance -= amount;
        } else if (mapped.txMark === 'Transfer Out' || mapped.txMark === 'Withdrawal' || mapped.txMark === 'Cheque Return') {
          // Reverse of decrease when walking backward in time.
          currentBalance += amount;
        }
      }

      if (entry.status !== 'pending' && bankBalanceKey) {
        const amount = Number(entry.amount || 0);
        const debitBankKey = toBankBalanceKey(String(entry.debit_account || ''));
        const creditBankKey = toBankBalanceKey(String(entry.credit_account || ''));

        let forwardBankDelta = 0;
        if (debitBankKey === bankBalanceKey && creditBankKey !== bankBalanceKey) {
          forwardBankDelta = amount;
        } else if (creditBankKey === bankBalanceKey && debitBankKey !== bankBalanceKey) {
          forwardBankDelta = -amount;
        } else if (mapped.txMark === 'Transfer In' || mapped.txMark === 'Cheque Deposit') {
          forwardBankDelta = amount;
        } else if (mapped.txMark === 'Transfer Out' || mapped.txMark === 'Withdrawal' || mapped.txMark === 'Cheque Return') {
          forwardBankDelta = -amount;
        }

        // Reverse forward movement while iterating newest -> oldest.
        bankBalances[bankBalanceKey] = Number(bankBalances[bankBalanceKey] || 0) - forwardBankDelta;
      }

      return mapped;
    });
  }, [pendingMainFundRequests, journalEntries, summary.totalCash, currentBankBalancesByLabel]);

  const bankHistoryRows = useMemo(() => {
    if (!selectedBankHistoryCompany) return [];

    const bankNameTokens = (selectedBankHistoryCompany.bank_accounts || [])
      .map((bank) => String(bank.bank_name || '').trim().toLowerCase())
      .filter((name) => name.length > 0);

    const bankAccountTokens = (selectedBankHistoryCompany.bank_accounts || [])
      .map((bank) => normalizeAccountNo(bank.account_no))
      .filter((no) => no.length > 0);

    const accountMatchesSelectedBank = (value?: string | null) => {
      const text = String(value || '').toLowerCase();
      if (!text) return false;

      const normalizedText = text.replace(/\s+/g, '');
      if (bankAccountTokens.some((token) => normalizedText.includes(token))) {
        return true;
      }

      return bankNameTokens.some((token) => text.includes(token));
    };

    const matching = journalRows.filter((entry) => {
      const text = [
        entry.source_account,
        entry.target_account,
        entry.debit_account,
        entry.credit_account,
        entry.balanceLabel,
        entry.note,
        entry.reference,
      ]
        .join(' ')
        .toLowerCase();

      const isBankRelated = entry.accountMark === 'Bank' || text.includes('bank');
      if (!isBankRelated) return false;

      if (bankNameTokens.length === 0 && bankAccountTokens.length === 0) {
        return true;
      }

      const hasNameMatch = bankNameTokens.some((token) => text.includes(token));
      const normalizedText = text.replace(/\s+/g, '');
      const hasAccountNoMatch = bankAccountTokens.some((token) => normalizedText.includes(token));

      if (hasNameMatch || hasAccountNoMatch) {
        return true;
      }

      // Backward compatibility: older outlet card-transfer postings were journaled as
      // generic "Bank Account" without specific bank label/account no.
      if (text.includes('accepted outlet card collection') || text.includes('dr bank account, cr outlet cash drawer')) {
        return true;
      }

      return false;
    });

    const resolveBankDelta = (entry: JournalUiRow): number => {
      if (entry.status === 'pending') return 0;

      const amount = Number(entry.amount || 0);
      if (amount <= 0) return 0;

      const debitMatches = accountMatchesSelectedBank(entry.debit_account);
      const creditMatches = accountMatchesSelectedBank(entry.credit_account);

      if (debitMatches && !creditMatches) return amount;
      if (creditMatches && !debitMatches) return -amount;

      if (entry.txMark === 'Transfer In' || entry.txMark === 'Cheque Deposit') return amount;
      if (entry.txMark === 'Transfer Out' || entry.txMark === 'Withdrawal' || entry.txMark === 'Cheque Return') return -amount;

      return 0;
    };

    let currentBankBalance = Number(selectedBankHistoryCompany.current_bank_balance || 0);

    return matching.map((entry) => {
      const text = [
        entry.source_account,
        entry.target_account,
        entry.debit_account,
        entry.credit_account,
        entry.note,
      ]
        .join(' ')
        .toLowerCase();

      const row = {
        ...entry,
        balanceLabel:
          entry.balanceLabel && entry.balanceLabel !== 'Main Cash'
            ? entry.balanceLabel
            : (text.includes('bank') ? 'Bank Account' : entry.balanceLabel),
        runningBalance: currentBankBalance,
      };

      currentBankBalance -= resolveBankDelta(entry);
      return row;
    });
  }, [selectedBankHistoryCompany, journalRows]);

  const filteredBankHistoryRows = useMemo(() => {
    const searchText = bankHistoryFilters.search.trim().toLowerCase();
    const fromAt = bankHistoryFilters.fromDate ? new Date(`${bankHistoryFilters.fromDate}T00:00:00`).getTime() : null;
    const toAt = bankHistoryFilters.toDate ? new Date(`${bankHistoryFilters.toDate}T23:59:59`).getTime() : null;

    return bankHistoryRows.filter((entry) => {
      const status = String(entry.status || 'completed').toLowerCase();
      if (bankHistoryFilters.status !== 'all' && status !== bankHistoryFilters.status) {
        return false;
      }

      if (fromAt !== null || toAt !== null) {
        const parsed = parseJournalDate(entry.posted_at || entry.date);
        if (!parsed) return false;
        const timestamp = parsed.getTime();
        if (fromAt !== null && timestamp < fromAt) return false;
        if (toAt !== null && timestamp > toAt) return false;
      }

      if (!searchText) return true;
      const haystack = [
        entry.txMark,
        entry.displayDebitAccount,
        entry.displayCreditAccount,
        entry.reference,
        entry.note,
        entry.status,
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(searchText);
    });
  }, [bankHistoryRows, bankHistoryFilters]);

  const totalBankHistoryPages = useMemo(
    () => Math.max(1, Math.ceil(filteredBankHistoryRows.length / BANK_HISTORY_PAGE_SIZE)),
    [filteredBankHistoryRows.length]
  );

  const currentBankHistoryPage = Math.min(bankHistoryPage, totalBankHistoryPages);

  const paginatedBankHistoryRows = useMemo(() => {
    const start = (currentBankHistoryPage - 1) * BANK_HISTORY_PAGE_SIZE;
    return filteredBankHistoryRows.slice(start, start + BANK_HISTORY_PAGE_SIZE);
  }, [filteredBankHistoryRows, currentBankHistoryPage]);

  const bankHistoryRangeStart = filteredBankHistoryRows.length === 0
    ? 0
    : (currentBankHistoryPage - 1) * BANK_HISTORY_PAGE_SIZE + 1;
  const bankHistoryRangeEnd = Math.min(currentBankHistoryPage * BANK_HISTORY_PAGE_SIZE, filteredBankHistoryRows.length);

  const hasPendingBankHistoryActions = useMemo(
    () => filteredBankHistoryRows.some((entry) => entry.status === 'pending' && entry.row_source === 'outlet_request'),
    [filteredBankHistoryRows]
  );

  const cashHistoryRows = useMemo(() => {
    if (!selectedCashHistoryCompany) return [];

    const filteredRows = journalRows.filter((entry) => {
      const text = [
        entry.source_account,
        entry.target_account,
        entry.debit_account,
        entry.credit_account,
        entry.balanceLabel,
        entry.company_name,
      ]
        .join(' ')
        .toLowerCase();

      const hasMainCashMarker =
        text.includes('main cash') ||
        String(entry.balanceLabel || '').toLowerCase() === 'main cash';

      const hasBankOrChequeMarker =
        text.includes('bank') ||
        text.includes('cheque') ||
        text.includes('check');

      const isPureCashEntry = entry.accountMark === 'Cash' && !hasBankOrChequeMarker;
      const isMainCashOnlyEntry = hasMainCashMarker && !hasBankOrChequeMarker;
      const isCashRelated = isPureCashEntry || isMainCashOnlyEntry;
      if (!isCashRelated) return false;

      const companyToken = String(selectedCashHistoryCompany.name || '').trim().toLowerCase();
      if (!companyToken) return true;

      return text.includes(companyToken) || entry.company_name === 'Main Account';
    });

    const isCashLabel = (label?: string | null) => {
      const text = String(label || '').toLowerCase();
      return text.includes('cash') && !text.includes('external cash');
    };

    const resolveCashDelta = (entry: JournalUiRow): number => {
      if (entry.status === 'pending') return 0;
      const amount = Number(entry.amount || 0);
      if (amount <= 0) return 0;

      const debitIsCash = isCashLabel(entry.debit_account);
      const creditIsCash = isCashLabel(entry.credit_account);
      const debitText = String(entry.debit_account || '').toLowerCase();
      const creditText = String(entry.credit_account || '').toLowerCase();
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
      const debitNormalized = normalize(debitText);
      const creditNormalized = normalize(creditText);
      const debitIsMainCash = debitText.includes('main cash') || debitNormalized === 'cash account';
      const creditIsMainCash = creditText.includes('main cash') || creditNormalized === 'cash account';

      if (debitIsCash && !creditIsCash) return amount;
      if (creditIsCash && !debitIsCash) return -amount;
      if (debitIsCash && creditIsCash) {
        if (debitIsMainCash && !creditIsMainCash) return amount;
        if (creditIsMainCash && !debitIsMainCash) return -amount;
      }

      if (entry.txMark === 'Transfer In' || entry.txMark === 'Cheque Deposit') return amount;
      if (entry.txMark === 'Transfer Out' || entry.txMark === 'Withdrawal' || entry.txMark === 'Cheque Return') return -amount;

      return 0;
    };

    let currentCashBalance = Number(selectedCashHistoryCompany.current_cash_balance || 0);

    return filteredRows.map((entry) => {
      const row = {
        ...entry,
        balanceLabel: 'Main Cash',
        runningBalance: currentCashBalance,
      };
      const delta = resolveCashDelta(entry);
      currentCashBalance -= delta;
      return row;
    });
  }, [selectedCashHistoryCompany, journalRows]);

  const chequeHistoryRows = useMemo(() => {
    if (!selectedChequeHistoryCompany) return [];

    const chequeNameTokens = (selectedChequeHistoryCompany.cheque_accounts || [])
      .map((account) => String(account.bank_name || '').trim().toLowerCase())
      .filter((name) => name.length > 0);

    const chequeAccountTokens = (selectedChequeHistoryCompany.cheque_accounts || [])
      .map((account) => normalizeAccountNo(account.account_no))
      .filter((no) => no.length > 0);

    return journalRows.filter((entry) => {
      const text = [
        entry.source_account,
        entry.target_account,
        entry.debit_account,
        entry.credit_account,
        entry.balanceLabel,
        entry.note,
        entry.reference,
      ]
        .join(' ')
        .toLowerCase();

      const isChequeRelated =
        entry.accountMark === 'Cheque' ||
        entry.txMark === 'Cheque Deposit' ||
        entry.txMark === 'Cheque Return' ||
        text.includes('cheque') ||
        text.includes('check');

      if (!isChequeRelated) return false;

      if (chequeNameTokens.length === 0 && chequeAccountTokens.length === 0) {
        return true;
      }

      const hasNameMatch = chequeNameTokens.some((token) => text.includes(token));
      const normalizedText = text.replace(/\s+/g, '');
      const hasAccountNoMatch = chequeAccountTokens.some((token) => normalizedText.includes(token));

      return hasNameMatch || hasAccountNoMatch;
    });
  }, [selectedChequeHistoryCompany, journalRows]);

  const filteredJournalRows = useMemo(() => {
    const searchText = journalFilters.search.trim().toLowerCase();
    const fromAt = journalFilters.fromDate ? new Date(`${journalFilters.fromDate}T00:00:00`).getTime() : null;
    const toAt = journalFilters.toDate ? new Date(`${journalFilters.toDate}T23:59:59`).getTime() : null;

    return journalRows.filter((entry) => {
      const entryType = String(entry.entry_type || 'transfer');
      const entryStatus = String(entry.status || 'completed');
      const accountText = [
        entry.debit_account,
        entry.credit_account,
        entry.source_account,
        entry.target_account,
        entry.balanceLabel,
        entry.note,
      ]
        .join(' ')
        .toLowerCase();

      if (journalFilters.entryType !== 'all' && entryType !== journalFilters.entryType) {
        return false;
      }

      if (journalFilters.txMark !== 'all' && entry.txMark !== journalFilters.txMark) {
        return false;
      }

      if (journalFilters.accountMark !== 'all') {
        if (journalFilters.accountMark === 'Bank' && !accountText.includes('bank')) {
          return false;
        }

        if (
          journalFilters.accountMark === 'Cash' &&
          (!accountText.includes('cash') || accountText.includes('external cash'))
        ) {
          return false;
        }

        if (
          journalFilters.accountMark === 'Cheque' &&
          !(accountText.includes('cheque') || accountText.includes('check'))
        ) {
          return false;
        }

        if (journalFilters.accountMark === 'Mixed' && entry.accountMark !== 'Mixed') {
          return false;
        }
      }

      if (journalFilters.status !== 'all' && entryStatus !== journalFilters.status) {
        return false;
      }

      if (fromAt !== null || toAt !== null) {
        const parsedDate = parseJournalDate(entry.posted_at) || parseJournalDate(entry.date);
        if (!parsedDate) return false;
        const entryAt = parsedDate.getTime();
        if (fromAt !== null && entryAt < fromAt) return false;
        if (toAt !== null && entryAt > toAt) return false;
      }

      if (searchText) {
        const haystack = [
          entry.reference,
          entry.note,
          entry.company_name,
          entry.debit_account,
          entry.credit_account,
          entry.balanceLabel,
          entry.txMark,
          entry.accountMark,
        ]
          .join(' ')
          .toLowerCase();

        if (!haystack.includes(searchText)) {
          return false;
        }
      }

      return true;
    });
  }, [journalRows, journalFilters]);

  const totalJournalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredJournalRows.length / JOURNAL_PAGE_SIZE)),
    [filteredJournalRows.length]
  );

  const currentJournalPage = useMemo(
    () => Math.min(journalPage, totalJournalPages),
    [journalPage, totalJournalPages]
  );

  const paginatedJournalEntries = useMemo(() => {
    const start = (currentJournalPage - 1) * JOURNAL_PAGE_SIZE;
    return filteredJournalRows.slice(start, start + JOURNAL_PAGE_SIZE);
  }, [filteredJournalRows, currentJournalPage]);

  const journalRangeStart = filteredJournalRows.length === 0 ? 0 : (currentJournalPage - 1) * JOURNAL_PAGE_SIZE + 1;
  const journalRangeEnd = Math.min(currentJournalPage * JOURNAL_PAGE_SIZE, filteredJournalRows.length);

  useEffect(() => {
    setJournalPage((prev) => Math.min(prev, totalJournalPages));
  }, [totalJournalPages]);

  useEffect(() => {
    setJournalPage(1);
  }, [journalFilters]);

  useEffect(() => {
    setBankHistoryPage((prev) => Math.min(prev, totalBankHistoryPages));
  }, [totalBankHistoryPages]);

  useEffect(() => {
    setBankHistoryPage(1);
  }, [bankHistoryFilters, selectedBankHistoryCompanyId, showBankHistoryModal]);

  const readLedger = (key: string): LedgerEntry[] => {
    const raw = localStorage.getItem(key);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeLedger = (key: string, data: LedgerEntry[]) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const persistLedgerEntry = async (storageKey: string, apiEndpoint: string, entry: LedgerEntry) => {
    try {
      await api.post(apiEndpoint, {
        date: entry.date,
        type: entry.type,
        amount: entry.amount,
        reference: entry.reference || null,
        note: entry.note || null,
      });
    } catch (error) {
      console.error(`Failed to persist ${apiEndpoint}, using local fallback:`, error);
      writeLedger(storageKey, [entry, ...readLedger(storageKey)]);
    }
  };

  const handleAcceptMainFundRequest = async (requestId: string) => {
    const request = pendingMainFundRequests.find((entry) => entry.id === requestId);
    if (!request) {
      setTransferError('Pending request not found.');
      return;
    }

    const targetCompany = rows.find((company) => company.id === request.company_id);
    if (!targetCompany) {
      setTransferError('Target company not found for this pending request.');
      return;
    }

    const amount = Number(request.amount || 0);
    if (amount <= 0) {
      setTransferError('Invalid pending request amount.');
      return;
    }

    const nextCash = Number(targetCompany.current_cash_balance || 0) + (request.target_account === 'cash' ? amount : 0);
    const nextBank = Number(targetCompany.current_bank_balance || 0) + (request.target_account === 'bank' ? amount : 0);
    const nextCheque = Number(targetCompany.current_cheque_balance || 0) + (request.target_account === 'cheque' ? amount : 0);

    const payload = {
      name: targetCompany.name,
      email: targetCompany.email || '',
      address: targetCompany.address || null,
      phone: targetCompany.phone || null,
      website: targetCompany.website || null,
      country: targetCompany.country || null,
      currency: targetCompany.currency || null,
      current_cash_balance: nextCash,
      current_bank_balance: nextBank,
      current_cheque_balance: nextCheque,
      bank_accounts: targetCompany.bank_accounts || [],
      cheque_accounts: targetCompany.cheque_accounts || [],
    };

    try {
      setAcceptingRequestId(requestId);
      const res = await api.put(`/companies/${targetCompany.id}`, payload);
      const updatedCompany = res.data;

      setRows((prev) =>
        prev.map((company) => (company.id === targetCompany.id ? { ...company, ...updatedCompany } : company))
      );

      await api.post('/main-cash-transactions', {
        date: request.date,
        type: 'in',
        amount,
        reference: request.reference || null,
        note: `Accepted batch transfer. Dr ${request.target_account_label}, Cr Outlet - ${request.outlet_name}.${request.note ? ` ${request.note}` : ''}`,
      });

      await refreshJournalFromBackend();

      setPendingMainFundRequests((prev) => {
        const nextPending = prev.filter((entry) => entry.id !== requestId);
        localStorage.setItem('main_account_pending_fund_requests', JSON.stringify(nextPending));
        return nextPending;
      });

      setJournalPage(1);
      setTransferSuccess('Pending outlet transfer accepted and posted to main account.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to accept pending transfer.';
      setTransferError(apiMessage);
    } finally {
      setAcceptingRequestId('');
    }
  };

  const handleDeclineMainFundRequest = (requestId: string) => {
    const request = pendingMainFundRequests.find((entry) => entry.id === requestId);
    if (!request) {
      setTransferError('Pending request not found.');
      return;
    }

    try {
      setDecliningRequestId(requestId);
      setPendingMainFundRequests((prev) => {
        const nextPending = prev.filter((entry) => entry.id !== requestId);
        localStorage.setItem('main_account_pending_fund_requests', JSON.stringify(nextPending));
        return nextPending;
      });
      setTransferSuccess('Pending outlet transfer declined.');
    } finally {
      setDecliningRequestId('');
    }
  };

  const askPendingPostingChoice = (message: string): Promise<boolean> =>
    new Promise((resolve) => {
      openConfirmModal(
        'Confirm Posting',
        message,
        () => resolve(true),
        {
          confirmLabel: 'Yes',
          cancelLabel: 'No',
          onCancel: () => resolve(false),
        }
      );
    });

  const closePendingCardBankAccountModal = () => {
    setPendingCardBankAccountModal({
      open: false,
      title: '',
      message: '',
      companyName: '',
      bankAccounts: [],
    });
    setPendingCardBankAccountSelection('');
  };

  const runPendingCardBankAccountCancel = () => {
    const resolver = pendingCardBankAccountResolver;
    setPendingCardBankAccountResolver(null);
    closePendingCardBankAccountModal();
    if (resolver) resolver(null);
  };

  const runPendingCardBankAccountConfirm = () => {
    const resolver = pendingCardBankAccountResolver;
    const selectedId = Number(pendingCardBankAccountSelection || 0);
    setPendingCardBankAccountResolver(null);
    closePendingCardBankAccountModal();
    if (resolver) resolver(selectedId > 0 ? selectedId : null);
  };

  const askPendingCardBankAccountChoice = async (entry: PendingOutletTransfer): Promise<number | null> => {
    const sortedCompanies = [...rows].sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const receivingCompany = sortedCompanies[0] || null;

    if (!receivingCompany) {
      showNoticeModal('Bank Account Required', 'No company profile found for bank posting.', 'error');
      return null;
    }

    const bankAccounts = receivingCompany.bank_accounts || [];
    if (bankAccounts.length === 0) {
      showNoticeModal(
        'Bank Account Required',
        `No bank account found for ${receivingCompany.name}. Please add a company bank account first.`,
        'error'
      );
      return null;
    }

    const defaultBankAccountId = String(bankAccounts[0]?.id || '');
    setPendingCardBankAccountSelection(defaultBankAccountId);
    setPendingCardBankAccountModal({
      open: true,
      title: 'Select Company Bank Account',
      message: `To which account should card collection be credited? (Amount: ${money(Number(entry.card_collection_total || 0))})`,
      companyName: receivingCompany.name,
      bankAccounts,
    });

    return new Promise((resolve) => {
      setPendingCardBankAccountResolver(() => resolve);
    });
  };

  const handleAddPendingOutletTransfer = async (
    transferId: string,
    postingOptions?: {
      include_card_collection_to_bank_account: boolean;
      include_cash_collection_to_main_cash_account: boolean;
      include_start_amount_to_main_cash_account: boolean;
      card_collection_bank_account_id?: number | null;
    }
  ) => {
    if (!transferId) return;

    try {
      setProcessingPendingOutletTransferId(transferId);
      await api.post(`/outlet-cash-drawer-transfers/${transferId}/accept`, postingOptions || {});
      await Promise.all([refreshPendingOutletTransfers(), refreshJournalFromBackend(), refreshCompaniesFromBackend()]);
      setTransferSuccess('Pending outlet transfer added to main account.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to add pending outlet transfer.';
      setTransferError(apiMessage);
    } finally {
      setProcessingPendingOutletTransferId('');
    }
  };

  const handleAddPendingOutletTransferWithPrompts = async (entry: PendingOutletTransfer) => {
    const transferId = String(entry.id || '');
    if (!transferId) return;

    const includeCardChoice = await askPendingPostingChoice(
      `Do you add Card Collection To Bank Account? (Amount: ${money(Number(entry.card_collection_total || 0))})`
    );
    const selectedCardBankAccountId = includeCardChoice ? await askPendingCardBankAccountChoice(entry) : null;
    const includeCard = includeCardChoice && Number(selectedCardBankAccountId || 0) > 0;

    if (includeCardChoice && !includeCard) {
      showNoticeModal('Card Collection Skipped', 'Card collection will not be posted because no bank account was selected.', 'info');
    }

    const includeCash = await askPendingPostingChoice(
      `Do you add Cash Collection To Main Cash Account? (Amount: ${money(Number(entry.cash_collection_total || 0))})`
    );
    const includeStart = await askPendingPostingChoice(
      `Do you add Start Amount To Main Cash Account? (Amount: ${money(Number(entry.start_amount || 0))})`
    );

    if (!includeCard && !includeCash && !includeStart) {
      showNoticeModal('No Posting Selected', 'No amount selected. Pending transaction kept as pending.', 'info');
      return;
    }

    await handleAddPendingOutletTransfer(transferId, {
      include_card_collection_to_bank_account: includeCard,
      include_cash_collection_to_main_cash_account: includeCash,
      include_start_amount_to_main_cash_account: includeStart,
      card_collection_bank_account_id: includeCard ? Number(selectedCardBankAccountId) : null,
    });
  };

  const handleRejectPendingOutletTransfer = async (transferId: string) => {
    if (!transferId) return;

    try {
      setRejectingPendingOutletTransferId(transferId);
      await api.post(`/outlet-cash-drawer-transfers/${transferId}/reject`);
      await refreshPendingOutletTransfers();
      setTransferSuccess('Pending outlet transfer rejected.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to reject pending outlet transfer.';
      setTransferError(apiMessage);
    } finally {
      setRejectingPendingOutletTransferId('');
    }
  };

  const handleAcceptPendingDistributionBankTransfer = async (paymentId: string) => {
    if (!paymentId) return;

    try {
      setProcessingPendingDistributionBankTransferId(paymentId);
      await api.post(`/distribution/payments/${paymentId}/accept-main-account`);
      await Promise.all([
        refreshPendingDistributionBankTransfers(),
        refreshJournalFromBackend(),
        refreshCompaniesFromBackend(),
      ]);
      setTransferSuccess('Pending distribution bank transfer accepted and posted to main bank account.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to accept pending distribution bank transfer.';
      setTransferError(apiMessage);
    } finally {
      setProcessingPendingDistributionBankTransferId('');
    }
  };

  const handleRejectPendingDistributionBankTransfer = async (paymentId: string) => {
    if (!paymentId) return;

    try {
      setRejectingPendingDistributionBankTransferId(paymentId);
      await api.post(`/distribution/payments/${paymentId}/reject-main-account`);
      await Promise.all([
        refreshPendingDistributionBankTransfers(),
        refreshJournalFromBackend(),
      ]);
      setTransferSuccess('Pending distribution bank transfer rejected.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to reject pending distribution bank transfer.';
      setTransferError(apiMessage);
    } finally {
      setRejectingPendingDistributionBankTransferId('');
    }
  };

  const handleAcceptPendingDeliveryCompletionCashTransfer = async (transferId: string) => {
    if (!transferId) return;

    try {
      setProcessingPendingDeliveryCompletionCashTransferId(transferId);
      await api.post(`/delivery-completion-cash-transfers/${transferId}/accept`);
      await Promise.all([
        refreshPendingDeliveryCompletionCashTransfers(),
        refreshJournalFromBackend(),
        refreshCompaniesFromBackend(),
      ]);
      setTransferSuccess('Pending delivery completion cash transfer accepted and posted to main cash account.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to accept pending delivery completion cash transfer.';
      setTransferError(apiMessage);
    } finally {
      setProcessingPendingDeliveryCompletionCashTransferId('');
    }
  };

  const handleRejectPendingDeliveryCompletionCashTransfer = async (transferId: string) => {
    if (!transferId) return;

    try {
      setRejectingPendingDeliveryCompletionCashTransferId(transferId);
      await api.post(`/delivery-completion-cash-transfers/${transferId}/reject`);
      await refreshPendingDeliveryCompletionCashTransfers();
      setTransferSuccess('Pending delivery completion cash transfer rejected.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to reject pending delivery completion cash transfer.';
      setTransferError(apiMessage);
    } finally {
      setRejectingPendingDeliveryCompletionCashTransferId('');
    }
  };

  const handleTransfer = async () => {
    setTransferError('');
    setTransferSuccess('');

    if (!selectedCompany) {
      setTransferError('Please select a company.');
      return;
    }

    const amount = Number(transferForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setTransferError('Transfer amount must be greater than zero.');
      return;
    }

    const sourceType = transferForm.sourceType;
    const targetLedger = transferForm.targetLedger;
    const targetOutletAccount = transferForm.targetOutletAccount;

    if (targetLedger === 'outlet' && !selectedTransferOutlet) {
      setTransferError('Please select the target outlet.');
      return;
    }

    let sourceAccountLabel = 'Cash Account';
    let targetAccountLabel = '';
    let nextCashBalance = Number(selectedCompany.current_cash_balance || 0);
    const nextBankAccounts = [...(selectedCompany.bank_accounts || [])];

    if (sourceType === 'cash') {
      if (nextCashBalance < amount) {
        setTransferError('Insufficient cash balance for this transfer.');
        return;
      }
      nextCashBalance -= amount;
    } else {
      const bankIndex = nextBankAccounts.findIndex(
        (account) => String(account.id) === transferForm.sourceBankAccountId
      );

      if (bankIndex < 0) {
        setTransferError('Please select the source bank account.');
        return;
      }

      const bankBalance = Number(nextBankAccounts[bankIndex].current_balance || 0);
      if (bankBalance < amount) {
        setTransferError('Insufficient selected bank balance for this transfer.');
        return;
      }

      nextBankAccounts[bankIndex] = {
        ...nextBankAccounts[bankIndex],
        current_balance: bankBalance - amount,
      };

      sourceAccountLabel = formatBankAccountLabel(nextBankAccounts[bankIndex]);
    }

    const payload = {
      name: selectedCompany.name,
      email: selectedCompany.email || '',
      address: selectedCompany.address || null,
      phone: selectedCompany.phone || null,
      website: selectedCompany.website || null,
      country: selectedCompany.country || null,
      currency: selectedCompany.currency || null,
      current_cash_balance: nextCashBalance,
      current_cheque_balance: Number(selectedCompany.current_cheque_balance || 0),
      bank_accounts: nextBankAccounts,
      cheque_accounts: selectedCompany.cheque_accounts || [],
    };

    try {
      setTransferSaving(true);
      const res = await api.put(`/companies/${selectedCompany.id}`, payload);
      const updatedCompany = res.data;

      const nextRows = rows.map((company) =>
        company.id === selectedCompany.id ? { ...company, ...updatedCompany } : company
      );
      setRows(nextRows);

      const transferRequestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const reference = transferForm.reference.trim() || `TRF-${Date.now()}`;
      const note = transferForm.note.trim();
      const date = transferForm.date;

      if (targetLedger === 'petty' || targetLedger === 'delivery') {
        const targetLedgerKey = targetLedger === 'petty' ? 'accounts_petty_cash_ledger' : 'accounts_delivery_cash_ledger';
        const targetApiEndpoint = targetLedger === 'petty' ? '/petty-cash-transactions' : '/delivery-cash-transactions';
        targetAccountLabel = targetLedger === 'petty' ? 'Petty Cash Account' : 'Delivery Cash Account';

        const transferInEntry: LedgerEntry = {
          id: transferRequestId,
          date,
          type: 'in',
          amount,
          reference,
          note:
            note ||
            `Fund transfer received. Dr ${targetAccountLabel}, Cr ${sourceAccountLabel}.`,
        };

        await persistLedgerEntry(targetLedgerKey, targetApiEndpoint, transferInEntry);
      } else {
        if (!selectedTransferOutlet) {
          setTransferError('Please select the target outlet.');
          return;
        }

        const outletPendingKey = `outlet_account_pending_funds_${selectedTransferOutlet.id}`;

        const outletAccountLabel =
          targetOutletAccount === 'cash'
            ? 'Outlet Cash'
            : targetOutletAccount === 'bank'
              ? 'Outlet Bank'
              : 'Outlet Cheque';

        targetAccountLabel = `${selectedTransferOutlet.name} - ${outletAccountLabel}`;

        const existingPendingRequests = (() => {
          try {
            const raw = localStorage.getItem(outletPendingKey);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })();

        const pendingRequest = {
          id: transferRequestId,
          date,
          status: 'pending',
          account: targetOutletAccount,
          account_label: outletAccountLabel,
          source_company_name: selectedCompany.name,
          outlet_name: selectedTransferOutlet.name,
          source_account: sourceAccountLabel,
          credit_account: sourceAccountLabel,
          debit_account: outletAccountLabel,
          amount,
          debit_amount: amount,
          credit_amount: amount,
          reference,
          note:
            note ||
            `Pending transfer from ${selectedCompany.name}. Awaiting outlet acceptance.`,
        };

        localStorage.setItem(outletPendingKey, JSON.stringify([pendingRequest, ...existingPendingRequests]));
      }

      if (sourceType === 'cash') {
        const cashBookOut: LedgerEntry = {
          id: transferRequestId,
          date,
          type: 'out',
          amount,
          reference,
          note:
            note ||
            `Fund transfer issued. Dr ${targetAccountLabel}, Cr Cash Account.`,
        };
        await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', cashBookOut);
      } else {
        await api.post('/main-cash-transactions', {
          date,
          type: 'out',
          amount,
          reference: reference || null,
          note:
            note ||
            `Fund transfer issued. Dr ${targetAccountLabel}, Cr ${sourceAccountLabel}.`,
        });
      }

      await refreshJournalFromBackend();

      setTransferForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));
      setJournalPage(1);
      setTransferSuccess(
        targetLedger === 'outlet'
          ? 'Transfer sent to outlet as pending. Outlet user must accept to update outlet account.'
          : 'Transfer posted successfully using debit/credit journal treatment.'
      );
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to post transfer entry.';

      setTransferError(apiMessage);
    } finally {
      setTransferSaving(false);
    }
  };

  const handleAddCash = async () => {
    setAddCashError('');
    setAddCashSuccess('');

    if (!selectedAddCashCompany) {
      setAddCashError('Please select a company.');
      return;
    }

    const amount = Number(addCashForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setAddCashError('Add cash amount must be greater than zero.');
      return;
    }

    const nextCashBalance = Number(selectedAddCashCompany.current_cash_balance || 0) + amount;

    const payload = {
      name: selectedAddCashCompany.name,
      email: selectedAddCashCompany.email || '',
      address: selectedAddCashCompany.address || null,
      phone: selectedAddCashCompany.phone || null,
      website: selectedAddCashCompany.website || null,
      country: selectedAddCashCompany.country || null,
      currency: selectedAddCashCompany.currency || null,
      current_cash_balance: nextCashBalance,
      current_bank_balance: Number(selectedAddCashCompany.current_bank_balance || 0),
      current_cheque_balance: Number(selectedAddCashCompany.current_cheque_balance || 0),
      bank_accounts: selectedAddCashCompany.bank_accounts || [],
      cheque_accounts: selectedAddCashCompany.cheque_accounts || [],
    };

    try {
      setAddCashSaving(true);
      const res = await api.put(`/companies/${selectedAddCashCompany.id}`, payload);
      const updatedCompany = res.data;

      const nextRows = rows.map((company) =>
        company.id === selectedAddCashCompany.id ? { ...company, ...updatedCompany } : company
      );
      setRows(nextRows);

      const reference = addCashForm.reference.trim() || `ADD-${Date.now()}`;
      const note = addCashForm.note.trim();
      const date = addCashForm.date;
      const creditAccount = addCashForm.creditAccount.trim() || 'Capital Injection';

      const addCashEntry: LedgerEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        type: 'in',
        amount,
        reference,
        note:
          note ||
          `Main cash added. Dr Main Cash Account, Cr ${creditAccount}.`,
      };

      await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', addCashEntry);
      await refreshJournalFromBackend();

      setAddCashForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));
      setJournalPage(1);
      setAddCashSuccess('Cash added to main account successfully with journal entry.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to add cash to main account.';

      setAddCashError(apiMessage);
    } finally {
      setAddCashSaving(false);
    }
  };

  const handleWithdraw = async () => {
    setWithdrawError('');
    setWithdrawSuccess('');

    if (!selectedWithdrawCompany) {
      setWithdrawError('Please select a company.');
      return;
    }

    const amount = Number(withdrawForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      setWithdrawError('Withdrawal amount must be greater than zero.');
      return;
    }

    const sourceType = withdrawForm.sourceType;
    let sourceAccountLabel = 'Cash Account';
    let nextCashBalance = Number(selectedWithdrawCompany.current_cash_balance || 0);
    const nextBankAccounts = [...(selectedWithdrawCompany.bank_accounts || [])];

    if (sourceType === 'cash') {
      if (nextCashBalance < amount) {
        setWithdrawError('Insufficient cash balance for this withdrawal.');
        return;
      }
      nextCashBalance -= amount;
    } else {
      const bankIndex = nextBankAccounts.findIndex(
        (account) => String(account.id) === withdrawForm.sourceBankAccountId
      );

      if (bankIndex < 0) {
        setWithdrawError('Please select the source bank account.');
        return;
      }

      const bankBalance = Number(nextBankAccounts[bankIndex].current_balance || 0);
      if (bankBalance < amount) {
        setWithdrawError('Insufficient selected bank balance for this withdrawal.');
        return;
      }

      nextBankAccounts[bankIndex] = {
        ...nextBankAccounts[bankIndex],
        current_balance: bankBalance - amount,
      };

      sourceAccountLabel = formatBankAccountLabel(nextBankAccounts[bankIndex]);
    }

    const payload = {
      name: selectedWithdrawCompany.name,
      email: selectedWithdrawCompany.email || '',
      address: selectedWithdrawCompany.address || null,
      phone: selectedWithdrawCompany.phone || null,
      website: selectedWithdrawCompany.website || null,
      country: selectedWithdrawCompany.country || null,
      currency: selectedWithdrawCompany.currency || null,
      current_cash_balance: nextCashBalance,
      current_cheque_balance: Number(selectedWithdrawCompany.current_cheque_balance || 0),
      bank_accounts: nextBankAccounts,
      cheque_accounts: selectedWithdrawCompany.cheque_accounts || [],
    };

    try {
      setWithdrawSaving(true);
      const res = await api.put(`/companies/${selectedWithdrawCompany.id}`, payload);
      const updatedCompany = res.data;

      const nextRows = rows.map((company) =>
        company.id === selectedWithdrawCompany.id ? { ...company, ...updatedCompany } : company
      );
      setRows(nextRows);

      const reference = withdrawForm.reference.trim() || `WDR-${Date.now()}`;
      const note = withdrawForm.note.trim();
      const date = withdrawForm.date;
      const debitAccount = withdrawForm.debitAccount.trim() || 'Cash Withdrawal Expense';

      const withdrawalEntry: LedgerEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date,
        type: 'out',
        amount,
        reference,
        note:
          note ||
          `Cash withdrawal posted. Dr ${debitAccount}, Cr ${sourceAccountLabel}.`,
      };

      await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', withdrawalEntry);

      await refreshJournalFromBackend();

      setWithdrawForm((prev) => ({
        ...prev,
        amount: '',
        reference: '',
        note: '',
      }));
      setJournalPage(1);
      setWithdrawSuccess('Withdrawal posted successfully with debit/credit journal entry.');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to post withdrawal entry.';

      setWithdrawError(apiMessage);
    } finally {
      setWithdrawSaving(false);
    }
  };

  const openDepositModal = (company: CompanyProfile) => {
    const firstBankId = company.bank_accounts?.[0]?.id ? String(company.bank_accounts[0].id) : '';
    setDepositForm({
      companyId: String(company.id),
      sourceType: 'cash',
      bankAccountId: firstBankId,
      amount: '',
      date: new Date().toISOString().split('T')[0],
      reference: '',
      note: '',
    });
    setShowDepositModal(true);
  };

  const openAddBankAccountModal = (company: CompanyProfile) => {
    setAddBankAccountForm({
      companyId: String(company.id),
      bankName: '',
      branch: '',
      accountNo: '',
      openingBalance: '',
    });
    setShowAddBankAccountModal(true);
  };

  const openBankHistoryModal = (company: CompanyProfile) => {
    setSelectedBankHistoryCompanyId(String(company.id));
    setShowBankHistoryModal(true);
  };

  const openCashHistoryModal = (company: CompanyProfile) => {
    setSelectedCashHistoryCompanyId(String(company.id));
    setShowCashHistoryModal(true);
  };

  const openChequeHistoryModal = (company: CompanyProfile) => {
    setSelectedChequeHistoryCompanyId(String(company.id));
    setShowChequeHistoryModal(true);
  };

  const closeBankHistoryModal = () => {
    setShowBankHistoryModal(false);
    setSelectedBankHistoryCompanyId('');
  };

  const closeCashHistoryModal = () => {
    setShowCashHistoryModal(false);
    setSelectedCashHistoryCompanyId('');
  };

  const closeChequeHistoryModal = () => {
    setShowChequeHistoryModal(false);
    setSelectedChequeHistoryCompanyId('');
  };

  const closeDepositModal = () => {
    setShowDepositModal(false);
    setDepositForm((prev) => ({
      ...prev,
      amount: '',
      reference: '',
      note: '',
    }));
  };

  const closeAddBankAccountModal = () => {
    setShowAddBankAccountModal(false);
    setAddBankAccountForm((prev) => ({
      ...prev,
      bankName: '',
      branch: '',
      accountNo: '',
      openingBalance: '',
    }));
  };

  const openEditCashBalanceModal = (company: CompanyProfile) => {
    if (!isAdminUser) {
      showNoticeModal('Access Denied', 'Only admin users can edit cash balance.', 'error');
      return;
    }

    setEditCashBalanceForm({
      companyId: String(company.id),
      amount: String(Number(company.current_cash_balance || 0)),
      note: '',
    });
    setShowEditCashBalanceModal(true);
  };

  const openEditBankBalanceModal = (company: CompanyProfile) => {
    if (!isAdminUser) {
      showNoticeModal('Access Denied', 'Only admin users can edit bank balance.', 'error');
      return;
    }

    const bankAccounts = company.bank_accounts || [];
    if (bankAccounts.length === 0) {
      showNoticeModal('Update Failed', 'No bank account found for this company.', 'error');
      return;
    }

    const firstBankAccount = bankAccounts[0];
    setEditBankBalanceForm({
      companyId: String(company.id),
      bankAccountId: String(firstBankAccount.id),
      amount: String(Number(firstBankAccount.current_balance || 0)),
      note: '',
    });
    setShowEditBankBalanceModal(true);
  };

  const closeEditCashBalanceModal = () => {
    setShowEditCashBalanceModal(false);
    setEditCashBalanceForm((prev) => ({
      ...prev,
      amount: '',
      note: '',
    }));
  };

  const closeEditBankBalanceModal = () => {
    setShowEditBankBalanceModal(false);
    setEditBankBalanceForm((prev) => ({
      ...prev,
      bankAccountId: '',
      amount: '',
      note: '',
    }));
  };

  const handleEditCashBalance = async () => {
    if (!isAdminUser) {
      showNoticeModal('Access Denied', 'Only admin users can edit cash balance.', 'error');
      return;
    }

    if (!selectedEditCashCompany) {
      showNoticeModal('Update Failed', 'Please select a company.', 'error');
      return;
    }

    const nextCashBalance = Number(editCashBalanceForm.amount || 0);
    if (Number.isNaN(nextCashBalance) || nextCashBalance < 0) {
      showNoticeModal('Update Failed', 'Cash balance must be a valid non-negative amount.', 'error');
      return;
    }

    const payload = {
      name: selectedEditCashCompany.name,
      email: selectedEditCashCompany.email || '',
      address: selectedEditCashCompany.address || null,
      phone: selectedEditCashCompany.phone || null,
      website: selectedEditCashCompany.website || null,
      country: selectedEditCashCompany.country || null,
      currency: selectedEditCashCompany.currency || null,
      current_cash_balance: nextCashBalance,
      current_bank_balance: Number(selectedEditCashCompany.current_bank_balance || 0),
      current_cheque_balance: Number(selectedEditCashCompany.current_cheque_balance || 0),
      bank_accounts: selectedEditCashCompany.bank_accounts || [],
      cheque_accounts: selectedEditCashCompany.cheque_accounts || [],
    };

    try {
      setEditCashBalanceSaving(true);
      const res = await api.put(`/companies/${selectedEditCashCompany.id}`, payload);
      const updatedCompany = res.data;

      setRows((prev) =>
        prev.map((company) =>
          company.id === selectedEditCashCompany.id ? { ...company, ...updatedCompany } : company
        )
      );

      const note = editCashBalanceForm.note.trim();
      if (note) {
        const adjustmentAmount = Math.abs(nextCashBalance - Number(selectedEditCashCompany.current_cash_balance || 0));
        if (adjustmentAmount > 0) {
          const adjustmentType = nextCashBalance >= Number(selectedEditCashCompany.current_cash_balance || 0) ? 'in' : 'out';
          await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            date: new Date().toISOString().split('T')[0],
            type: adjustmentType,
            amount: adjustmentAmount,
            reference: `CSH-ADJ-${Date.now()}`,
            note: `Admin cash balance adjustment for ${selectedEditCashCompany.name}. ${note}`,
          });
          await refreshJournalFromBackend();
        }
      }

      closeEditCashBalanceModal();
      showNoticeModal('Cash Balance Updated', 'Company cash balance updated successfully.', 'success');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to update cash balance.';

      showNoticeModal('Update Failed', apiMessage, 'error');
    } finally {
      setEditCashBalanceSaving(false);
    }
  };

  const handleEditBankBalance = async () => {
    if (!isAdminUser) {
      showNoticeModal('Access Denied', 'Only admin users can edit bank balance.', 'error');
      return;
    }

    if (!selectedEditBankCompany) {
      showNoticeModal('Update Failed', 'Please select a company.', 'error');
      return;
    }

    if (!selectedEditBankAccount) {
      showNoticeModal('Update Failed', 'Please select a bank account.', 'error');
      return;
    }

    const nextBankAccountBalance = Number(editBankBalanceForm.amount || 0);
    if (Number.isNaN(nextBankAccountBalance) || nextBankAccountBalance < 0) {
      showNoticeModal('Update Failed', 'Bank balance must be a valid non-negative amount.', 'error');
      return;
    }

    const nextBankAccounts = (selectedEditBankCompany.bank_accounts || []).map((account) =>
      account.id === selectedEditBankAccount.id
        ? { ...account, current_balance: nextBankAccountBalance }
        : account
    );

    const nextBankBalanceTotal = nextBankAccounts.reduce(
      (sum, account) => sum + Number(account.current_balance || 0),
      0
    );

    const payload = {
      name: selectedEditBankCompany.name,
      email: selectedEditBankCompany.email || '',
      address: selectedEditBankCompany.address || null,
      phone: selectedEditBankCompany.phone || null,
      website: selectedEditBankCompany.website || null,
      country: selectedEditBankCompany.country || null,
      currency: selectedEditBankCompany.currency || null,
      current_cash_balance: Number(selectedEditBankCompany.current_cash_balance || 0),
      current_bank_balance: Number(nextBankBalanceTotal || 0),
      current_cheque_balance: Number(selectedEditBankCompany.current_cheque_balance || 0),
      bank_accounts: nextBankAccounts,
      cheque_accounts: selectedEditBankCompany.cheque_accounts || [],
    };

    try {
      setEditBankBalanceSaving(true);
      const res = await api.put(`/companies/${selectedEditBankCompany.id}`, payload);
      const updatedCompany = res.data;

      setRows((prev) =>
        prev.map((company) =>
          company.id === selectedEditBankCompany.id ? { ...company, ...updatedCompany } : company
        )
      );

      const note = editBankBalanceForm.note.trim();
      const currentBalance = Number(selectedEditBankAccount.current_balance || 0);
      const adjustmentAmount = Math.abs(nextBankAccountBalance - currentBalance);

      if (adjustmentAmount > 0) {
        const isIncrease = nextBankAccountBalance >= currentBalance;
        const bankLabel = `Bank - ${selectedEditBankAccount.bank_name || 'Account'}${selectedEditBankAccount.branch ? ` - ${selectedEditBankAccount.branch}` : ''}${selectedEditBankAccount.account_no ? ` (A/C: ${selectedEditBankAccount.account_no})` : ''}`;
        await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date: new Date().toISOString().split('T')[0],
          type: isIncrease ? 'in' : 'out',
          amount: adjustmentAmount,
          reference: `${isIncrease ? 'DEP' : 'WDR'}-BNK-ADJ-${Date.now()}`,
          note: isIncrease
            ? `Admin bank balance adjustment. Dr ${bankLabel}, Cr Bank Balance Adjustment.${note ? ` ${note}` : ''}`
            : `Admin bank balance adjustment. Dr Bank Balance Adjustment, Cr ${bankLabel}.${note ? ` ${note}` : ''}`,
        });
        await refreshJournalFromBackend();
      }

      closeEditBankBalanceModal();
      showNoticeModal('Bank Balance Updated', 'Bank balance updated successfully.', 'success');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to update bank balance.';

      showNoticeModal('Update Failed', apiMessage, 'error');
    } finally {
      setEditBankBalanceSaving(false);
    }
  };

  const handleCreateBankAccount = async () => {
    if (!selectedAddBankCompany) {
      showNoticeModal('Bank Account Create Failed', 'Please select a company.', 'error');
      return;
    }

    const bankName = addBankAccountForm.bankName.trim();
    const branch = addBankAccountForm.branch.trim();
    const accountNo = addBankAccountForm.accountNo.trim();
    const openingBalance = Number(addBankAccountForm.openingBalance || 0);

    if (!bankName) {
      showNoticeModal('Bank Account Create Failed', 'Bank name is required.', 'error');
      return;
    }

    if (!accountNo) {
      showNoticeModal('Bank Account Create Failed', 'Account number is required.', 'error');
      return;
    }

    if (Number.isNaN(openingBalance) || openingBalance < 0) {
      showNoticeModal('Bank Account Create Failed', 'Opening balance cannot be negative.', 'error');
      return;
    }

    try {
      setAddBankAccountSaving(true);
      const res = await api.post(`/companies/${selectedAddBankCompany.id}/bank-accounts`, {
        bank_name: bankName,
        branch: branch || null,
        account_no: accountNo,
        current_balance: openingBalance,
      });

      const updatedCompany = res.data;
      setRows((prev) =>
        prev.map((company) =>
          company.id === selectedAddBankCompany.id ? { ...company, ...updatedCompany } : company
        )
      );

      if (depositForm.companyId === String(selectedAddBankCompany.id)) {
        const updatedBankAccounts: CompanyAccountEntry[] = Array.isArray(updatedCompany?.bank_accounts)
          ? updatedCompany.bank_accounts
          : [];
        const newestBankId = updatedBankAccounts.length
          ? updatedBankAccounts[updatedBankAccounts.length - 1]?.id
          : null;
        if (newestBankId) {
          setDepositForm((prev) => ({ ...prev, bankAccountId: String(newestBankId) }));
        }
      }

      closeAddBankAccountModal();
      showNoticeModal('Bank Account Created', 'New company bank account created successfully.', 'success');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to create bank account.';

      showNoticeModal('Bank Account Create Failed', apiMessage, 'error');
    } finally {
      setAddBankAccountSaving(false);
    }
  };

  const getMainCashTransactionIdFromJournal = (entry: MainJournalRow): string | null => {
    const rawId = String(entry.id || '').trim();
    if (!rawId.startsWith('main-tx-')) return null;
    const txId = rawId.replace('main-tx-', '').trim();
    return txId ? txId : null;
  };

  const handleDeleteJournalEntry = async (entry: MainJournalRow) => {
    if (!isAdminUser) {
      showNoticeModal('Access Denied', 'Only admin users can delete journal records.', 'error');
      return;
    }

    const transactionId = getMainCashTransactionIdFromJournal(entry);
    if (!transactionId) {
      showNoticeModal('Delete Not Allowed', 'This record cannot be deleted from this table.', 'error');
      return;
    }

    try {
      setDeletingJournalEntryId(String(entry.id));
      await api.delete(`/main-cash-transactions/${transactionId}`);
      await refreshJournalFromBackend();
      showNoticeModal('Record Deleted', 'Journal record deleted successfully.', 'success');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to delete journal record.';

      showNoticeModal('Delete Failed', apiMessage, 'error');
    } finally {
      setDeletingJournalEntryId('');
    }
  };

  const handleDepositBank = async () => {
    if (!selectedDepositCompany) {
      showNoticeModal('Deposit Failed', 'Please select a company for this deposit.', 'error');
      return;
    }

    const amount = Number(depositForm.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      showNoticeModal('Deposit Failed', 'Deposit amount must be greater than zero.', 'error');
      return;
    }

    const bankIndex = (selectedDepositCompany.bank_accounts || []).findIndex(
      (account) => String(account.id) === depositForm.bankAccountId
    );

    if (bankIndex < 0) {
      showNoticeModal('Deposit Failed', 'Please select a target bank account.', 'error');
      return;
    }

    const currentCash = Number(selectedDepositCompany.current_cash_balance || 0);
    const currentCheque = Number(selectedDepositCompany.current_cheque_balance || 0);
    const currentBank = Number(selectedDepositCompany.current_bank_balance || 0);

    if (depositForm.sourceType === 'cash' && currentCash < amount) {
      showNoticeModal('Deposit Failed', 'Insufficient cash balance for this deposit.', 'error');
      return;
    }

    if (depositForm.sourceType === 'cheque' && currentCheque < amount) {
      showNoticeModal('Deposit Failed', 'Insufficient cheque balance for this deposit.', 'error');
      return;
    }

    const nextBankAccounts = [...(selectedDepositCompany.bank_accounts || [])];
    const selectedBank = nextBankAccounts[bankIndex];
    const selectedBankLabel = formatBankAccountLabel(selectedBank);

    nextBankAccounts[bankIndex] = {
      ...selectedBank,
      current_balance: Number(selectedBank.current_balance || 0) + amount,
    };

    const payload = {
      name: selectedDepositCompany.name,
      email: selectedDepositCompany.email || '',
      address: selectedDepositCompany.address || null,
      phone: selectedDepositCompany.phone || null,
      website: selectedDepositCompany.website || null,
      country: selectedDepositCompany.country || null,
      currency: selectedDepositCompany.currency || null,
      current_cash_balance: depositForm.sourceType === 'cash' ? currentCash - amount : currentCash,
      current_bank_balance: currentBank + amount,
      current_cheque_balance: depositForm.sourceType === 'cheque' ? currentCheque - amount : currentCheque,
      bank_accounts: nextBankAccounts,
      cheque_accounts: selectedDepositCompany.cheque_accounts || [],
    };

    try {
      setDepositSaving(true);
      const res = await api.put(`/companies/${selectedDepositCompany.id}`, payload);
      const updatedCompany = res.data;

      setRows((prev) =>
        prev.map((company) => (company.id === selectedDepositCompany.id ? { ...company, ...updatedCompany } : company))
      );

      const reference = depositForm.reference.trim() || `DEP-${Date.now()}`;
      const date = depositForm.date;
      const note = depositForm.note.trim();

      if (depositForm.sourceType === 'cash' || depositForm.sourceType === 'external_cash') {
        const depositEntry: LedgerEntry = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date,
          type: depositForm.sourceType === 'cash' ? 'out' : 'in',
          amount,
          reference,
          note:
            note ||
            (depositForm.sourceType === 'cash'
              ? `Bank deposit posted. Dr ${selectedBankLabel}, Cr Cash Account.`
              : `Bank deposit posted. Dr ${selectedBankLabel}, Cr External Cash.`),
        };

        await persistLedgerEntry('accounts_cash_book_ledger', '/main-cash-transactions', depositEntry);
        await refreshJournalFromBackend();
      }

      setJournalPage(1);
      closeDepositModal();
      showNoticeModal('Deposit Posted', 'Bank deposit posted successfully.', 'success');
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 401) {
        localStorage.removeItem('token');
        setToken('');
        router.push('/');
        return;
      }

      const apiMessage =
        (isAxiosError(error) && (error.response?.data?.message as string)) ||
        'Failed to post bank deposit.';

      showNoticeModal('Deposit Failed', apiMessage, 'error');
    } finally {
      setDepositSaving(false);
    }
  };

  const renderAccountBalances = (
    accounts: CompanyAccountEntry[] | undefined,
    tone: 'bank' | 'cheque',
    company?: CompanyProfile
  ) => {
    if (!accounts || accounts.length === 0) {
      return <span className="text-xs text-gray-400">No accounts</span>;
    }

    const bankBalancesByAccountNo = new Map<string, number>();
    if (tone === 'cheque' && company) {
      (company.bank_accounts || []).forEach((bankAccount) => {
        const key = normalizeAccountNo(bankAccount.account_no);
        if (!key) return;
        bankBalancesByAccountNo.set(key, Number(bankAccount.current_balance || 0));
      });
    }

    return (
      <div className="space-y-2">
        {accounts.map((account) => {
          const accountNoKey = normalizeAccountNo(account.account_no);
          const linkedBankBalance = accountNoKey ? bankBalancesByAccountNo.get(accountNoKey) : undefined;
          const hasLinkedBankBalance = tone === 'cheque' && typeof linkedBankBalance === 'number';
          const displayBalance = hasLinkedBankBalance
            ? Number(linkedBankBalance || 0)
            : Number(account.current_balance || 0);

          return (
            <div key={account.id} className="rounded-lg border border-gray-100 bg-gray-50/70 px-2 py-1.5">
              <p className="text-xs font-semibold text-gray-800 truncate">
                {account.bank_name || (tone === 'bank' ? 'Bank Account' : 'Cheque Account')}
              </p>
              {account.branch ? <p className="text-[11px] text-gray-500 truncate">Branch: {account.branch}</p> : null}
              <p className="text-[11px] text-gray-500 truncate">A/C: {account.account_no || '-'}</p>
              <p className={`text-xs font-bold ${tone === 'bank' ? 'text-sky-700' : 'text-violet-700'}`}>
                {money(displayBalance)}
              </p>
            </div>
          );
        })}
      </div>
    );
  };

  if (!token || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.16),_transparent_28%),linear-gradient(180deg,_#f0fdf9_0%,_#ecfeff_45%,_#f0fdfa_100%)]">
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(6,182,212,0.14),_transparent_28%),linear-gradient(180deg,_#f0fdf9_0%,_#ecfeff_45%,_#f0fdfa_100%)]">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-20 left-20 w-72 h-72 bg-emerald-200 rounded-full mix-blend-multiply filter blur-xl"></div>
        <div className="absolute top-40 right-20 w-72 h-72 bg-teal-200 rounded-full mix-blend-multiply filter blur-xl"></div>
      </div>

      <nav className="relative z-10 bg-white/80 backdrop-blur-lg shadow-lg border-b border-white/20">
        <div className="w-full px-3 sm:px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center h-auto sm:h-16 py-3 gap-3">
            <div className="flex items-center justify-between sm:justify-start gap-3">
              <Link href="/dashboard/accounts" className="flex items-center space-x-2 text-gray-700 hover:text-teal-600">
                <span>←</span>
                <span className="font-medium text-sm sm:text-base">Back to Accounts</span>
              </Link>
            </div>
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              <span>Live Company Main Account</span>
            </div>
          </div>
        </div>
      </nav>

      <main className="relative z-10 w-full py-8 px-3 sm:px-4 lg:px-6 space-y-8">
        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-white/80 shadow-[0_24px_90px_-42px_rgba(13,148,136,0.55)] backdrop-blur-xl">
          <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-semibold text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                Live company finance control
              </div>
              <h1 className="mt-4 text-3xl sm:text-4xl font-bold text-slate-900">Company Main Account</h1>
              <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl">
                Live balance view from company cash, bank, and cheque accounting records.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-emerald-300/70 bg-gradient-to-br from-emerald-500 to-teal-500 p-5 text-white shadow-lg shadow-emerald-300/45">
                <p className="text-xs uppercase tracking-[0.2em] text-white/85">Grand Total</p>
                <p className="mt-2 text-3xl font-bold">{money(summary.grandTotal)}</p>
              </div>
              <div className="rounded-3xl border border-emerald-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">Total Cash</p>
                <p className="mt-2 text-lg font-bold text-emerald-800">{money(summary.totalCash)}</p>
              </div>
              <div className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Total Bank</p>
                <p className="mt-2 text-lg font-bold text-sky-800">{money(summary.totalBank)}</p>
              </div>
              <div className="rounded-3xl border border-violet-200 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-violet-700">Total Cheque (Bank-Aligned)</p>
                <p className="mt-2 text-lg font-bold text-violet-800">{money(summary.totalCheque)}</p>
                {summary.overlappedCheque > 0 ? (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Raw: {money(summary.totalChequeRaw)} | Mirrored to bank: {money(summary.overlappedBankMirror)}
                  </p>
                ) : null}
                {summary.totalChequeNetForGrand !== summary.totalCheque ? (
                  <p className="mt-1 text-[11px] text-slate-600">
                    Grand total counts only non-overlapped cheque: {money(summary.totalChequeNetForGrand)}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Main Account Entry Actions</h2>
              <p className="text-sm text-gray-600 mt-1">
                Open the posting panel to add cash, transfer funds, or post withdrawals.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPostingModal(true)}
              className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700"
            >
              Open Posting Panel
            </button>
          </div>
        </section>

        {showPostingModal && typeof window !== 'undefined'
          ? createPortal(
          <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="relative mx-auto w-full max-w-[1400px] overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_35px_140px_-50px_rgba(5,150,105,0.55)]">
              <div className="relative max-h-[92vh] overflow-y-auto overscroll-contain">
                <div className="bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.35),_transparent_48%),linear-gradient(130deg,_rgba(6,95,70,0.95)_0%,_rgba(13,148,136,0.9)_52%,_rgba(20,184,166,0.86)_100%)]">
                  <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                    <div>
                      <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-xl">🧾</div>
                      <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Main Account Posting Panel</h3>
                      <p className="mt-2 text-sm text-white/85 sm:text-base">
                        Add Cash, Fund Transfer, and Cash Withdrawal forms in one modal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowPostingModal(false)}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                    >
                      <span className="text-2xl">&times;</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
                  <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Add Cash to Main Account</h2>
            <p className="text-sm text-gray-600 mt-1">
              Accounting entry: main cash account is <span className="font-semibold">Debit</span>, source/funding account is <span className="font-semibold">Credit</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <select
              value={addCashForm.companyId}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, companyId: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            >
              <option value="">Select Company</option>
              {rows.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={addCashForm.creditAccount}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, creditAccount: e.target.value }))}
              placeholder="Credit Account (e.g. Capital Injection)"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <input
              type="date"
              value={addCashForm.date}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={addCashForm.amount}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={addCashForm.reference}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={addCashForm.note}
              onChange={(e) => setAddCashForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <button
              type="button"
              onClick={() =>
                openConfirmModal(
                  'Post Add Cash?',
                  'Confirm adding this cash amount to the selected main account.',
                  handleAddCash
                )
              }
              disabled={addCashSaving}
              className="rounded-full bg-gradient-to-r from-emerald-600 to-cyan-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-emerald-700 hover:to-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {addCashSaving ? 'Posting...' : 'Post Add Cash'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fund Transfer to Petty/Delivery/Outlet</h2>
            <p className="text-sm text-gray-600 mt-1">
              Accounting entry: target account is <span className="font-semibold">Debit</span>, source cash/bank is <span className="font-semibold">Credit</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <select
              value={transferForm.companyId}
              onChange={(e) =>
                setTransferForm((prev) => ({
                  ...prev,
                  companyId: e.target.value,
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            >
              <option value="">Select Company</option>
              {rows.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>

            <select
              value={transferForm.sourceType}
              onChange={(e) =>
                setTransferForm((prev) => ({
                  ...prev,
                  sourceType: e.target.value as 'cash' | 'bank',
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            >
              <option value="cash">Source: Cash Account (Credit)</option>
              <option value="bank">Source: Bank Account (Credit)</option>
            </select>

            {transferForm.sourceType === 'bank' ? (
              <select
                value={transferForm.sourceBankAccountId}
                onChange={(e) => setTransferForm((prev) => ({ ...prev, sourceBankAccountId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
              >
                <option value="">Select Source Bank Account</option>
                {availableBankAccounts.map((bank) => (
                  <option key={bank.id} value={String(bank.id)}>
                    {(bank.bank_name || 'Bank Account') +
                      (bank.branch ? ` - ${bank.branch}` : '') +
                      ` (${money(Number(bank.current_balance || 0))})`}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={transferForm.targetLedger}
                onChange={(e) =>
                  setTransferForm((prev) => ({
                    ...prev,
                    targetLedger: e.target.value as 'petty' | 'delivery' | 'outlet',
                    targetOutletId: e.target.value === 'outlet' ? prev.targetOutletId : '',
                  }))
                }
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="petty">Debit: Petty Cash Account</option>
                <option value="delivery">Debit: Delivery Cash Account</option>
                <option value="outlet">Debit: Outlet Account</option>
              </select>
            )}

            {transferForm.sourceType === 'bank' ? (
              <select
                value={transferForm.targetLedger}
                onChange={(e) =>
                  setTransferForm((prev) => ({
                    ...prev,
                    targetLedger: e.target.value as 'petty' | 'delivery' | 'outlet',
                    targetOutletId: e.target.value === 'outlet' ? prev.targetOutletId : '',
                  }))
                }
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="petty">Debit: Petty Cash Account</option>
                <option value="delivery">Debit: Delivery Cash Account</option>
                <option value="outlet">Debit: Outlet Account</option>
              </select>
            ) : null}

            {transferForm.targetLedger === 'outlet' ? (
              <select
                value={transferForm.targetOutletId}
                onChange={(e) => setTransferForm((prev) => ({ ...prev, targetOutletId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="">Select Outlet</option>
                {outlets.map((outlet) => (
                  <option key={outlet.id} value={String(outlet.id)}>
                    {outlet.name + (outlet.code ? ` (${outlet.code})` : '')}
                  </option>
                ))}
              </select>
            ) : null}

            {transferForm.targetLedger === 'outlet' ? (
              <select
                value={transferForm.targetOutletAccount}
                onChange={(e) =>
                  setTransferForm((prev) => ({
                    ...prev,
                    targetOutletAccount: e.target.value as 'cash' | 'bank' | 'cheque',
                  }))
                }
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="cash">Debit Outlet Cash</option>
                <option value="bank">Debit Outlet Bank</option>
                <option value="cheque">Debit Outlet Cheque</option>
              </select>
            ) : null}

            <input
              type="date"
              value={transferForm.date}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={transferForm.amount}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={transferForm.reference}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={transferForm.note}
              onChange={(e) => setTransferForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <button
              type="button"
              onClick={() =>
                openConfirmModal(
                  'Post Transfer?',
                  'Confirm posting this transfer to the selected target ledger.',
                  handleTransfer
                )
              }
              disabled={transferSaving}
              className="rounded-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {transferSaving ? 'Posting...' : 'Post Transfer'}
            </button>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] p-5 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Cash/Bank Withdrawals (Funds Out)</h2>
            <p className="text-sm text-gray-600 mt-1">
              Accounting entry: withdrawal/expense account is <span className="font-semibold">Debit</span>, source cash/bank is <span className="font-semibold">Credit</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-8 gap-3">
            <select
              value={withdrawForm.companyId}
              onChange={(e) =>
                setWithdrawForm((prev) => ({
                  ...prev,
                  companyId: e.target.value,
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            >
              <option value="">Select Company</option>
              {rows.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </select>

            <select
              value={withdrawForm.sourceType}
              onChange={(e) =>
                setWithdrawForm((prev) => ({
                  ...prev,
                  sourceType: e.target.value as 'cash' | 'bank',
                  sourceBankAccountId: '',
                }))
              }
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            >
              <option value="cash">Source: Cash Account (Credit)</option>
              <option value="bank">Source: Bank Account (Credit)</option>
            </select>

            {withdrawForm.sourceType === 'bank' ? (
              <select
                value={withdrawForm.sourceBankAccountId}
                onChange={(e) => setWithdrawForm((prev) => ({ ...prev, sourceBankAccountId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
              >
                <option value="">Select Source Bank Account</option>
                {availableWithdrawBankAccounts.map((bank) => (
                  <option key={bank.id} value={String(bank.id)}>
                    {(bank.bank_name || 'Bank Account') +
                      (bank.branch ? ` - ${bank.branch}` : '') +
                      ` (${money(Number(bank.current_balance || 0))})`}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={withdrawForm.debitAccount}
                onChange={(e) => setWithdrawForm((prev) => ({ ...prev, debitAccount: e.target.value }))}
                placeholder="Debit Account (e.g. Expense)"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
              />
            )}

            {withdrawForm.sourceType === 'bank' ? (
              <input
                type="text"
                value={withdrawForm.debitAccount}
                onChange={(e) => setWithdrawForm((prev) => ({ ...prev, debitAccount: e.target.value }))}
                placeholder="Debit Account (e.g. Expense)"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />
            ) : null}

            <input
              type="date"
              value={withdrawForm.date}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, date: e.target.value }))}
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="number"
              min="0"
              step="0.01"
              value={withdrawForm.amount}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="Amount"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={withdrawForm.reference}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, reference: e.target.value }))}
              placeholder="Reference"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
            />

            <input
              type="text"
              value={withdrawForm.note}
              onChange={(e) => setWithdrawForm((prev) => ({ ...prev, note: e.target.value }))}
              placeholder="Narration"
              className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 md:col-span-2 shadow-sm"
            />

            <button
              type="button"
              onClick={() =>
                openConfirmModal(
                  'Post Withdrawal?',
                  'Confirm posting this withdrawal from the selected source account.',
                  handleWithdraw
                )
              }
              disabled={withdrawSaving}
              className="rounded-full bg-gradient-to-r from-rose-600 to-orange-600 text-white text-sm font-semibold px-5 py-2.5 hover:from-rose-700 hover:to-orange-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {withdrawSaving ? 'Posting...' : 'Post Withdrawal'}
            </button>
          </div>
        </section>
                </div>
              </div>
            </div>
          </div>
            , document.body)
          : null}

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] overflow-hidden">
          {rows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500">No company balance records found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] divide-y divide-gray-200">
                <thead className="bg-slate-100/90">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Company</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Cash Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Bank Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Cheque Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Bank Account Balances</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Cheque Account Balances</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {rows.map((company, idx) => {
                    const cash = Number(company.current_cash_balance || 0);
                    const bank = Number(company.current_bank_balance || 0);
                    const cheque = getCompanyAdjustedChequeBalance(company);
                    const overlapInfo = resolveCompanyOverlapInfo(company);
                    const displayTotal = getCompanyDisplayTotal(company);

                    return (
                      <tr
                        key={company.id}
                        className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'} transition hover:bg-emerald-50/35`}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900 font-semibold">
                          <div>{company.name}</div>
                          <div className="mt-1 text-[11px] font-medium text-sky-700">
                            Click Cash / Bank / Cheque balance columns to view separate history.
                          </div>
                          {overlapInfo.hasOverlap ? (
                            <div className="mt-1 text-[11px] font-medium text-amber-700">
                              Shared bank/cheque account detected. Cheque is mirrored to bank balance.
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button
                            type="button"
                            onClick={() => openCashHistoryModal(company)}
                            className="font-semibold text-emerald-700 hover:underline"
                          >
                            {money(cash)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button
                            type="button"
                            onClick={() => openBankHistoryModal(company)}
                            className="font-semibold text-sky-700 hover:underline"
                          >
                            {money(bank)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button
                            type="button"
                            onClick={() => openChequeHistoryModal(company)}
                            className="font-semibold text-violet-700 hover:underline"
                          >
                            {money(cheque)}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-cyan-700 font-bold">{money(displayTotal)}</td>
                        <td className="px-4 py-3 align-top">{renderAccountBalances(company.bank_accounts, 'bank', company)}</td>
                        <td className="px-4 py-3 align-top">{renderAccountBalances(company.cheque_accounts, 'cheque', company)}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-2">
                            {isAdminUser ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditCashBalanceModal(company);
                                  }}
                                  className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:bg-amber-100"
                                >
                                  Edit Cash Balance
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditBankBalanceModal(company);
                                  }}
                                  className="rounded-full border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                                >
                                  Edit Bank Balance
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAddBankAccountModal(company);
                              }}
                              className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
                            >
                              Add Bank Account
                            </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDepositModal(company);
                            }}
                            disabled={!company.bank_accounts || company.bank_accounts.length === 0}
                            className="rounded-full bg-gradient-to-r from-sky-600 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:from-sky-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Deposit Bank
                          </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
            <h2 className="text-base font-semibold text-gray-900">Acceptance Pending Transaction</h2>
            <p className="text-xs text-gray-600 mt-1">Transactions generated when outlet day closes with transfer to main account.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Outlet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Total Sale</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Start Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Card Collection</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bank Transfer Total</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Cash Collection</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Requested At</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Requested By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {pendingOutletTransfersLoading ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-500">Loading pending transactions...</td>
                  </tr>
                ) : pendingOutletTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-10 text-center text-sm text-gray-500">No pending outlet transactions.</td>
                  </tr>
                ) : (
                  pendingOutletTransfers.map((entry) => {
                    const entryId = String(entry.id);
                    return (
                      <tr key={entryId} className="transition hover:bg-amber-50/35">
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.session_date || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {entry.outlet_name || 'Outlet'}{entry.outlet_code ? ` (${entry.outlet_code})` : ''}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.total_sale || 0))}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.start_amount || 0))}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.card_collection_total || 0))}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.bank_transfer_total || 0))}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.cash_collection_total || 0))}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.amount || 0))}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatJournalDateTime(entry.requested_at, entry.session_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.requested_by_name || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                            {String(entry.status || 'pending')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() => void handleAddPendingOutletTransferWithPrompts(entry)}
                              disabled={
                                processingPendingOutletTransferId === entryId ||
                                rejectingPendingOutletTransferId === entryId
                              }
                              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {processingPendingOutletTransferId === entryId ? 'Adding...' : 'Add'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmModal(
                                  'Reject Pending Transaction?',
                                  'Confirm rejecting this pending outlet transaction.',
                                  () => void handleRejectPendingOutletTransfer(entryId)
                                )
                              }
                              disabled={
                                rejectingPendingOutletTransferId === entryId ||
                                processingPendingOutletTransferId === entryId
                              }
                              className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {rejectingPendingOutletTransferId === entryId ? 'Rejecting...' : 'Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-teal-50">
            <h2 className="text-base font-semibold text-gray-900">Acceptance Pending Delivery Completion Cash Transaction</h2>
            <p className="text-xs text-gray-600 mt-1">Collected delivery cash waiting for main-account acceptance.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Load Number</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Requested At</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Requested By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {pendingDeliveryCompletionCashTransfersLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">Loading pending delivery completion cash transactions...</td>
                  </tr>
                ) : pendingDeliveryCompletionCashTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500">No pending delivery completion cash transactions.</td>
                  </tr>
                ) : (
                  pendingDeliveryCompletionCashTransfers.map((entry) => {
                    const entryId = String(entry.id || '');
                    return (
                      <tr key={entryId} className="transition hover:bg-emerald-50/35">
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.delivery_date || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.load_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.amount || 0))}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatJournalDateTime(entry.requested_at, entry.delivery_date)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.requested_by_name || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                            {String(entry.status || 'pending')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmModal(
                                  'Accept Pending Delivery Completion Cash?',
                                  'Confirm adding this delivery completion cash transfer to Main Cash account.',
                                  () => void handleAcceptPendingDeliveryCompletionCashTransfer(entryId)
                                )
                              }
                              disabled={
                                processingPendingDeliveryCompletionCashTransferId === entryId ||
                                rejectingPendingDeliveryCompletionCashTransferId === entryId
                              }
                              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {processingPendingDeliveryCompletionCashTransferId === entryId ? 'Adding...' : 'Add'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmModal(
                                  'Reject Pending Delivery Completion Cash?',
                                  'Confirm rejecting this pending delivery completion cash transfer.',
                                  () => void handleRejectPendingDeliveryCompletionCashTransfer(entryId)
                                )
                              }
                              disabled={
                                rejectingPendingDeliveryCompletionCashTransferId === entryId ||
                                processingPendingDeliveryCompletionCashTransferId === entryId
                              }
                              className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {rejectingPendingDeliveryCompletionCashTransferId === entryId ? 'Rejecting...' : 'Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-sky-50 to-cyan-50">
            <h2 className="text-base font-semibold text-gray-900">Pending Distribution Bank Transfers</h2>
            <p className="text-xs text-gray-600 mt-1">Bank-transfer invoice payments waiting for main-account acceptance.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Payment #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Bank Account</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Reference</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {pendingDistributionBankTransfersLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">Loading pending distribution bank transfers...</td>
                  </tr>
                ) : pendingDistributionBankTransfers.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">No pending distribution bank transfer transactions.</td>
                  </tr>
                ) : (
                  pendingDistributionBankTransfers.map((entry) => {
                    const entryId = String(entry.id || '');
                    const customerName = String(entry.customer?.shop_name || '-');
                    const customerCode = String(entry.customer?.customer_code || '');
                    return (
                      <tr key={entryId} className="transition hover:bg-sky-50/35">
                        <td className="px-4 py-3 text-sm text-gray-700">{formatJournalDateTime(entry.created_at, entry.payment_date || '-')}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.payment_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.invoice?.invoice_number || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {customerName}{customerCode ? ` (${customerCode})` : ''}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.bank_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{entry.reference_no || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">{money(Number(entry.amount || 0))}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-700">
                            {String(entry.status || 'pending')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmModal(
                                  'Accept Pending Bank Transfer?',
                                  'Confirm accepting this invoice bank transfer to main account bank balance.',
                                  () => void handleAcceptPendingDistributionBankTransfer(entryId)
                                )
                              }
                              disabled={
                                processingPendingDistributionBankTransferId === entryId ||
                                rejectingPendingDistributionBankTransferId === entryId
                              }
                              className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {processingPendingDistributionBankTransferId === entryId ? 'Adding...' : 'Add'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmModal(
                                  'Reject Pending Bank Transfer?',
                                  'Confirm rejecting this pending invoice bank transfer.',
                                  () => void handleRejectPendingDistributionBankTransfer(entryId)
                                )
                              }
                              disabled={
                                rejectingPendingDistributionBankTransferId === entryId ||
                                processingPendingDistributionBankTransferId === entryId
                              }
                              className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {rejectingPendingDistributionBankTransferId === entryId ? 'Rejecting...' : 'Reject'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/90 backdrop-blur-lg shadow-[0_18px_65px_-35px_rgba(13,148,136,0.45)] overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
            <h2 className="text-base font-semibold text-gray-900">Transfer and Withdrawal Journal</h2>
            <p className="text-xs text-gray-600 mt-1">Debit/Credit postings for funding transfers and cash withdrawals.</p>
          </div>

          <div className="border-b border-gray-100 bg-white/80 px-5 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-6">
              <select
                value={journalFilters.entryType}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, entryType: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Entry Types</option>
                <option value="transfer">Transfer</option>
                <option value="withdrawal">Withdrawal</option>
              </select>

              <select
                value={journalFilters.txMark}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, txMark: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Tx Marks</option>
                <option value="Transfer In">Transfer In</option>
                <option value="Transfer Out">Transfer Out</option>
                <option value="Cheque Deposit">Cheque Deposit</option>
                <option value="Cheque Return">Cheque Return</option>
                <option value="Pending Receipt">Pending Receipt</option>
                <option value="Withdrawal">Withdrawal</option>
                <option value="Transfer">Transfer</option>
              </select>

              <select
                value={journalFilters.accountMark}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, accountMark: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Accounts</option>
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="Cheque">Cheque</option>
                <option value="Mixed">Mixed</option>
              </select>

              <select
                value={journalFilters.status}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="accepted">Accepted</option>
                <option value="completed">Completed</option>
              </select>

              <input
                type="date"
                value={journalFilters.fromDate}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="date"
                value={journalFilters.toDate}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, toDate: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="text"
                value={journalFilters.search}
                onChange={(e) => setJournalFilters((prev) => ({ ...prev, search: e.target.value }))}
                placeholder="Search ref, note, account..."
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm md:col-span-5"
              />

              <button
                type="button"
                onClick={() =>
                  setJournalFilters({
                    entryType: 'all',
                    txMark: 'all',
                    accountMark: 'all',
                    status: 'all',
                    fromDate: '',
                    toDate: '',
                    search: '',
                  })
                }
                className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              >
                Reset Filters
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] divide-y divide-gray-200">
              <thead className="bg-slate-100/90">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Company</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Balance (Account)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredJournalRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-sm text-gray-500">No journal entries match current filters.</td>
                  </tr>
                ) : (
                  paginatedJournalEntries.map((entry, idx) => (
                    <tr key={entry.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'} transition hover:bg-amber-50/35`}>
                      <td className="px-4 py-3 text-sm text-gray-700">{formatJournalDateTime(entry.posted_at, entry.date)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="capitalize">{entry.entry_type || 'transfer'}</span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              entry.txMark === 'Transfer In'
                                ? 'bg-emerald-100 text-emerald-700'
                                : entry.txMark === 'Transfer Out'
                                  ? 'bg-rose-100 text-rose-700'
                                  : entry.txMark === 'Cheque Deposit'
                                    ? 'bg-cyan-100 text-cyan-700'
                                    : entry.txMark === 'Cheque Return'
                                      ? 'bg-orange-100 text-orange-700'
                                  : entry.txMark === 'Pending Receipt'
                                    ? 'bg-amber-100 text-amber-700'
                                    : entry.txMark === 'Withdrawal'
                                      ? 'bg-orange-100 text-orange-700'
                                      : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {entry.txMark}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              entry.accountMark === 'Cash'
                                ? 'bg-emerald-100 text-emerald-700'
                                : entry.accountMark === 'Bank'
                                  ? 'bg-sky-100 text-sky-700'
                                  : entry.accountMark === 'Cheque'
                                    ? 'bg-violet-100 text-violet-700'
                                    : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {entry.accountMark}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 font-semibold">{entry.company_name}</td>
                      <td className="px-4 py-3 text-sm text-emerald-700">{entry.displayDebitAccount}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-emerald-700">
                        {money(Number(entry.displayDebitAmount || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-rose-700">{entry.displayCreditAccount}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-rose-700">
                        {money(Number(entry.displayCreditAmount || 0))}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-cyan-700">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-600">{entry.balanceLabel}</span>
                          <span>{money(entry.runningBalance)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                            entry.status === 'pending'
                              ? 'bg-amber-100 text-amber-700'
                              : entry.status === 'accepted'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {entry.status || 'completed'}
                        </span>
                        {entry.status === 'pending' && entry.row_source === 'outlet_request' ? (
                          <span className="ml-2 inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmModal(
                                  'Accept Pending Transfer?',
                                  'Confirm accepting this pending outlet transfer and posting it to main account.',
                                  () => handleAcceptMainFundRequest(entry.id)
                                )
                              }
                              disabled={acceptingRequestId === entry.id || decliningRequestId === entry.id}
                              className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {acceptingRequestId === entry.id ? 'Accepting...' : 'Accept'}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                openConfirmModal(
                                  'Decline Pending Transfer?',
                                  'Confirm declining this pending outlet transfer.',
                                  () => handleDeclineMainFundRequest(entry.id)
                                )
                              }
                              disabled={decliningRequestId === entry.id || acceptingRequestId === entry.id}
                              className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {decliningRequestId === entry.id ? 'Declining...' : 'Decline'}
                            </button>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{entry.reference || '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {isAdminUser && entry.row_source === 'main' ? (
                          <button
                            type="button"
                            onClick={() =>
                              openConfirmModal(
                                'Delete Journal Record?',
                                'This will permanently remove the selected main cash transaction record.',
                                () => handleDeleteJournalEntry(entry)
                              )
                            }
                            disabled={deletingJournalEntryId === String(entry.id)}
                            className="rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingJournalEntryId === String(entry.id) ? 'Deleting...' : 'Delete'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-gray-100 bg-white/80 px-5 py-4 text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Showing {journalRangeStart}-{journalRangeEnd} of {filteredJournalRows.length} entries
              {filteredJournalRows.length !== journalRows.length ? ` (filtered from ${journalRows.length})` : ''}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setJournalPage((prev) => Math.max(1, prev - 1))}
                disabled={currentJournalPage === 1 || filteredJournalRows.length === 0}
                className="rounded-full border border-gray-300 px-4 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 font-semibold text-gray-700">
                Page {currentJournalPage} of {totalJournalPages}
              </span>
              <button
                type="button"
                onClick={() => setJournalPage((prev) => Math.min(totalJournalPages, prev + 1))}
                disabled={currentJournalPage === totalJournalPages || filteredJournalRows.length === 0}
                className="rounded-full border border-gray-300 px-4 py-1.5 font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </section>
      </main>

      {confirmModal.open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Confirmation</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{confirmModal.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{confirmModal.message}</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={confirmCancelAction ? runConfirmCancelAction : closeConfirmModal}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {confirmModal.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={runConfirmAction}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-700 hover:to-orange-600"
              >
                {confirmModal.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingCardBankAccountModal.open ? (
        <div className="fixed inset-0 z-[205] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Bank Account</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{pendingCardBankAccountModal.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{pendingCardBankAccountModal.message}</p>
            <p className="mt-2 text-sm font-semibold text-slate-800">Company: {pendingCardBankAccountModal.companyName}</p>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Company Bank Accounts
              </label>
              <select
                value={pendingCardBankAccountSelection}
                onChange={(e) => setPendingCardBankAccountSelection(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-black shadow-sm"
              >
                {pendingCardBankAccountModal.bankAccounts.map((bankAccount) => (
                  <option key={bankAccount.id} value={String(bankAccount.id)}>
                    {formatBankAccountLabel(bankAccount)} • Balance: {money(Number(bankAccount.current_balance || 0))}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={runPendingCardBankAccountCancel}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                No
              </button>
              <button
                type="button"
                onClick={runPendingCardBankAccountConfirm}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 px-4 py-2 text-sm font-semibold text-white hover:from-amber-700 hover:to-orange-600"
              >
                Select & Continue
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddBankAccountModal ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-600">Bank Account Setup</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Create Company Bank Account</h3>
              <p className="mt-2 text-sm text-slate-600">Add a new bank account and link it directly with the company balance table.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={addBankAccountForm.companyId}
                onChange={(e) => setAddBankAccountForm((prev) => ({ ...prev, companyId: e.target.value }))}
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm md:col-span-2"
              >
                <option value="">Select Company</option>
                {rows.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={addBankAccountForm.bankName}
                onChange={(e) => setAddBankAccountForm((prev) => ({ ...prev, bankName: e.target.value }))}
                placeholder="Bank Name"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              />

              <input
                type="text"
                value={addBankAccountForm.branch}
                onChange={(e) => setAddBankAccountForm((prev) => ({ ...prev, branch: e.target.value }))}
                placeholder="Branch"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              />

              <input
                type="text"
                value={addBankAccountForm.accountNo}
                onChange={(e) => setAddBankAccountForm((prev) => ({ ...prev, accountNo: e.target.value }))}
                placeholder="Account Number"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm md:col-span-2"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={addBankAccountForm.openingBalance}
                onChange={(e) => setAddBankAccountForm((prev) => ({ ...prev, openingBalance: e.target.value }))}
                placeholder="Opening Balance"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm md:col-span-2"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeAddBankAccountModal}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  openConfirmModal(
                    'Create Bank Account?',
                    'Confirm creating this bank account and linking it with selected company.',
                    handleCreateBankAccount
                  )
                }
                disabled={addBankAccountSaving}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {addBankAccountSaving ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditCashBalanceModal ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-amber-200 bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Admin Controls</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Edit Company Cash Balance</h3>
              <p className="mt-2 text-sm text-slate-600">This action is restricted to admin users only.</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <select
                value={editCashBalanceForm.companyId}
                onChange={(e) => setEditCashBalanceForm((prev) => ({ ...prev, companyId: e.target.value }))}
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              >
                <option value="">Select Company</option>
                {rows.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="0.01"
                value={editCashBalanceForm.amount}
                onChange={(e) => setEditCashBalanceForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="New Cash Balance"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              />

              <input
                type="text"
                value={editCashBalanceForm.note}
                onChange={(e) => setEditCashBalanceForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Reason / Note (optional)"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEditCashBalanceModal}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  openConfirmModal(
                    'Update Cash Balance?',
                    'Confirm updating the company cash balance.',
                    handleEditCashBalance
                  )
                }
                disabled={editCashBalanceSaving}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 px-4 py-2 text-sm font-semibold text-white hover:from-amber-700 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editCashBalanceSaving ? 'Updating...' : 'Update Balance'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditBankBalanceModal ? (
        <div className="fixed inset-0 z-[96] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-3xl border border-sky-200 bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Admin Controls</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Edit Company Bank Balance</h3>
              <p className="mt-2 text-sm text-slate-600">This action is restricted to admin users only.</p>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <select
                value={editBankBalanceForm.companyId}
                onChange={(e) => {
                  const selectedCompany = rows.find((company) => String(company.id) === e.target.value);
                  const firstBank = selectedCompany?.bank_accounts?.[0];
                  setEditBankBalanceForm((prev) => ({
                    ...prev,
                    companyId: e.target.value,
                    bankAccountId: firstBank?.id ? String(firstBank.id) : '',
                    amount: String(Number(firstBank?.current_balance || 0)),
                  }));
                }}
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              >
                <option value="">Select Company</option>
                {rows.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name}
                  </option>
                ))}
              </select>

              <select
                value={editBankBalanceForm.bankAccountId}
                onChange={(e) => {
                  const selectedBank = (selectedEditBankCompany?.bank_accounts || []).find(
                    (account) => String(account.id) === e.target.value
                  );
                  setEditBankBalanceForm((prev) => ({
                    ...prev,
                    bankAccountId: e.target.value,
                    amount: String(Number(selectedBank?.current_balance || 0)),
                  }));
                }}
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              >
                <option value="">Select Bank Account</option>
                {(selectedEditBankCompany?.bank_accounts || []).map((account) => (
                  <option key={account.id} value={String(account.id)}>
                    {(account.bank_name || 'Bank Account') + (account.branch ? ` - ${account.branch}` : '') + (account.account_no ? ` (A/C: ${account.account_no})` : '')}
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="0"
                step="0.01"
                value={editBankBalanceForm.amount}
                onChange={(e) => setEditBankBalanceForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="New Bank Account Balance"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              />

              <input
                type="text"
                value={editBankBalanceForm.note}
                onChange={(e) => setEditBankBalanceForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Reason / Note (optional)"
                className="rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeEditBankBalanceModal}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  openConfirmModal(
                    'Update Bank Balance?',
                    'Confirm updating the selected bank account balance.',
                    handleEditBankBalance
                  )
                }
                disabled={editBankBalanceSaving}
                className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-sky-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {editBankBalanceSaving ? 'Updating...' : 'Update Balance'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showDepositModal ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-3xl border border-sky-200 bg-white p-6 shadow-2xl">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Bank Deposit</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">Deposit to Company Bank Account</h3>
              <p className="mt-2 text-sm text-slate-600">Move funds from company cash, cheque, or external cash source into a selected bank account.</p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                value={depositForm.companyId}
                onChange={(e) => {
                  const selected = rows.find((company) => String(company.id) === e.target.value);
                  setDepositForm((prev) => ({
                    ...prev,
                    companyId: e.target.value,
                    bankAccountId: selected?.bank_accounts?.[0]?.id ? String(selected.bank_accounts[0].id) : '',
                  }));
                }}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="">Select Company</option>
                {rows.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name}
                  </option>
                ))}
              </select>

              <select
                value={depositForm.sourceType}
                onChange={(e) =>
                  setDepositForm((prev) => ({
                    ...prev,
                    sourceType: e.target.value as 'cash' | 'cheque' | 'external_cash',
                  }))
                }
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              >
                <option value="cash">Source: Cash Balance</option>
                <option value="cheque">Source: Cheque Balance</option>
                <option value="external_cash">Source: External Cash</option>
              </select>

              <select
                value={depositForm.bankAccountId}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, bankAccountId: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm md:col-span-2"
              >
                <option value="">Select Target Bank Account</option>
                {availableDepositBankAccounts.map((bank) => (
                  <option key={bank.id} value={String(bank.id)}>
                    {(bank.bank_name || 'Bank Account') +
                      (bank.branch ? ` - ${bank.branch}` : '') +
                      ` (${money(Number(bank.current_balance || 0))})`}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={depositForm.date}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, date: e.target.value }))}
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                value={depositForm.amount}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, amount: e.target.value }))}
                placeholder="Amount"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="text"
                value={depositForm.reference}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, reference: e.target.value }))}
                placeholder="Reference"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />

              <input
                type="text"
                value={depositForm.note}
                onChange={(e) => setDepositForm((prev) => ({ ...prev, note: e.target.value }))}
                placeholder="Narration"
                className="rounded-xl border border-gray-300 text-sm text-black px-3 py-2.5 shadow-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDepositModal}
                className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  openConfirmModal(
                    'Post Bank Deposit?',
                    'Confirm posting this deposit to selected bank account.',
                    handleDepositBank
                  )
                }
                disabled={depositSaving}
                className="rounded-xl bg-gradient-to-r from-sky-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white hover:from-sky-700 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {depositSaving ? 'Posting...' : 'Post Deposit'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showBankHistoryModal ? (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="relative w-full max-w-[96vw] overflow-hidden rounded-[28px] border border-cyan-100 bg-white shadow-[0_35px_140px_-50px_rgba(14,116,144,0.6)]">
            <div className="relative max-h-[92vh] overflow-y-auto">
              <div className="bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.35),_transparent_50%),linear-gradient(130deg,_rgba(8,47,73,0.95)_0%,_rgba(14,116,144,0.9)_48%,_rgba(2,132,199,0.88)_100%)]">
                <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                  <div>
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-xl">🏦</div>
                    <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Bank Transaction History</h3>
                    <p className="mt-2 text-sm text-white/85 sm:text-base">
                      {selectedBankHistoryCompany?.name || 'Company'} • All bank-related journal movements
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBankHistoryModal}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
              </div>

              <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="mb-4 rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-800">
                  Found {filteredBankHistoryRows.length} bank-related transactions.
                </div>

                <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
                  <select
                    value={bankHistoryFilters.status}
                    onChange={(e) => setBankHistoryFilters((prev) => ({ ...prev, status: e.target.value }))}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-black shadow-sm"
                  >
                    <option value="all">All Status</option>
                    <option value="completed">Completed</option>
                    <option value="accepted">Accepted</option>
                    <option value="pending">Pending</option>
                  </select>
                  <input
                    type="date"
                    value={bankHistoryFilters.fromDate}
                    onChange={(e) => setBankHistoryFilters((prev) => ({ ...prev, fromDate: e.target.value }))}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-black shadow-sm"
                  />
                  <input
                    type="date"
                    value={bankHistoryFilters.toDate}
                    onChange={(e) => setBankHistoryFilters((prev) => ({ ...prev, toDate: e.target.value }))}
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-black shadow-sm"
                  />
                  <input
                    type="text"
                    value={bankHistoryFilters.search}
                    onChange={(e) => setBankHistoryFilters((prev) => ({ ...prev, search: e.target.value }))}
                    placeholder="Search reference/narration/account..."
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-black shadow-sm md:col-span-2"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setBankHistoryFilters({
                        status: 'all',
                        fromDate: '',
                        toDate: '',
                        search: '',
                      })
                    }
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 md:col-span-5"
                  >
                    Reset Filters
                  </button>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-[1100px] divide-y divide-slate-200">
                    <thead className="bg-slate-100/90">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Balance</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Status</th>
                        {hasPendingBankHistoryActions ? (
                          <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Actions</th>
                        ) : null}
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Narration</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {filteredBankHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={hasPendingBankHistoryActions ? 11 : 10} className="px-4 py-10 text-center text-sm text-slate-500">
                            No bank transaction records found for this company.
                          </td>
                        </tr>
                      ) : (
                        paginatedBankHistoryRows.map((entry, idx) => (
                          <tr key={`${entry.id}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'}>
                            <td className="px-4 py-3 text-sm text-slate-700">{formatJournalDateTime(entry.posted_at, entry.date)}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.txMark}</td>
                            <td className="px-4 py-3 text-sm text-emerald-700">{entry.displayDebitAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">{money(Number(entry.displayDebitAmount || 0))}</td>
                            <td className="px-4 py-3 text-sm text-rose-700">{entry.displayCreditAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-rose-700">{money(Number(entry.displayCreditAmount || 0))}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-700">
                              {money(Number(entry.runningBalance || 0))}
                            </td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.status || 'completed'}</td>
                            {hasPendingBankHistoryActions ? (
                              <td className="px-4 py-3 text-sm text-slate-700">
                                {entry.status === 'pending' && entry.row_source === 'outlet_request' ? (
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openConfirmModal(
                                          'Accept Pending Transfer?',
                                          'Confirm accepting this pending outlet transfer and posting it to main account.',
                                          () => handleAcceptMainFundRequest(entry.id)
                                        )
                                      }
                                      disabled={acceptingRequestId === entry.id || decliningRequestId === entry.id}
                                      className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {acceptingRequestId === entry.id ? 'Accepting...' : 'Accept'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openConfirmModal(
                                          'Decline Pending Transfer?',
                                          'Confirm declining this pending outlet transfer.',
                                          () => handleDeclineMainFundRequest(entry.id)
                                        )
                                      }
                                      disabled={decliningRequestId === entry.id || acceptingRequestId === entry.id}
                                      className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {decliningRequestId === entry.id ? 'Declining...' : 'Decline'}
                                    </button>
                                  </div>
                                ) : null}
                              </td>
                            ) : null}
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.reference || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{entry.note || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-600">
                    Showing {bankHistoryRangeStart}-{bankHistoryRangeEnd} of {filteredBankHistoryRows.length} entries
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBankHistoryPage((prev) => Math.max(1, prev - 1))}
                      disabled={currentBankHistoryPage === 1 || filteredBankHistoryRows.length === 0}
                      className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-semibold text-gray-700">
                      Page {currentBankHistoryPage} of {totalBankHistoryPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => setBankHistoryPage((prev) => Math.min(totalBankHistoryPages, prev + 1))}
                      disabled={currentBankHistoryPage === totalBankHistoryPages || filteredBankHistoryRows.length === 0}
                      className="rounded-full border border-gray-300 px-4 py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={closeBankHistoryModal}
                      className="rounded-full border border-sky-200 bg-sky-50 px-5 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                    >
                      Close History
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showCashHistoryModal ? (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="relative w-full max-w-[96vw] overflow-hidden rounded-[28px] border border-emerald-100 bg-white shadow-[0_35px_140px_-50px_rgba(6,95,70,0.6)]">
            <div className="relative max-h-[92vh] overflow-y-auto">
              <div className="bg-[radial-gradient(circle_at_top_left,_rgba(52,211,153,0.35),_transparent_50%),linear-gradient(130deg,_rgba(6,78,59,0.95)_0%,_rgba(5,150,105,0.9)_48%,_rgba(16,185,129,0.88)_100%)]">
                <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                  <div>
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-xl">💵</div>
                    <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cash Transaction History</h3>
                    <p className="mt-2 text-sm text-white/85 sm:text-base">
                      {selectedCashHistoryCompany?.name || 'Company'} • Cash-related journal movements
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeCashHistoryModal}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
              </div>

              <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-800">
                  Found {cashHistoryRows.length} cash-related transactions.
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-[1100px] divide-y divide-slate-200">
                    <thead className="bg-slate-100/90">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Balance</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Narration</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {cashHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                            No cash transaction records found for this company.
                          </td>
                        </tr>
                      ) : (
                        cashHistoryRows.map((entry, idx) => (
                          <tr key={`${entry.id}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'}>
                            <td className="px-4 py-3 text-sm text-slate-700">{formatJournalDateTime(entry.posted_at, entry.date)}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.txMark}</td>
                            <td className="px-4 py-3 text-sm text-emerald-700">{entry.displayDebitAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">{money(Number(entry.displayDebitAmount || 0))}</td>
                            <td className="px-4 py-3 text-sm text-rose-700">{entry.displayCreditAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-rose-700">{money(Number(entry.displayCreditAmount || 0))}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-700">{money(Number(entry.runningBalance || 0))}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.status || 'completed'}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.reference || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{entry.note || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={closeCashHistoryModal}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-5 py-2.5 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Close History
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showChequeHistoryModal ? (
        <div className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm">
          <div className="relative w-full max-w-[96vw] overflow-hidden rounded-[28px] border border-violet-100 bg-white shadow-[0_35px_140px_-50px_rgba(109,40,217,0.45)]">
            <div className="relative max-h-[92vh] overflow-y-auto">
              <div className="bg-[radial-gradient(circle_at_top_left,_rgba(196,181,253,0.35),_transparent_50%),linear-gradient(130deg,_rgba(76,29,149,0.95)_0%,_rgba(109,40,217,0.9)_48%,_rgba(124,58,237,0.88)_100%)]">
                <div className="flex items-start justify-between gap-4 px-6 pb-6 pt-7 text-white sm:px-8">
                  <div>
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/15 text-xl">🧾</div>
                    <h3 className="text-2xl font-semibold tracking-tight sm:text-3xl">Cheque Transaction History</h3>
                    <p className="mt-2 text-sm text-white/85 sm:text-base">
                      {selectedChequeHistoryCompany?.name || 'Company'} • Cheque-related journal movements
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeChequeHistoryModal}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <span className="text-2xl">&times;</span>
                  </button>
                </div>
              </div>

              <div className="px-6 pb-6 sm:px-8 sm:pb-8">
                <div className="mb-4 rounded-2xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-sm text-violet-800">
                  Found {chequeHistoryRows.length} cheque-related transactions.
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="min-w-[1100px] divide-y divide-slate-200">
                    <thead className="bg-slate-100/90">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Debit</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit Account</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Credit</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Balance</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold tracking-[0.12em] text-slate-500 uppercase">Narration</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {chequeHistoryRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                            No cheque transaction records found for this company.
                          </td>
                        </tr>
                      ) : (
                        chequeHistoryRows.map((entry, idx) => (
                          <tr key={`${entry.id}-${idx}`} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/45'}>
                            <td className="px-4 py-3 text-sm text-slate-700">{formatJournalDateTime(entry.posted_at, entry.date)}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.txMark}</td>
                            <td className="px-4 py-3 text-sm text-emerald-700">{entry.displayDebitAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-emerald-700">{money(Number(entry.displayDebitAmount || 0))}</td>
                            <td className="px-4 py-3 text-sm text-rose-700">{entry.displayCreditAccount}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-rose-700">{money(Number(entry.displayCreditAmount || 0))}</td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-cyan-700">{money(Number(entry.runningBalance || 0))}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.status || 'completed'}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{entry.reference || '-'}</td>
                            <td className="px-4 py-3 text-sm text-slate-600">{entry.note || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={closeChequeHistoryModal}
                    className="rounded-full border border-violet-200 bg-violet-50 px-5 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-100"
                  >
                    Close History
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {noticeModal.open ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              {noticeModal.tone === 'success' ? 'Success' : noticeModal.tone === 'error' ? 'Error' : 'Notice'}
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">{noticeModal.title}</h3>
            <p className="mt-3 text-sm leading-6 text-slate-600">{noticeModal.message}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setNoticeModal({ open: false, title: '', message: '', tone: 'info' })}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white hover:from-emerald-700 hover:to-teal-700"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
