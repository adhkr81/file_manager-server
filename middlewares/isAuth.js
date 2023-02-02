const { expressjwt: expressJWT } = require("express-jwt");
require("dotenv").config();

module.exports = expressJWT({
  secret: process.env.TOKEN_SIGN_SECRET,
  algorithms: ["HS256"],
});