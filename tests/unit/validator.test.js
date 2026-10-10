const { validateRows, checkHeaders } = require('../../src/validators/rowValidator');

const good = (over = {}) => ({
  __row: 2,
  Transaction_ID: 'AST-000001', Entity: 'IBC UK', Location: 'London', Customer_ID: 'CUS-00001',
  Loan_Amount: 1000000, Currency: 'GBP', Transaction_Date: '2026-01-01', Maturity_Date: '2027-01-01',
  Interest_Rate_Pct: 5, Market_Interest_Rate_Pct: 4.5, Loan_Type: 'Loan-Type-A', Customer_Segment: 'SME', Client_Rating: 3,
  ...over,
});

describe('asset book validation', () => {
  test('accepts a valid row and normalises fields', () => {
    const r = validateRows('ASSET', [good({ Currency: ' gbp ' })]);
    expect(r.rejectedRows).toBe(0);
    expect(r.valid[0]).toMatchObject({ transactionId: 'AST-000001', amount: 1000000, currency: 'GBP', productType: 'Loan-Type-A' });
    expect(r.valid[0].maturityDate).toBeInstanceOf(Date);
  });

  test.each([
    ['bad ID pattern', { Transaction_ID: 'LIA-1' }, 'Transaction_ID'],
    ['unknown entity', { Entity: 'HBC HK' }, 'Entity'],
    ['entity/location mismatch', { Location: 'Paris' }, 'Location'],
    ['bad customer id', { Customer_ID: 'C-1' }, 'Customer_ID'],
    ['zero amount', { Loan_Amount: 0 }, 'Loan_Amount'],
    ['non-numeric amount', { Loan_Amount: 'abc' }, 'Loan_Amount'],
    ['unknown currency', { Currency: 'EURO' }, 'Currency'],
    ['bad date format', { Maturity_Date: '32/13/2026' }, 'Maturity_Date'],
    ['maturity before transaction', { Maturity_Date: '2025-01-01' }, 'Maturity_Date'],
    ['rate above 100', { Interest_Rate_Pct: 101 }, 'Interest_Rate_Pct'],
    ['unknown loan type', { Loan_Type: 'Loan-Type-Z' }, 'Loan_Type'],
    ['unknown segment', { Customer_Segment: 'Private' }, 'Customer_Segment'],
    ['rating out of range', { Client_Rating: 6 }, 'Client_Rating'],
    ['rating not integer', { Client_Rating: 2.5 }, 'Client_Rating'],
    ['blank mandatory field', { Customer_Segment: '' }, 'Customer_Segment'],
  ])('rejects %s', (_name, over, field) => {
    const r = validateRows('ASSET', [good(over)]);
    expect(r.rejectedRows).toBe(1);
    expect(r.errors.map((e) => e.field)).toContain(field);
  });

  test('rejects duplicate Transaction_ID and fully duplicate rows', () => {
    const rows = [good(), { ...good(), __row: 3 }, good({ __row: 4, Customer_ID: 'CUS-00002' })];
    const r = validateRows('ASSET', rows);
    expect(r.valid).toHaveLength(1);
    expect(r.rejectedRows).toBe(2);
    expect(r.errors[0].message).toMatch(/full duplicate of row 2/);
    expect(r.errors[1].message).toMatch(/already used on row 2/);
  });

  test('header check detects wrong file', () => {
    const res = checkHeaders('ASSET', ['Transaction_ID', 'Amount']);
    expect(res.ok).toBe(false);
    expect(res.missing).toContain('Loan_Amount');
  });
});

describe('historical log validation', () => {
  const hist = (over = {}) => ({
    __row: 2, Transaction_ID: 'LIA-000001', Entity: 'IBC USA', Type: 'liability', Location: 'New York',
    Transaction_Date: '2024-01-01', Customer_ID: 'CUS-1', Customer_Segment: 'Retail', Client_Rating: 2, Amount: 500,
    Currency: 'USD', Interest_Rate_Pct: 3, Market_Interest_Rate_Pct: 3.5, Product_Type: 'Product-B',
    Contractual_Maturity_Date: '2026-01-01', Actual_Closure_Date: '', ...over,
  });
  test('blank closure date = open contract; Type is case-insensitive', () => {
    const r = validateRows('HISTORICAL', [hist()]);
    expect(r.rejectedRows).toBe(0);
    expect(r.valid[0]).toMatchObject({ type: 'Liability', actualClosureDate: null });
  });
  test('rejects Type outside {Asset, Liability}', () => {
    expect(validateRows('HISTORICAL', [hist({ Type: 'Deposit' })]).rejectedRows).toBe(1);
  });
});
