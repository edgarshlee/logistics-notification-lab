export const statusNames = {
  registered: "등록",
  in_transit: "배송 중",
  exception: "배송 예외",
  delivered: "배송 완료",
};
export const statusActions = {
  registered: [["in_transit", "배송 시작"]],
  in_transit: [
    ["exception", "예외 등록"],
    ["delivered", "배송 완료"],
  ],
  exception: [["in_transit", "배송 재개"]],
  delivered: [],
};
export const eventMessages = {
  ShipmentInTransit: "배송을 시작했습니다.",
  ShipmentDelivered: "배송을 완료했습니다.",
  ShipmentExceptionRaised: "배송 예외가 발생했습니다.",
};
export const eventNames = {
  ShipmentInTransit: "배송 시작",
  ShipmentExceptionRaised: "배송 예외",
  ShipmentDelivered: "배송 완료",
};
export const dateTime = (value) => new Date(value).toLocaleString("ko-KR");
export const time = (value) => new Date(value).toLocaleTimeString("ko-KR");
export function ago(value, now = Date.now()) {
  const s = Math.max(0, Math.round((now - Date.parse(value)) / 1000));
  if (s < 60) return "방금";
  if (s < 3600) return Math.floor(s / 60) + "분 전";
  if (s < 86400) return Math.floor(s / 3600) + "시간 전";
  return Math.floor(s / 86400) + "일 전";
}
// 기준 시각부터 걸린 시간: "+0.8초", "+12초", "+3분"
export function after(from, to) {
  const ms = Date.parse(to) - Date.parse(from);
  if (!Number.isFinite(ms)) return "";
  if (ms < 10000) return "+" + (Math.max(0, ms) / 1000).toFixed(1) + "초";
  if (ms < 120000) return "+" + Math.round(ms / 1000) + "초";
  return "+" + Math.round(ms / 60000) + "분";
}
