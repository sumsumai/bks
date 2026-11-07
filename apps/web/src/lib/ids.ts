import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

export function randomId(len = 16): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % 36];
  return out;
}

export type IdPrefix =
  | "usr" | "ses" | "biz" | "loc" | "stf" | "svc" | "avl" | "off" | "cus" | "bkg" | "pay" | "agt" | "kno"
  | "mem" | "chn" | "cnv" | "msg" | "act" | "use" | "ntf" | "aud" | "fcat" | "thr" | "pst" | "rpt" | "psh";

export const newId = (prefix: IdPrefix) => `${prefix}_${randomId(16)}`;

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}
