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
