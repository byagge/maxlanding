export function trc20Expected(amount: number, nonce: number): { raw: string; display: string } {
  const base = Math.round(amount * 1_000_000);
  const raw = String(base + nonce);
  return { raw, display: (Number(raw) / 1_000_000).toFixed(6) };
}

export function tonNano(amount: number): string {
  return Math.round(amount * 1e9).toString();
}

export function decodeTonComment(text: unknown): string {
  if (typeof text !== "string" || !text) return "";
  try {
    const decoded = Buffer.from(text, "base64").toString("utf8");
    return decoded.replace(/^\u0000+/, "").trim();
  } catch {
    return text.trim();
  }
}

type TronTransfer = { transaction_id?: string; value?: string; to?: string };
type TonTransaction = { transaction_id?: { hash?: string }; in_msg?: { value?: string; message?: string; msg_data?: { text?: string } } };

export function findTrc20Transfer(rows: TronTransfer[], address: string, expectedRaw: string): string | null {
  const target = address.trim();
  const hit = rows.find((row) => row.to === target && String(row.value) === expectedRaw && row.transaction_id);
  return hit?.transaction_id ?? null;
}

export function findTonPayment(rows: TonTransaction[], memo: string, minNano: bigint): string | null {
  for (const row of rows) {
    const comment = decodeTonComment(row.in_msg?.message || row.in_msg?.msg_data?.text || "");
    const value = BigInt(row.in_msg?.value || "0");
    if (comment.includes(memo) && value >= minNano) {
      return row.transaction_id?.hash || memo;
    }
  }
  return null;
}
