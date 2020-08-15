const jwt = require('jsonwebtoken');
const mongo = require('mongodb').MongoClient;

const auth = async (req, res, next) => {
  console.log('this is auth before try');
  console.log('cookie: ', req);
  console.log('this is auth before try');
  try {
    const {token} = req.cookies;
    const decoded = await jwt.verify(token, 'thisisthetoken');
    console.log('decoded: ', decoded);
    // TODO: find the user
    // if(!user) {
    //     throw new Error();
    // }
    // send the found user to the handler.
    // Don't need to make another fetch user operation
    // to find the user since we already have it here.
    // Just store it to the req which is available in the handler.
    req.user = decoded._id;
    next();
  } catch (err) {
    res.status(401).send({error: 'Please make sure you logged in!'});
  }
};

module.exports = auth;
