import { z } from 'zod';

export const CountryCurrencySchema = z.object({
  code: z.string(), // ISO 4217, e.g. "USD", "JPY", "KWD"
  symbol: z.string(),
  minorUnits: z.number().int().min(0).max(4), // 0 for JPY, 3 for KWD, 2 for USD
  symbolPosition: z.enum(['before', 'after']),
  decimalSeparator: z.string(),
  groupSeparator: z.string(),
  groupingStyle: z.enum(['standard', 'indian']), // standard = 3 digits, indian = 3 then 2
  roundingMode: z.enum(['half-up', 'half-even', 'floor', 'ceil']),
});

export const DepositRuleSchema = z.object({
  maxMonths: z.number().nullable(), // e.g. 3 for DE, 1.25 for GB (5 weeks), null for US
  interestRequired: z.boolean(),
  interestType: z.enum(['fixed', 'reference-rate', 'none']),
  interestRate: z.number().nullable(), // annual percentage e.g. 1.5
  interestReferenceRate: z.string().nullable(), // e.g. "BOE_BASE" or "ECB_MAIN"
  interestMargin: z.number().default(0),
  compounding: z.enum(['daily', 'monthly', 'annual', 'none']),
  dayCountBasis: z.enum(['365', '360', 'actual']),
  beneficiary: z.enum(['tenant', 'landlord', 'split']),
  protectionSchemeRequired: z.boolean(),
  protectionDeadlineDays: z.number().nullable(),
  interestPermitted: z.boolean().default(true),
});

export const LateFeeRuleSchema = z.object({
  allowed: z.enum(['yes', 'no', 'conditional']),
  type: z.enum(['flat', 'percent', 'none']),
  maxValue: z.number().nullable(), // cap in major currency or max percent
  maxBasis: z.enum(['fixed_amount', 'rent_percentage', 'annual_interest_cap', 'none']),
  graceDaysDefault: z.number().int().min(0),
  noticeRequiredDays: z.number().int().min(0),
  contractClauseRequired: z.boolean(),
  islamicFinanceMode: z.boolean().default(false), // e.g. KW, PK, AE where late fees must go to charity
});

export const NoticePeriodsSchema = z.object({
  rentIncreaseDays: z.number().int(),
  terminationDays: z.number().int(),
  depositReturnDays: z.number().int(),
});

export const TaxRuleSchema = z.object({
  vatOnResidentialRent: z.boolean(),
  withholdingTaxOnRent: z.boolean(),
  withholdingThreshold: z.number().nullable(),
  propertyTaxNote: z.string(),
});

export const CountryPackSchema = z.object({
  code: z.string().length(2), // ISO 3166-1 alpha-2
  name: z.string(),
  flag: z.string(),
  locale: z.string(),
  timezones: z.array(z.string()),
  rtl: z.boolean().default(false),
  currency: CountryCurrencySchema,
  dateFormat: z.string(), // e.g. "YYYY-MM-DD", "DD/MM/YYYY"
  timeFormat: z.string(), // "12h" | "24h"
  firstDayOfWeek: z.number().int().min(0).max(6), // 0 = Sunday, 1 = Monday
  areaUnit: z.enum(['sqft', 'sqm']),
  deposit: DepositRuleSchema,
  lateFee: LateFeeRuleSchema,
  noticePeriods: NoticePeriodsSchema,
  tax: TaxRuleSchema,
  idDocumentTypes: z.array(z.string()),
  paymentMethods: z.array(z.string()),
  phonePrefix: z.string(),
  leaseDurationMonthsDefault: z.number().int(),
  billingDueDayDefault: z.number().int().min(1).max(28),
  legalNotes: z.array(z.string()).min(2),
  version: z.number().int(),
  updatedAt: z.number().int(),
});

export type CountryPack = z.infer<typeof CountryPackSchema>;
export type CountryCurrency = z.infer<typeof CountryCurrencySchema>;
export type DepositRule = z.infer<typeof DepositRuleSchema>;
export type LateFeeRule = z.infer<typeof LateFeeRuleSchema>;
