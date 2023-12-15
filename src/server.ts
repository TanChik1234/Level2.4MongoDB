import express, { Request, Response, request } from 'express';
import session, { Session } from 'express-session';
const FileStore = require('session-file-store')(session);
import cookieParser from 'cookie-parser';
import * as fs from 'fs';
import * as path from 'path';
import bodyParser from 'body-parser';
import cors from 'cors';
const MongoClient = require('mongodb').MongoClient;
import 'abort-controller/polyfill';
import { promises as fsPromises } from 'fs';



//добавляем до сессии свойство user
declare module 'express-session' {
  interface SessionData {
    user?: { login: string };
  }
}

const app = express();
const port = 3005;
const sessionDirectory = "./sessions";
const dataBaseName = "todoDataBase";
const collectionName = "todoCollection";
const uri = `mongodb+srv://Tanya:qwerty123456789@cluster0.1kfyoaf.mongodb.net/todoDataBase?retryWrites=true&w=majority`

const client = new MongoClient(uri, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true
});

if (!fs.existsSync(sessionDirectory)) {
  fs.mkdirSync(sessionDirectory);
}

app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());
app.use(cors({ 
  credentials: true, 
  origin: `http://localhost:${port}` 
}));

app.use(express.static('public'));

app.use(
  express.static(path.join(__dirname, 'public'), {
    index: false,
  })
)

app.use(
  session({
    store: new FileStore({
      path: sessionDirectory,
      ttl: 86400
    }),
    secret: "secret mikky mouse",
    resave: true,
    saveUninitialized: true,
    cookie: {},
  })
);

app.listen(port, () => {
  console.log(`Frontend server is running at http://localhost:${port}`);
});

app.post('/api/v2/router', (req: Request, res: Response) => {
  const action = req.query.action as string;

  switch (action) {
    case 'login':
      console.log("login");
      loginHandler(req, res);
      break;
    case 'logout':
      console.log("logout");
      logoutHandler(req, res);
      break;
    case 'register':
      console.log("register");
      registerHandler(req, res);
      break;
    case 'getItems':
      console.log("getItem");
      getItemsHandler(req, res);
      break;
    case 'deleteItem':
      console.log("deleteItem");
      deleteItemHandler(req, res);
      break;
    case 'createItem':
      console.log("addItem");
      addItemHandler(req, res);
      break;
    case 'editItem':
      console.log("editItem");
      editItemHandler(req, res);
      break;
    default:
      res.status(400).send('Invalid action');
  }
})

async function getItemsHandler (req: Request, res: Response) {
  console.log(req.session);
  try {
    await client.connect();
    const collection = client.db(dataBaseName).collection(collectionName);
    const fieldDocument = await collection.find({
      login: req.session.user
    }).toArray();
    if (!fieldDocument || fieldDocument.length !== 1) {
      res.status(500).json({ error: 'Data for this user is absent in the database.' });
      return;
    }
        res.send(JSON.stringify({
        items: fieldDocument[0].items
      }));
  } catch (error) {
    res.status(500).json({ error: error });
  } finally {
    await client.close();
  }
};


async function addItemHandler(req: Request, res: Response) {
  if (!checkText(req.body.text)) {
    res.status(400).json({ ok: false, error: "Bad Request" });
    return;
  }

  try {
    await client.connect();
    const collection = client.db(dataBaseName).collection(collectionName);
    const fieldDocument = await collection.find({
      login: req.session.user,
    }).toArray();

    if (!fieldDocument || fieldDocument.length !== 1) {
      res.status(500).json({ error: 'Data for this user is absent in the database.' });
      return;
    }

    const user = fieldDocument[0];
    const userItems = user.items;

    const currentID = await findItemID();

    userItems.push({
      id: currentID,
      text: req.body.text,
      checked: false,
    });

    await collection.updateOne(
      { login: user.login, pass: user.pass },
      { $set: { items: userItems } }
    );

    res.send(JSON.stringify({
      id: currentID,
    }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err });
  } finally {
    await client.close();
  }
}


async function editItemHandler (req:Request, res: Response) {
  if(!checkText(req.body.text)){
    res.status(400).json({ ok: false, error: "Bad Request"});
    return;
  }
  try {
    await client.connect();
    const collection = client.db(dataBaseName).collection(collectionName);
    const fieldDocument = await collection.find({
      login: req.session.user
    }).toArray();

    if(!fieldDocument || fieldDocument.length!=1){
      res.status(500).json({ error: 'Data for this user is absent in the database.'});
      await client.close();
      return;
    }
    console.log(JSON.stringify(fieldDocument));
    let user = fieldDocument[0];
    let userItems = user.items;
    console.log(userItems);
    for(let i = 0; i < userItems.length; i++){
      if(userItems[i].id === req.body.id) {
        userItems[i].checked = req.body.checked;
        userItems[i].text = req.body.text;
        break;
      }
    };
    console.log(userItems);
    await collection.updateOne({login: user.login, pass: user.pass}, {$set: {items: userItems}});

    res.send(JSON.stringify({
      ok: true
    }));

  } catch (error) {
    res.status(500).json({ ok: false, error: error});
  } finally {
    await client.close();
  }
};

async function deleteItemHandler (req: Request, res: Response) {
  try {
    await client.connect();
    const collection = client.db(dataBaseName).collection(collectionName);
    const fieldDocument = await collection.find({
      login: req.session.user
    }).toArray();

    if(!fieldDocument || fieldDocument.length!=1){
      res.status(500).json({ error: 'Data for this user is absent in the database.'});
      await client.close();
      return;
    }

    let user = fieldDocument[0];
    let userItems = user.items;

    for(let i = 0; i < userItems.length; i++) {
      if(userItems[i].id === req.body.id) {
        userItems.splice(i, 1);
        break;
      }
    }

    await collection.updateOne({login: user.login, pass: user.pass}, {$set: {items: userItems}});

    res.send(JSON.stringify({
      ok: true
    }));
  } catch (error) {
    res.status(500).json({ ok: false, error: error});
  } finally{
    await client.close();
  }
};



function loginHandler (req: Request, res: Response) {
  let inputData = req.body;
  if(!checkLoginAndPass(inputData.login, inputData.pass)){
    res.status(400).json({ ok: false, error: 'not found' });
  }

  client.connect(async (err:Error) => {
    await client.connect();
    const collection = client.db(dataBaseName).collection(collectionName);
    const findDocument = await collection.find({
      login: inputData.login,
      pass: inputData.pass
    }).toArray();
    if(findDocument.length === 1){
      res.send(JSON.stringify({ ok: true }));
    } else { 
      res.status(400).json({ ok: false, error: 'not found' });
    }
    await client.close();
  })
  req.session.user = inputData.login;
  console.log(req.session);
};

function logoutHandler (req: Request, res: Response) {
  req.session.destroy((err) => {
    if(err) {
      res.status(500).json({
        ok: false,
        error: "Error logging out"
      });
    } else {
      res.json({ ok: true });
    }
  })
};

async function registerHandler (req: Request, res: Response) {
  const inputData = req.body;
  if(checkLoginAndPass(inputData.login, inputData.pass)){
    console.log("wrong data");
    res.status(400).send(JSON.stringify({
      ok: false,
      error: "The login or password is entered incorrectly. The password can only contain Latin letters and numbers"
    }));
    return;
  }
  try {
    await client.connect();
    const collection = client.db(dataBaseName).collection(collectionName);
    
    const findDocument = await collection.find({
        login: inputData.login
      }).toArray();
    if(findDocument.length > 0){
      res.status(500).json({ ok: false, error: 'The given login is already taken.' });
      await client.close();
      return;
    }

    const document = { 
      login: inputData.login,
      pass: inputData.pass,
      items: []
    }
    await collection.insertOne(document);

    res.send(JSON.stringify({ ok: true }))
  } catch (error) {
    res.status(500).send(JSON.stringify({
        ok: false,
        error: error
    }));
  } finally {
    await client.close();
  }
};

function checkLoginAndPass(login: string, pass: string): boolean {
  const regexpLogin = /^[\w|\d][-a-z\d.+]{1,19}@[-_?=/+*'&%$!.\w\d]{1,15}\.\w{1,5}$/i;
  const regexpPass = /^[a-z\d]$/i;

  return !(regexpLogin.test(login) && regexpPass.test(pass));
}

function checkText(text: string): boolean {
  let regexp = /[<>/&#]]/g;
  return !regexp.test(text);
}

async function findItemID(): Promise<number> {
  const filePath = "counterTodo.txt";

  try {
    const data: string = await fsPromises.readFile(filePath, 'utf8');
    let idItem: number = +data + 1;

    await fsPromises.writeFile(filePath, idItem.toString(), 'utf8');
    return idItem;
  } catch (error) {
    console.error('Ошибка:', error);
    throw error; // Вы можете обработать ошибку здесь или передать ее дальше
  }
}