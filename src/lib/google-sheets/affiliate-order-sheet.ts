import { GoogleSpreadsheet } from "google-spreadsheet";
import { JWT } from "google-auth-library";

let cachedAuth: JWT | null = null;

function getServiceAccountAuth(): JWT {
  if (cachedAuth) return cachedAuth;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  }

  let creds: { client_email?: string; private_key?: string };
  try {
    creds = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email/private_key");
  }

  cachedAuth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return cachedAuth;
}

function extractSpreadsheetId(sheetUrl: string): string {
  const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) {
    throw new Error("Could not parse a spreadsheet id from affiliate_sheet_url");
  }
  return match[1];
}

export type AffiliateOrderSheetRow = {
  /** ISO timestamp. */
  orderDate: string;
  orderId: string;
  fullName: string;
  phone: string;
  country: string;
  city: string;
  fullAddress: string;
  sku: string;
  quantity: number;
  total: number;
  currency: string;
  note: string;
};

/**
 * Appends one row to the product's affiliate Google Sheet in COD Partner's
 * fixed 12-column order. The target worksheet is always `sheetsByIndex[0]`
 * (never looked up by title) since COD Partner's sheets are sometimes
 * titled "Sheet1" and sometimes "الورقة1". Write-only — this app never
 * reads order status back from the sheet.
 */
export async function appendAffiliateOrderRow(
  sheetUrl: string,
  row: AffiliateOrderSheetRow,
): Promise<void> {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  const doc = new GoogleSpreadsheet(spreadsheetId, getServiceAccountAuth());
  await doc.loadInfo();

  const sheet = doc.sheetsByIndex[0];
  if (!sheet) {
    throw new Error("Target Google Sheet has no worksheets");
  }

  await sheet.addRow([
    row.orderDate,
    row.orderId,
    row.fullName,
    row.phone,
    row.country,
    row.city,
    row.fullAddress,
    row.sku,
    row.quantity,
    row.total,
    row.currency,
    row.note,
  ]);
}
