const jwt = require("jsonwebtoken");

function generateToken(user) {
  const { id, email, company, firstname, branch, role, settings } = user;

  const signature = process.env.TOKEN_SIGN_SECRET;
  const expiration = "12h";

  return jwt.sign({ id, email, company, firstname, branch, role, settings }, signature, {
    expiresIn: expiration,
  });
}

module.exports = generateToken;