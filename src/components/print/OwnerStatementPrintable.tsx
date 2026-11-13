import React from 'react';
import { CountryPack } from '../../countries/types';
import { formatMoney } from '../../lib/money';
import { Owner, Property } from '../../db/schema';

interface OwnerStatementPrintableProps {
  orgName: string;
  statementOwner: Owner;
  statementMonth: string;
  ownerProps: Property[];
  rentCollectedMinor: number;
  commissionMinor: number;
  totalExpensesMinor: number;
  netPayoutMinor: number;
  pack: CountryPack;
}

export const OwnerStatementPrintable: React.FC<OwnerStatementPrintableProps> = ({
  orgName,
  statementOwner,
  statementMonth,
  ownerProps,
  rentCollectedMinor,
  commissionMinor,
  totalExpensesMinor,
  netPayoutMinor,
  pack,
}) => {
  const currentDate = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const verificationRef = `${statementOwner.id.slice(0, 8).toUpperCase()}-${statementMonth}`;

  return (
    <div
      className="print-area flex flex-col w-full max-w-[800px] mx-auto bg-white text-black font-sans leading-normal"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        maxWidth: '800px',
        margin: '0 auto',
        padding: '24px 0',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
      }}
    >
      {/* 1. Header with Emblem and Owner Information (Standard Flexbox, no absolute positioning) */}
      <div
        className="flex items-start justify-between pb-6 border-b-2 border-gray-900 gap-6"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '24px',
          borderBottom: '2px solid #111827',
          paddingBottom: '24px',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '8px',
              backgroundColor: '#111827',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: '24px', height: '24px' }}
            >
              <path d="M3 21h18" />
              <path d="M5 21V7l8-4v18" />
              <path d="M19 21V11l-6-4" />
            </svg>
          </div>
          <div>
            <h1
              className="font-bold print-header-title"
              style={{
                fontSize: '20px',
                fontWeight: 700,
                letterSpacing: '-0.025em',
                color: '#030712',
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              {orgName || 'Horizon Property Management'}
            </h1>
            <p
              className="font-bold print-header-title"
              style={{
                fontSize: '13px',
                fontWeight: 700,
                color: '#111827',
                marginTop: '4px',
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              Owner Disbursement Statement
            </p>
            <p
              style={{
                fontSize: '12px',
                color: '#4b5563',
                marginTop: '2px',
                marginBottom: 0,
                lineHeight: 1.5,
              }}
            >
              Statement Period: {statementMonth}
            </p>
          </div>
        </div>

        <div
          style={{
            textAlign: 'right',
            fontSize: '12px',
            color: '#374151',
            flexShrink: 0,
          }}
        >
          <div
            className="font-bold print-header-title"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#4b5563',
            }}
          >
            Prepared For
          </div>
          <div
            className="font-bold"
            style={{
              fontWeight: 700,
              color: '#030712',
              fontSize: '16px',
              marginTop: '2px',
            }}
          >
            {statementOwner.name}
          </div>
          <p
            style={{
              color: '#4b5563',
              marginTop: '2px',
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            Disbursement: {statementOwner.payout_details || 'ACH Bank Transfer'}
          </p>
          <p
            className="tabular-nums"
            style={{
              color: '#6b7280',
              marginTop: '2px',
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            Issued: {currentDate}
          </p>
        </div>
      </div>

      {/* 2. Middle Section: Property Ownership Summary (Standard Document Flow with margin-bottom: 24px) */}
      <div
        style={{
          display: 'block',
          marginBottom: '24px',
          paddingBottom: '20px',
          borderBottom: '1px solid #e5e7eb',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: '24px',
            fontSize: '12px',
          }}
        >
          <div>
            <span
              className="font-bold print-header-title"
              style={{
                fontWeight: 700,
                color: '#4b5563',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'block',
                fontSize: '11px',
              }}
            >
              Property Ownership Summary
            </span>
            <span
              className="font-bold"
              style={{
                fontWeight: 700,
                color: '#111827',
                fontSize: '14px',
                marginTop: '4px',
                display: 'block',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                lineHeight: 1.5,
              }}
            >
              {ownerProps.map((p) => p.name).join(', ') || 'All Assigned Portfolio Units'}
            </span>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <span
              className="font-bold print-header-title"
              style={{
                fontWeight: 700,
                color: '#4b5563',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                display: 'block',
                fontSize: '11px',
              }}
            >
              Jurisdiction
            </span>
            <span
              className="font-bold"
              style={{
                fontWeight: 700,
                color: '#111827',
                fontSize: '13px',
                marginTop: '4px',
                display: 'block',
              }}
            >
              {pack.name} ({pack.code})
            </span>
          </div>
        </div>
      </div>

      {/* 3. Financial Statement Breakdown Table */}
      <div
        style={{
          display: 'block',
          marginBottom: '24px',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        <table
          style={{
            width: '100%',
            textAlign: 'left',
            fontSize: '13px',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr
              className="border-b border-gray-300"
              style={{
                borderBottom: '1px solid #d1d5db',
                color: '#111827',
                fontWeight: 700,
                textTransform: 'uppercase',
                fontSize: '11px',
                letterSpacing: '0.05em',
              }}
            >
              <th
                className="font-bold"
                style={{
                  padding: '10px 12px',
                  fontWeight: 700,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Accounting Description
              </th>
              <th
                className="font-bold"
                style={{
                  padding: '10px 12px',
                  fontWeight: 700,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Calculation Basis
              </th>
              <th
                className="tabular-nums font-bold"
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  width: '180px',
                  fontWeight: 700,
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Amount ({pack.currency.code})
              </th>
            </tr>
          </thead>
          <tbody style={{ borderBottom: '1px solid #e5e7eb' }}>
            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td
                className="font-bold"
                style={{
                  padding: '10px 12px',
                  fontWeight: 700,
                  color: '#111827',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Gross Rental Revenue Collected
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  color: '#4b5563',
                  fontSize: '12px',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {ownerProps.length} active {ownerProps.length === 1 ? 'property' : 'properties'}
              </td>
              <td
                className="font-mono tabular-nums whitespace-nowrap font-bold"
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#111827',
                }}
              >
                +{formatMoney(rentCollectedMinor, pack)}
              </td>
            </tr>

            <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td
                className="font-bold"
                style={{
                  padding: '10px 12px',
                  fontWeight: 700,
                  color: '#111827',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Agency Management Commission
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  color: '#4b5563',
                  fontSize: '12px',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                {statementOwner.commission_value}
                {statementOwner.commission_type === 'percentage' ? '% of gross collections' : ' flat fee'}
              </td>
              <td
                className="font-mono tabular-nums whitespace-nowrap font-bold"
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#be123c',
                }}
              >
                -{formatMoney(commissionMinor, pack)}
              </td>
            </tr>

            <tr>
              <td
                className="font-bold"
                style={{
                  padding: '10px 12px',
                  fontWeight: 700,
                  color: '#111827',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Property Repairs &amp; Operating Expenses
              </td>
              <td
                style={{
                  padding: '10px 12px',
                  color: '#4b5563',
                  fontSize: '12px',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Approved maintenance outlays
              </td>
              <td
                className="font-mono tabular-nums whitespace-nowrap font-bold"
                style={{
                  padding: '10px 12px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: '#be123c',
                }}
              >
                -{formatMoney(totalExpensesMinor, pack)}
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr
              className="total-net-row bg-gray-50/60"
              style={{
                borderTop: '3px solid #000000',
              }}
            >
              <td
                colSpan={2}
                className="font-bold"
                style={{
                  padding: '18px 12px',
                  fontWeight: 700,
                  fontSize: '14px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.025em',
                  color: '#030712',
                  wordWrap: 'break-word',
                  overflowWrap: 'break-word',
                }}
              >
                Total Net Owner Disbursement
              </td>
              <td
                className="font-mono tabular-nums whitespace-nowrap font-bold"
                style={{
                  padding: '18px 12px',
                  textAlign: 'right',
                  fontSize: '17px',
                  fontWeight: 700,
                  color: '#030712',
                }}
              >
                {formatMoney(netPayoutMinor, pack)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 4. Trust Account & Disbursement Authorization Note (Wrapped properly with overflow-wrap / word-wrap and line-height: 1.5) */}
      <div
        style={{
          display: 'block',
          marginBottom: '24px',
          paddingTop: '20px',
          borderTop: '1px solid #e5e7eb',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        <div
          style={{
            fontSize: '12px',
            color: '#4b5563',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            lineHeight: 1.5,
          }}
        >
          <div
            className="font-bold print-header-title"
            style={{
              fontWeight: 700,
              color: '#111827',
              marginBottom: '6px',
              fontSize: '12px',
            }}
          >
            Disbursement Authorization &amp; Trust Account Policy
          </div>
          <p
            style={{
              margin: 0,
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              lineHeight: 1.5,
            }}
          >
            Funds are held in a designated trust account and disbursed strictly in accordance with approved property management agreement instructions to{' '}
            <strong style={{ color: '#111827', fontWeight: 700 }}>
              {statementOwner.payout_details || 'registered direct deposit instructions'}
            </strong>
            . All rental receipts, statutory withholding calculations, and ledger allocations are finalized as of this statement date. Please retain this statement for tax and financial audit records.
          </p>
        </div>
      </div>

      {/* 5. Footer (Verification Ref only; clean layout) */}
      <div
        style={{
          display: 'block',
          paddingTop: '16px',
          borderTop: '1px solid #e5e7eb',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            fontSize: '11px',
            color: '#6b7280',
          }}
        >
          <span className="font-mono tabular-nums font-semibold" style={{ fontWeight: 600 }}>
            Verification Ref: {verificationRef}
          </span>
        </div>
      </div>
    </div>
  );
};

