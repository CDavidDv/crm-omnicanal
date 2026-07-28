import { canSend, isOptOut, windowRemainingHours } from "../src/lib/channels/policy";
const h = (n: number) => new Date(Date.now() - n * 3600_000);
const cases = [
  ["WA dentro 24h", canSend({ channel: "whatsapp", optedOut: false, lastInboundAt: h(2) })],
  ["WA fuera 24h", canSend({ channel: "whatsapp", optedOut: false, lastInboundAt: h(30) })],
  ["WA sin inbound", canSend({ channel: "whatsapp", optedOut: false, lastInboundAt: null })],
  ["IG dentro 24h", canSend({ channel: "instagram", optedOut: false, lastInboundAt: h(5) })],
  ["IG 3 dias", canSend({ channel: "instagram", optedOut: false, lastInboundAt: h(72) })],
  ["IG 9 dias", canSend({ channel: "instagram", optedOut: false, lastInboundAt: h(216) })],
  ["MSG sin inbound", canSend({ channel: "messenger", optedOut: false, lastInboundAt: null })],
  ["opt-out", canSend({ channel: "whatsapp", optedOut: true, lastInboundAt: h(1) })],
] as const;
for (const [name, r] of cases) console.log(name.padEnd(18), JSON.stringify(r));
console.log("optout frases:", ["ya no me manden nada","STOP","hola quiero comprar","dar de baja"].map(t => `${t} => ${isOptOut(t)}`).join(" | "));
console.log("horas restantes (2h):", windowRemainingHours(h(2)));

