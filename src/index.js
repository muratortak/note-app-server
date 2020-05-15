const express = require('express');
const app = require('express')();
const client = require('mongodb').MongoClient;
const assert = require('assert');
const port = process.env.PORT || 3000;
const url = 'mongodb://localhost:27017';
const dbName = 'dashboard';
const collectionName = 'Users';
const connectionOptions = {poolSize: process.env.MONGO_POOLSIZE || 1};
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const auth = require('./middleware/auth');
const ObjectID = require('mongodb').ObjectID;
const cookieParser = require('cookie-parser');
app.use(express.json());
app.use(cors());
app.use(cookieParser());
let db;
client.connect(url, connectionOptions, (err, database) => {
  if (err) throw new Error(err);
  console.log('DB is connected.');
  db = database.db(dbName);
});

// get a User's info.
app.post('/me', auth, async (req, res) => {
  const user =
    await db.collection(collectionName).findOne({_id: new ObjectID(req.user)});
  // TODO: Find a better way to validate whether user exists or not.
  // console.log("ANS, ", ans);
  console.log('ANS IN ME: ', user, user.length);
  return res.status(200).json(user);
  // return res.status(404).json({message: 'User Not Found'});
});

// Register new User.
app.post('/signup', async (req, res) => {
  const newUser = {};
  newUser.userName = req.body.userName;
  newUser.pwd = await getHashed(req.body.password);
  console.log('User pwd: ', newUser.pwd);
  newUser.email = req.body.email;

  // TODO: Hash the pwd.
  const ret = await db.collection(collectionName).insertOne(newUser);
  console.log('ret register: ', ret);
  if (ret.result.n === 1 && ret.result.ok === 1) {
    return res.status(201)
        .json({message: `${ret.insertedCount} User created.`});
  }
  return res.status(400).json({error: `User can't be created.`});
});

app.post('/login', async (req, res) => {
  const username = req.body.userName;
  const pwd = req.body.password;
  let user =
    await db.collection(collectionName).findOne({userName: username});
  // TODO: Add here pwd validator ( also add to front end ).
  // There are some test user cases with no password
  // and it causes error upon request to login.
  const isValid = await validateUser(pwd, user.pwd);
  if (!isValid) {
    return res.status(400).json({message: 'Login credentials are wrong!'});
  }
  const {token, tokenClient} = await getToken(user._id);
  user = await db.collection(collectionName)
      .findOneAndUpdate(
          {_id: new ObjectID(user._id)},
          {$set: {token: tokenClient}},
          {returnOriginal: false},
      );
  user = user.value;
  res.cookie('token', token,
      {
        maxAge: 60 * 60 * 1000,
        httpOnly: true,
        sameSite: false,
        secure: false,
      });
  res.cookie('tokenClient', tokenClient,
      {
        maxAge: 60 * 60 * 1000,
        httpOnly: false,
      });
  return res.status(200).json({success: 'Succesfully Logged In', user});
});

// Logout
app.post('/logout', auth, async(req, res) => {
  await db.collection(collectionName)
      .findOneAndUpdate(
          {_id: new ObjectID(req.user)},
          {$set: {token: null}},
          {returnOriginal: false},
      );
  res.cookie('token', {expires: Date.now()});
  return res.status(200).json({message: 'Logout successfully.'});
});

// Notes
app.get('/notes', auth, async (req, res) => {
  const userId = req.user;
  const notes = await db.collection('Notes')
      .find({userId: new ObjectID(userId)}).toArray();
  return res.status(200).json({message: 'Notes successfull', notes});
});

const getHashed = async (pwd) => {
  const hashedPwd = await bcrypt.hash(pwd, 8);
  return hashedPwd;
};

const validateUser = async (pwd, hash) => {
  return await bcrypt.compare(pwd, hash);
};

// create auth token
const getToken = async (id) => {
  const token = await jwt.sign(
      {_id: id},
      'thisisthetoken',
      {expiresIn: '7 days'},
  );
  const tokenClient = await jwt.sign(
      {_id: id},
      'thisistheClienttoken',
      {expiresIn: '7 days'},
  );
  // console.log(token);
  return {token, tokenClient};
};

// Verify the User's token.
const verifyToken = async (token, isClient = false) => {
  let verified;
  const clientTokenSalt = 'thisistheClienttoken';
  const tokenSalt = 'thisisthetoken';
  try {
    salt = (isClient) ? clientTokenSalt : tokenSalt;
    token = (isClient) ? token.tokenClient : token.token;
    verified = await jwt.verify(token, salt);
  } catch (err) {
    console.log(err);
  }
  return verified;
};

// const tok = getToken().then( res => {
//     verifyToken(res).then(tok => console.log('out token: ', tok));
// });
// console.log('token out: ', tok);
// console.log(tokenVerify);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
