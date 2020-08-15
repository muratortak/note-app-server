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
var corsOptions = {
  origin: 'http://127.0.0.1:3001',
  credentials: true
  // optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
app.use(cors(corsOptions));
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
  console.log('ret ops ', ret.ops);
  var userId = ret.ops[0]._id;
  var noteId = createNotes(userId);
  console.log('note id after the user created: ', noteId);
  // Start a note document for the user with an empty note array.
  // createNotes()
  // console.log('ret register: ', ret);
  if (ret.result.n === 1 && ret.result.ok === 1) {
    return res.status(201)
        .json({message: `${ret.insertedCount} User created.`});
  }
  return res.status(400).json({error: `User can't be created.`});
});

app.post('/login', async (req, res) => {
  const username = req.body.userName;
  const pwd = req.body.password;
  console.log('login: ', username, pwd);
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
  console.log('token in login: ', token);
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
  console.log('get all notes');
  const userId = req.user;
  const notes = await db.collection('Notes')
      .find({userId: new ObjectID(userId)}).toArray();
  console.log('Notes in getAllNotes: ', notes);
  return res.status(200).json({message: 'Notes successfull', notes});
});

// Add notes
app.post('/addNote', auth, async(req, res) => {
  const userId = req.user;
  console.log('user id in add note: ', userId);
  const {type, title, note, coord, zIndex } = req.body; 
  console.log('title in add note: ', title);
  const newNote = await db.collection('Notes')
    .findOneAndUpdate(
      {userId: new ObjectID(userId)},
      {
        $push: { notes: { _id: new ObjectID(), type, title, note, coord, zIndex}, }
      },
      {returnOriginal: false},
      )
  res.status(200).json({message: 'Note successully saved'});
});

app.put('/note', auth, (req, res) => {
  const userId = req.user;

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


const createNotes = async (userId) => {
  let note = await db.collection('Notes').insertOne({_id: new ObjectID(), userId: new ObjectID(userId), notes:[{_id: new ObjectID(), type: 'Add Type', title: 'Add Title', note: 'Add Note', coord: {x: 0, y:0} }]});
  console.log('note in createNotes: ', note);
  return note.ops[0]._id;
}

// const tok = getToken().then( res => {
//     verifyToken(res).then(tok => console.log('out token: ', tok));
// });
// console.log('token out: ', tok);
// console.log(tokenVerify);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
