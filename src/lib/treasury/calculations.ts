/**
 * Settlement arithmetic, mirrored from treasury_settle() (migration 074) so
 * the settlement screen can preview the numbers before saving. The database
 * recomputes everything itself; this is only the on-screen preview.
 */

export type SettlementLine = { totalPrice: number; fee: number | null };

export type SettlementPreview = {
  /** Cash the agent collected from customers (ticked shipped orders). */
  collected: number;
  /** His delivery fees on the ticked shipped and returned orders. */
  fees: number;
  /** What he should hand over: collected − fees when he keeps them, else collected. Negative = the owner pays him. */
  expectedNet: number;
  /** received − expected (0 when it matches). */
  difference: number;
};

export function settlementPreview(input: {
  sales: SettlementLine[];
  returns: SettlementLine[];
  agentKeepsFees: boolean;
  received: number | null;
}): SettlementPreview {
  const collected = round2(input.sales.reduce((s, l) => s + (l.totalPrice || 0), 0));
  const fees = round2([...input.sales, ...input.returns].reduce((s, l) => s + (l.fee ?? 0), 0));
  const expectedNet = round2(input.agentKeepsFees ? collected - fees : collected);
  const difference = input.received == null ? 0 : round2(input.received - expectedNet);
  return { collected, fees, expectedNet, difference };
}

/** Sign a quick-add amount the way treasury_add_transaction() does. */
export function signedAmount(direction: "income" | "expense" | "adjustment", amount: number): number {
  if (direction === "income") return Math.abs(amount);
  if (direction === "expense") return -Math.abs(amount);
  return amount;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
