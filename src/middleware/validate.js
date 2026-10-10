'use strict';
const { z } = require('zod');
const AppError = require('../utils/AppError');
const { CURRENCIES, BUCKET_KEYS } = require('../config/constants');
const { parseISODate } = require('../utils/dates');

const isoDate = z
  .string()
  .refine((s) => parseISODate(s) !== null, 'must be YYYY-MM-DD')
  .transform((s) => parseISODate(s));

const currency = z.enum(['ALL', ...CURRENCIES]).default('ALL');

const ladderQuery = z.object({
  calculationDate: isoDate.optional(),
  currency,
  location: z.string().optional(),
});

const drillQuery = ladderQuery.extend({
  bucket: z.enum(BUCKET_KEYS).optional(),
  side: z.enum(['Asset', 'Liability']).optional(),
  search: z.string().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  sort: z.enum(['cashflow', 'principal', 'effectiveMaturityDate', 'contractualMaturityDate', 'probability', 'daysEarlier', 'transactionId']).default('cashflow'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const shift = z
  .object({
    value: z.coerce.number().int().min(0).max(120),
    unit: z.enum(['days', 'weeks', 'months', 'years']),
    direction: z.enum(['earlier', 'later']),
    productTypes: z.array(z.string()).optional(),
  })
  .optional()
  .nullable();

const scenarioBody = z
  .object({
    calculationDate: isoDate.optional(),
    currency,
    location: z.string().optional(),
    assetShift: shift,
    liabilityShift: shift,
  })
  .refine((b) => (b.assetShift && b.assetShift.value) || (b.liabilityShift && b.liabilityShift.value), {
    message: 'Provide at least one non-zero asset or liability shift',
  });

const loginBody = z.object({
  userId: z.string().min(1).max(64),
  password: z.string().min(1).max(128),
  role: z.enum(['SUPPORT', 'LOCATION_USER']).optional(),
});

const analyticsQuery = z.object({
  currency,
  location: z.string().optional(),
  dimension: z.enum(['productType', 'customerSegment', 'type']).default('productType'),
});

/** Validate req[part] against a zod schema and replace it with the parsed value. */
const validate = (schema, part = 'query') => (req, _res, next) => {
  const result = schema.safeParse(req[part]);
  if (!result.success) {
    return next(AppError.badRequest('Invalid request', result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))));
  }
  req.valid = { ...(req.valid || {}), [part]: result.data };
  return next();
};

module.exports = { validate, schemas: { ladderQuery, drillQuery, scenarioBody, loginBody, analyticsQuery } };
