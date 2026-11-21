---
description: Accounting fundamentals and double-entry bookkeeping rules
  for designing, implementing, and validating ERP financial modules.
name: accounting-fundamentals-for-erp
---

# Accounting Fundamentals for ERP Systems

## Purpose

Use this skill when designing, implementing, reviewing, or
troubleshooting accounting-related features in an ERP system. It
explains debit and credit rules, double-entry bookkeeping, common
business transactions, cash and bank movements, and practical
requirements for integrating operational modules with the General
Ledger.

This document provides general accounting guidance. Confirm statutory,
tax, and financial-reporting requirements with a qualified accountant in
the relevant jurisdiction before deploying them in production.

## 1. Core Accounting Concepts

### Debit and Credit

-   **Debit (Dr)** is the left side of an account.
-   **Credit (Cr)** is the right side of an account.
-   Debit does not always mean an increase in cash or an expense.
-   Credit does not always mean a decrease in cash or income.
-   Whether a debit or credit increases an account depends on the
    account's type.

Every valid double-entry journal entry must satisfy:

**Total Debits = Total Credits**

A transaction normally affects at least two accounts. A journal entry
can contain more than two lines, but its total debits and credits must
still balance.

### The five main account categories

  -----------------------------------------------------------------------
  Account category  Increase with     Decrease with     Examples
  ----------------- ----------------- ----------------- -----------------
  Assets            Debit             Credit            Cash, bank,
                                                        inventory,
                                                        receivables,
                                                        equipment

  Expenses          Debit             Credit            Salaries, rent,
                                                        electricity,
                                                        delivery expense

  Liabilities       Credit            Debit             Accounts payable,
                                                        loans payable,
                                                        customer advances

  Equity            Credit            Debit             Owner's capital,
                                                        retained earnings

  Revenue           Credit            Debit             Sales revenue,
                                                        service revenue
  -----------------------------------------------------------------------

A useful memory aid:

-   **Debit increases:** Assets and Expenses.
-   **Credit increases:** Liabilities, Equity, and Revenue.

Contra accounts are exceptions to the normal balance of their related
account category. For example, accumulated depreciation is a
contra-asset and normally has a credit balance.

## 2. The Accounting Equation

The fundamental accounting equation is:

**Assets = Liabilities + Equity**

Revenue and expenses affect equity through profit or loss:

**Profit = Revenue - Expenses**

The double-entry system keeps the accounting equation in balance. Do not
treat every cash receipt as revenue or every cash payment as an expense.

Examples:

-   Receiving a bank loan increases cash (asset) and loans payable
    (liability). It is not revenue.
-   Repaying the principal of a loan decreases cash and decreases the
    loan liability. It is not an expense.
-   Transferring cash from the cash drawer to the bank changes the
    location of an asset. It is not revenue or an expense.
-   Receiving an advance from a customer increases cash and a
    customer-advance liability. It is not automatically earned revenue.

## 3. Common Business Transactions and Journal Entries

The following examples assume the amounts are exclusive of taxes and
that the relevant accounts have been configured correctly. Inventory and
cost-of-sales entries depend on the inventory costing and accounting
method used.

### 3.1 Purchase raw materials for cash

A business purchases raw materials for Rs. 10,000 and pays immediately.

  Account                     Debit (Rs.)   Credit (Rs.)
  ------------------------- ------------- --------------
  Raw Materials Inventory          10,000 
  Cash in Hand                                    10,000
  **Total**                    **10,000**     **10,000**

Reason: - Inventory (asset) increases: Debit. - Cash (asset) decreases:
Credit.

If the materials are purchased on credit instead:

  Account                         Debit (Rs.)   Credit (Rs.)
  ----------------------------- ------------- --------------
  Raw Materials Inventory              10,000 
  Accounts Payable - Supplier                         10,000

When the supplier is paid later:

  Account                         Debit (Rs.)   Credit (Rs.)
  ----------------------------- ------------- --------------
  Accounts Payable - Supplier          10,000 
  Bank Account                                        10,000

### 3.2 Pay employee salaries

The business pays salaries of Rs. 50,000 from its bank account.

  Account            Debit (Rs.)   Credit (Rs.)
  ---------------- ------------- --------------
  Salary Expense          50,000 
  Bank Account                           50,000

If salary was accrued before payment, first record the salary expense
against salaries payable. On payment, debit salaries payable and credit
bank.

### 3.3 Receive cash from an outlet sale

An outlet makes a cash sale of Rs. 25,000.

  Account           Debit (Rs.)   Credit (Rs.)
  --------------- ------------- --------------
  Cash in Hand           25,000 
  Sales Revenue                         25,000

For an inventory-based business using a perpetual inventory system, also
record the cost of the goods sold:

  Account                             Debit               Credit
  -------------------- -------------------- --------------------
  Cost of Goods Sold     Cost of items sold 
  Inventory                                   Cost of items sold

The sales amount and cost of goods sold are different amounts. Do not
use the selling price as the inventory cost.

### 3.4 Receive payment from a customer

A customer pays Rs. 20,000 against an existing invoice.

  Account                            Debit (Rs.)   Credit (Rs.)
  -------------------------------- ------------- --------------
  Cash or Bank                            20,000 
  Accounts Receivable - Customer                         20,000

This is collection of an existing receivable, not a second sale. Do not
credit sales revenue again.

### 3.5 Deposit cash into the bank

The business deposits Rs. 2,500 from its cash drawer into its bank
account.

  Account          Debit (Rs.)   Credit (Rs.)
  -------------- ------------- --------------
  Bank Account           2,500 
  Cash in Hand                          2,500
  **Total**          **2,500**      **2,500**

Reason: - Bank is an asset and increases: Debit. - Cash in hand is an
asset and decreases: Credit.

This is a **cash-to-bank transfer**, not income, revenue, or an expense.

### 3.6 Pay an electricity bill

The business pays an electricity bill of Rs. 5,000.

  Account                 Debit (Rs.)   Credit (Rs.)
  --------------------- ------------- --------------
  Electricity Expense           5,000 
  Cash or Bank                                 5,000

### 3.7 Receive a bank loan

The business receives a loan of Rs. 100,000 into its bank account.

  Account          Debit (Rs.)   Credit (Rs.)
  -------------- ------------- --------------
  Bank Account         100,000 
  Loan Payable                        100,000

The receipt increases an asset and a liability. It is not sales revenue.

### 3.8 Repay loan principal

The business repays Rs. 10,000 of loan principal.

  Account          Debit (Rs.)   Credit (Rs.)
  -------------- ------------- --------------
  Loan Payable          10,000 
  Bank Account                         10,000

If the payment includes interest, record the interest portion separately
as interest expense. Split principal and interest according to the loan
statement.

### 3.9 Pay a supplier advance

The business pays a supplier an advance of Rs. 150,000 before receiving
the goods.

  Account               Debit (Rs.)   Credit (Rs.)
  ------------------- ------------- --------------
  Supplier Advances         150,000 
  Bank Account                             150,000

A supplier advance is generally an asset until it is applied, refunded,
or otherwise settled. It is not automatically a purchase expense.

### 3.10 Receive an advance from a customer

A customer pays Rs. 30,000 before the business delivers the goods or
service.

  Account                                    Debit (Rs.)   Credit (Rs.)
  ---------------------------------------- ------------- --------------
  Cash or Bank                                    30,000 
  Customer Advances / Contract Liability                         30,000

Recognize revenue when the applicable revenue-recognition requirements
are met, not merely because cash was received.

## 4. Cash Flow vs. Revenue and Expenses

These concepts are related but not interchangeable.

-   **Cash Inflow:** Money received into cash or bank.
-   **Cash Outflow:** Money paid from cash or bank.
-   **Revenue:** Income earned from normal business activities.
-   **Expense:** Cost consumed or incurred to operate the business.
-   **Asset:** A resource controlled by the business.
-   **Liability:** An obligation the business owes.
-   **Fund Transfer:** Movement of money between cash, bank, or other
    fund accounts.

Examples:

  -----------------------------------------------------------------------
  Transaction             Cash movement           Accounting
                                                  classification
  ----------------------- ----------------------- -----------------------
  Cash sale               Cash in                 Revenue, and possibly
                                                  inventory/COGS entries

  Customer pays an old    Cash in                 Receivable decreases
  invoice                                         

  Bank loan received      Cash in                 Liability increases

  Customer advance        Cash in                 Liability increases
  received                                        

  Raw materials purchased Cash out                Inventory asset
  for cash                                        increases

  Salary paid             Cash out                Salary expense, or
                                                  salary payable
                                                  settlement

  Supplier invoice paid   Cash out                Accounts payable
                                                  decreases

  Machinery purchased     Cash out                Fixed asset increases

  Cash deposited into     Cash drawer out; bank   Transfer between asset
  bank                    in                      accounts

  Loan principal repaid   Cash out                Loan liability
                                                  decreases
  -----------------------------------------------------------------------

## 5. Cash and Bank Management in an ERP

A recommended ERP module name is **Cash & Bank Management**.

Possible features:

1.  Cash Receipts
2.  Cash Payments
3.  Bank Receipts
4.  Bank Payments
5.  Cash-to-Bank Deposits
6.  Bank-to-Cash Withdrawals
7.  Fund Transfers
8.  Cash Book
9.  Bank Book
10. Bank Reconciliation
11. Daily Cash Summary
12. Cash Flow Reports

### Transaction direction

Use clear transaction types, rather than relying only on labels such as
"cash in" and "cash out".

Suggested transaction types:

-   `cash_receipt`
-   `cash_payment`
-   `bank_receipt`
-   `bank_payment`
-   `cash_deposit_to_bank`
-   `bank_withdrawal_to_cash`
-   `fund_transfer`

A transfer must identify both the source account and destination
account. It should not create revenue or expense merely because money
moved.

### Cash and bank account balances

For normal asset accounts:

**Closing Balance = Opening Balance + Debits - Credits**

This formula assumes the account has a normal debit balance. Handle
abnormal or credit balances explicitly and investigate them rather than
silently hiding them.

## 6. General Ledger Integration

Operational modules should create accounting entries through a
controlled posting process.

Examples of source modules:

-   Sales
-   Point of Sale (POS)
-   Purchases
-   Inventory
-   Payroll
-   Expenses
-   Supplier Payments
-   Customer Receipts
-   Petty Cash
-   Cash & Bank Management
-   Fixed Assets
-   Loans
-   Advances

Recommended flow:

1.  A user creates a business transaction in its operational module.
2.  The application validates the transaction and required master data.
3.  The application determines the accounts using approved posting
    rules.
4.  It creates a journal entry with debit and credit lines.
5.  It validates that total debits equal total credits.
6.  An authorized process posts the journal to the General Ledger.
7.  The source transaction stores the journal reference.
8.  Reports read posted ledger entries, with appropriate date and status
    filters.

Do not allow each module to invent its own accounting rules
independently. Use centrally managed posting rules and a Chart of
Accounts.

### Example posting-rule configuration

  Business event               Debit account                        Credit account
  ---------------------------- ------------------------------------ ---------------------
  Cash sale                    Cash in Hand                         Sales Revenue
  Credit sale                  Accounts Receivable                  Sales Revenue
  Customer receipt             Cash/Bank                            Accounts Receivable
  Cash purchase of inventory   Inventory                            Cash in Hand
  Supplier invoice on credit   Inventory/Expense                    Accounts Payable
  Supplier payment             Accounts Payable                     Cash/Bank
  Salary payment               Salary Expense or Salaries Payable   Cash/Bank
  Cash deposit to bank         Bank                                 Cash in Hand

The exact accounts depend on the transaction, accounting policy, tax
treatment, and whether the transaction has already been accrued or
recognized.

## 7. Recommended Data Model

A practical starting point for a double-entry General Ledger includes:

### `accounts`

-   `id`
-   `code`
-   `name`
-   `account_type` (asset, liability, equity, revenue, expense)
-   `normal_balance` (debit or credit)
-   `parent_id`
-   `is_control_account`
-   `is_active`

### `journal_entries`

-   `id`
-   `journal_number`
-   `transaction_date`
-   `posting_date`
-   `description`
-   `source_type`
-   `source_id`
-   `status` (draft, posted, reversed)
-   `created_by`
-   `posted_by`
-   `posted_at`

### `journal_entry_lines`

-   `id`
-   `journal_entry_id`
-   `account_id`
-   `debit_amount`
-   `credit_amount`
-   `description`
-   optional dimensions such as branch, department, project, cost
    centre, or outlet

### Cash and bank transaction records

A cash/bank transaction should also retain operational details, such as:

-   transaction number
-   transaction type
-   transaction date
-   source cash/bank account
-   destination cash/bank account, for transfers
-   amount and currency
-   payment method
-   reference number
-   counterparty
-   source document
-   status
-   created by and approved by
-   linked journal entry

The operational transaction and the General Ledger journal serve
different purposes. Keep a clear relationship between them; do not
create a second, disconnected accounting ledger.

## 8. Essential Accounting Controls

Implement these controls in the ERP:

1.  **Balanced journal validation:** Total debit must equal total credit
    before posting.
2.  **No direct edits to posted journals:** Use reversal and replacement
    entries with an audit trail.
3.  **Duplicate prevention:** Prevent the same source transaction from
    posting twice.
4.  **Period controls:** Prevent unauthorized posting into closed
    accounting periods.
5.  **Approval workflows:** Support maker-checker approval where
    required.
6.  **Audit trail:** Record who created, edited, approved, posted, and
    reversed each transaction.
7.  **Decimal precision:** Use fixed-precision decimal database columns
    for money; never use floating-point types for financial amounts.
8.  **Currency handling:** Store transaction currency, exchange rate,
    and base-currency amounts where multi-currency is supported.
9.  **Reconciliation:** Reconcile cash balances, bank statements,
    customer control accounts, and supplier control accounts.
10. **Access control:** Restrict posting, reversal, period closing, and
    Chart of Accounts changes by role.
11. **Idempotency and concurrency:** Ensure retries or simultaneous
    requests cannot create duplicate postings or corrupt balances.
12. **Traceability:** Every journal should link back to its originating
    business document.

## 9. Important Distinctions

### Petty Cash vs. Advances

-   **Petty Cash** is a controlled fund for small routine business
    payments.
-   **Employee Advance** is money given to an employee to be accounted
    for or settled later.
-   **Supplier Advance** is money paid to a supplier before the related
    goods or services are received or fully invoiced.
-   **Prepaid Expense** is a payment for a future benefit, such as
    prepaid rent or insurance.

These should not all be posted to one generic expense account.

### Payment Status vs. Settlement Status

An advance can be fully paid but still be outstanding because the
employee or supplier has not settled it.

Keep payment status and settlement status separate in the application.

### Bank Transfer vs. Income or Expense

A transfer from cash to bank is not income or expense. Both accounts are
assets; one increases and the other decreases.

## 10. Implementation Checklist

Before releasing an accounting module:

-   [ ] Define and approve the Chart of Accounts.
-   [ ] Define account types and normal balances.
-   [ ] Configure posting rules for every supported business event.
-   [ ] Ensure each journal balances.
-   [ ] Prevent duplicate posting.
-   [ ] Link source documents to journal entries.
-   [ ] Implement reversal and audit-trail workflows.
-   [ ] Implement cash and bank reconciliation.
-   [ ] Test cash sales, credit sales, customer receipts, purchases,
    supplier payments, payroll, advances, loans, and fund transfers.
-   [ ] Test partial payments and partial settlements.
-   [ ] Test cancelled, returned, refunded, and reversed transactions.
-   [ ] Validate opening balances and migration balances.
-   [ ] Have a qualified accountant review accounting policies and
    reports before production use.

## 11. Quick Reference

  If this account increases...                    Record
  ----------------------------------------------- --------
  Cash, Bank, Inventory, Receivables, Equipment   Debit
  Expenses                                        Debit
  Payables, Loans, Customer Advances              Credit
  Owner's Capital and Retained Earnings           Credit
  Sales and Service Revenue                       Credit

**Core rule: Every posted journal entry must have equal total debits and
credits.**

**Design principle: Record the business event correctly first, then post
its accounting impact to the General Ledger using centrally configured
and auditable rules.**
