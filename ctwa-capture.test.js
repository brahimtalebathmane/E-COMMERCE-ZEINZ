// Plain node:assert test for the CTWA capture helpers — no test framework in
// this project. Run with: node ctwa-capture.test.js
const assert = require("node:assert");
const {
  extractExternalAdReply,
  phoneJidFromKey,
  senderDisplayName,
  toMetaE164Digits,
} = require("./ctwa-capture");

// --- extractExternalAdReply ------------------------------------------------

const extendedTextAd = extractExternalAdReply({
  extendedTextMessage: { contextInfo: { externalAdReply: { ctwaClid: "clid-1" } } },
});
assert.ok(extendedTextAd, "extracts externalAdReply from extendedTextMessage");
assert.strictEqual(extendedTextAd.ctwaClid, "clid-1");

const imageAd = extractExternalAdReply({
  imageMessage: { contextInfo: { externalAdReply: { ctwaClid: "clid-2" } } },
});
assert.ok(imageAd, "extracts externalAdReply from imageMessage");
assert.strictEqual(imageAd.ctwaClid, "clid-2");

assert.strictEqual(
  extractExternalAdReply({ conversation: "salam" }),
  null,
  "plain-string message value doesn't crash",
);
assert.strictEqual(extractExternalAdReply(null), null, "null message doesn't crash");

assert.strictEqual(
  extractExternalAdReply({
    extendedTextMessage: { contextInfo: { externalAdReply: { ctwaClid: "" } } },
  }),
  null,
  "empty ctwaClid returns null",
);
assert.strictEqual(
  extractExternalAdReply({
    extendedTextMessage: { contextInfo: { externalAdReply: { ctwaClid: "   " } } },
  }),
  null,
  "whitespace-only ctwaClid returns null",
);

// --- phoneJidFromKey -----------------------------------------------------

assert.strictEqual(
  phoneJidFromKey({ remoteJid: "99887766@lid", remoteJidAlt: "22233445566@s.whatsapp.net" }),
  "22233445566@s.whatsapp.net",
  "LID remoteJid resolves via remoteJidAlt",
);

assert.strictEqual(
  phoneJidFromKey({ remoteJid: "120363@g.us" }),
  null,
  "group JID returns null",
);

assert.strictEqual(
  phoneJidFromKey({ remoteJid: "status@broadcast" }),
  null,
  "status broadcast JID returns null",
);

// --- senderDisplayName -----------------------------------------------------

assert.strictEqual(
  senderDisplayName({ pushName: "  Ahmed  " }),
  "Ahmed",
  "trims the pushName",
);
assert.strictEqual(senderDisplayName({ pushName: "" }), null, "empty pushName returns null");
assert.strictEqual(
  senderDisplayName({ pushName: "   " }),
  null,
  "whitespace-only pushName returns null",
);
assert.strictEqual(senderDisplayName({}), null, "missing pushName returns null");
assert.strictEqual(senderDisplayName(null), null, "null message doesn't crash");

// --- toMetaE164Digits parity with sanitizePhoneForMetaE164 ---------------
//
// This plain-Node test can't `require()` the TypeScript source directly (no
// ts-node/tsx in this project), so expected values are the hand-traced
// output of sanitizePhoneForMetaE164 (src/lib/meta-user-data.ts) for each
// input. toMetaE164Digits is a deliberate verbatim copy of that function —
// see the duplication warning on its definition in ctwa-capture.js — so if
// either implementation changes, update this table to match.

const parityCases = [
  ["22233445566", "22233445566"],
  ["+222 33 44 55 66", "22233445566"],
  ["33445566", "22233445566"],
  ["0033445566", "22233445566"],
  ["+33612345678", "33612345678"],
  ["abc", null],
  ["", null],
];

for (const [input, expected] of parityCases) {
  assert.strictEqual(
    toMetaE164Digits(input),
    expected,
    `toMetaE164Digits mismatch for input: ${JSON.stringify(input)}`,
  );
}

// eslint-disable-next-line no-console
console.log("ctwa-capture.test.js: all assertions passed");
