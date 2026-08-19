const Route = require("express").Router();
const { createCheckoutSession } = require("../controllers/session.controller.js");

const sessionRoute = Route.post("/checkout-session", createCheckoutSession);

module.exports = sessionRoute;
