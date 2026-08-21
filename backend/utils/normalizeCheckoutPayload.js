const normalizeCheckoutPayload = (rawPayload) => {
  const payload = rawPayload && typeof rawPayload === "object" ? { ...rawPayload } : {};

  if (typeof payload.data !== "object" || payload.data === null) {
    payload.data = {};
  }

  if (payload.orderInformation && !payload.data.orderInformation) {
    payload.data.orderInformation = payload.orderInformation;
  }

  delete payload.orderInformation;
  return payload;
};


module.exports = normalizeCheckoutPayload;