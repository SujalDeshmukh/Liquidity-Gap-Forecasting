const { parseISODate, addMonths, dateFromFilename, shiftDate, toISODate } = require('../../src/utils/dates');

describe('dates', () => {
  test('parses strict YYYY-MM-DD', () => {
    expect(toISODate(parseISODate('2026-10-10'))).toBe('2026-10-10');
  });
  test.each(['32/13/2026', '2026-02-30', '2026-13-01', '10-10-2026', '', null, 46295])('rejects %p', (v) => {
    expect(parseISODate(v)).toBeNull();
  });
  test('month addition clamps to month end', () => {
    expect(toISODate(addMonths(parseISODate('2026-01-31'), 1))).toBe('2026-02-28');
    expect(toISODate(addMonths(parseISODate('2028-01-31'), 1))).toBe('2028-02-29');
  });
  test('reads DDMMYYYY from file names', () => {
    expect(toISODate(dateFromFilename('asset_book - 10102026.xlsx'))).toBe('2026-10-10');
    expect(dateFromFilename('asset_book.xlsx')).toBeNull();
  });
  test('shifts by weeks and months', () => {
    expect(toISODate(shiftDate(parseISODate('2026-10-10'), 2, 'weeks'))).toBe('2026-10-24');
    expect(toISODate(shiftDate(parseISODate('2026-10-10'), -1, 'months'))).toBe('2026-09-10');
  });
});
