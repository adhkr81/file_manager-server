const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const bodyParser = require('body-parser');
const jsonParser = bodyParser.json()

const app = express();
const port = process.env.PORT || 4000;
const server = http.createServer(app);
const { nanoid } = require("nanoid")
const path = require("path")
const io = socketio(server);
const cors = require('cors');
app.use(cors())

const fs = require("fs");
const multer  = require('multer')
const upload = multer({storage: multer.memoryStorage()})
const { pool } = require("./config/db");

const generateToken = require("./config/jwt.config");
const isAuth = require("./middlewares/isAuth");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
require("dotenv").config();

const redis = require('redis');
const client = redis.createClient();

const cron = require("node-cron")

// =========================== MIDDLEWARE ==============================================

// async function isCached(req, res, next) {

//   client.keys('*', function (err, keys) {
//     if (err) return console.log(err);

//     console.log("entered")
     
//     for(let i = 0; i < keys.length; i++) {
//       console.log(keys[i]);
//     }
//   }); 
  
//   next()
// }


// ============================ CRON ===================================================

cron.schedule('* * * * *', function() {
  console.log('running a task every minute');
});

// ============================ REDIS ===================================================

//connect to redis
(async () => {
  await client.connect();
})();

client.on('connect', function() {
  console.log('Connected!');
});

// REDID GET
// (async () => {
//   const value = await client.get('foo')

//   console.log(value)
// })();

//REDIS WAS BREAKING ALL OF SUDDEN:
// (error) MISCONF Redis is configured to save RDB snapshots, but it's currently unable to persist to disk. Commands that may modify the data set are disabled, because this instance is configured to report errors during writes if RDB snapshotting fails (stop-writes-on-bgsave-error option). Please check the Redis logs for details about the RDB error.
// 127.0.0.1:6379>

//SO I RAN THIS COMAND ON REDIS-CLI :  config set stop-writes-on-bgsave-error no

// ========================== AUTHENTICATION ============================================

const saltRounds = 10;

// CREATE NEW USER (SIGN UP)
app.post("/signup", jsonParser, async (req, res) => {
  try {
    // first thing: Cryptograph the password
    const { email, firstname, lastname, password, company, branch, role, settings } = req.body;

    if (!password) {
      return res.status(400).json({
        msg: "Password is required"
      })
    }

    const salt = await bcrypt.genSalt(saltRounds);
    const hash = await bcrypt.hash(password, salt);
    const id = nanoid()
    const created = new Date().toJSON().slice(0, 10);

    const createdUser = await pool.query(
      "INSERT INTO users (id, email, firstname, lastname, hash, company, branch, role, settings, created) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)",
      [ id, email, firstname, lastname, hash, company, branch, role, settings, created ]
    );

    return res.status(201).json(createdUser);
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

//LOGIN UP ROUTE - BCRYPT COMPARISON
app.post("/login", jsonParser, async (req, res) => {
  
  try {
    const { email, password } = req.body;

    const response = await pool.query("SELECT * FROM users WHERE email = $1",
    [email]
    );
    const user = response.rows[0]

    if (!user) {
      return res.status(400).json({ msg: "Wrong username." });
    }

    //if comparison is true, create a token
    if (await bcrypt.compare(password, user.hash)) {
      const token = generateToken(user);
      delete user.hash

      //get folders to send to logged user
      const resp = await pool.query("SELECT * FROM folders WHERE company = $1",
      [user.company]
      );
      //transform into an array of folders (probably can query on postgres straight)
      const dbfolders = resp.rows
      const folders = dbfolders.map(item => item.folder)

      //sends to redis list of users (retrieve data with SMEMBERS)
      client.sAdd(`${user.company}`, `${user.email}`);  

      return res.status(200).json({
        token: token,
        user: { ...user },
        folders: folders
      });

    } else {
      return res.status(400).json({ msg: "Wrong password or username." });
    }
  } catch (error) {
    console.log(error);
    return res.status(500).json(error);
  }
});

// ========================== SOCKET CONNECTIONS ========================================


io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    const payload = await jwt.verify(token, process.env.TOKEN_SIGN_SECRET);
    socket.user = { username: payload.email, room: payload.company}

    next();
  } catch (err) {
    next(err);
  }
}).on("connection", (socket) => {
  console.log("entered on connection");
  socket.emit("connected");
  socket.on("join", () => {

    console.log("entered on join");
    const user = socket.user.username
    const room = socket.user.room
    socket.join(user.room);
  });
  socket.on("end", function () {
    console.log("entrou no end");
    socket.disconnect();
  });
  socket.on("disconnect", () => {
    console.log("disconnected");
  });
});

//====================== FILE REST APIS ==================================


// GET FILE AND FOLDERS ON LOAD AND ON CLICK (FOLDERS SELECT ON FRONTEND)
app.post('/api/getFiles', jsonParser, isAuth, async (req, res) => {

const loggedInUser = req.auth;
const user = loggedInUser.email
const usersCompanyId = loggedInUser.company
const folderName = usersCompanyId
const userid = loggedInUser.id

app.use(express.static( path.join( __dirname, `${folderName}`)));

// checking on redis if keys exist
    //get from DB all projects user owns
if (loggedInUser) {    
    try {
      const projects = await pool.query("SELECT * FROM projects WHERE owner = $1",
      [userid]
      )

      projects.rows.forEach(async item => {
        const project = item.title
        const value = await client.sMembers(`${usersCompanyId}:${project}:allKeys`)

        //if they are in redis, send to frontend with socket
        if (value.length) {
          console.log("key found in redis, sending REDIS to frontend", value)
          io.to(user.usersCompanyId).emit('keys_redis', value )  
        
        //if they are not in redis, get from DB  
        } else {
          try {
            console.log("key not in redis, getting from DB")

            const files = await pool.query("SELECT * FROM images WHERE belongsto = $1",
            [usersCompanyId]
            );

            const folders = await pool.query("SELECT * FROM folders WHERE company = $1",
            [usersCompanyId]
            );

            //transform into an array of folders (probably can query on postgres straight)
            const dbfolders = folders.rows
            const foldersArr = dbfolders.map(item => item.folder)

            res.send({ express: 'files and folders downloaded' });
            io.to(user.usersCompanyId).emit('uploads', files.rows )  
            io.to(user.usersCompanyId).emit('folders', foldersArr ) 

            // saving files on redis
            files.rows.forEach(item => 
              {
                const project = item.uploadedto
                const path = item.path
                const image = item.id
                const filename = item.filename
      
                //set file key-value
                client.set(`${usersCompanyId}:${project}:${path}:${image}`, JSON.stringify(item));

                //set keys for company_project
                client.sAdd(`${usersCompanyId}:${project}:allKeys`, [`${usersCompanyId}:${path}:${image}:${filename}`]);  
              }
            )
          } catch (error) {
            console.error(error);
          }
        }
      })
    } catch(error) {
      console.log(error)
    }
  } else {
      res.send([{ filename: 'Access Denied' }]);
      io.to(user).emit('notification', [{ filename: 'Access Denied' }] )  //EXAMPLE OF SENDING THIS MESSAGE ONLY TO USER 
  }
});


//UPLOAD FILES
app.post("/api/upload", upload.any("image"), isAuth, async (req, res) => {

  const loggedInUser = req.auth;

  const path = req.headers.folder
  const user = loggedInUser.email
  const usersCompanyId = loggedInUser.company
  const belongsto = loggedInUser.company // maybe refactor and leave as usersCompanyId only
  const created = new Date().toJSON().slice(0, 10);
  const uploadedto = "hardcoded" // projects are hardcoded in here for now

    if (req.files) {

      for (let i = 0; i < req.files.length; i++) {
        const id  = nanoid() + req.files[i].originalname.substr(req.files[i].originalname.length - 4)
        const filename = req.files[i].originalname
        const buffer = req.files[i].buffer

        if (!fs.existsSync(belongsto)){
          fs.mkdirSync(belongsto);
        }

        try {
          //file data saved in postgres
          const res = await pool.query(
            "INSERT INTO images (id, belongsto, path, filename, created, uploadedto) VALUES ($1, $2, $3, $4, $5, $6)",
            [id, belongsto, path, filename, created, uploadedto]
          );

          // files saved in local folder with file system
          fs.writeFile(`./${belongsto}/` + id, buffer, "binary", function(err) {
            if (err) throw err
            console.log("file is uploaded")
          })

          //send to redis uploaded file data
          client.sAdd(`${usersCompanyId}:${uploadedto}:allKeys`, [`${usersCompanyId}:${path}:${id}:${filename}`]);  
          // console.log(`Added a file with the name ${filename}`);

        } catch (error) {
          console.error(error)
        }
      }

      const response = await pool.query("SELECT * FROM images WHERE belongsto = $1",
      [usersCompanyId]
      );
      io.to(user.userCompany).emit('uploads', response.rows )                          
      io.to(user.userCompany).emit('notification', [{ express: `file was uploaded` }] )  
    }

   res.send({ express: 'upload' });
});


//DELETE FILE
app.post('/api/delete', jsonParser, isAuth, async (req, res) => {

  const loggedInUser = req.auth;
  const user = loggedInUser.email
  const usersCompanyId = loggedInUser.company
  const item = req.body.item
  const path = req.body.path
  const filename = req.body.filename
  const company = loggedInUser.company
  const filePath = `./${company}/${item}`

  console.log(req.body)

  const uploadedto = "hardcoded" // projects are hardcoded in here for now

  try {
    //delete from the DB
    const res = await pool.query(
      "DELETE FROM images WHERE id = $1",
      [item]
    );
    console.log(`deleted from db a file with the name ${item}`);

    //delete file from the folder
    fs.unlink(filePath, (err) => {
      if (err && err.code == "ENOENT") {
        console.info("Error! File doesn't exist.");
      } else if (err) {
        console.error("Something went wrong. Please try again later.");
      } else {
        console.info(`Successfully removed file with the path of ${filePath}`);
      }
    });

    //delete from REDIS
    const test = await client.sRem(`${usersCompanyId}:${uploadedto}:allKeys`, `${usersCompanyId}:${path}:${item}:${filename}`);  
    console.log(test)

    console.log(`${usersCompanyId}:${uploadedto}:allKeys`, `${usersCompanyId}:${path}:${item}:${filename}`)


    //get from DB updated folders list
    const response = await pool.query("SELECT * FROM images WHERE belongsto = $1",
    [company]
    );

    //responses are being sent in socket from DB now, not from REDIS + socket
    io.to(user.userCompany).emit('uploads', response.rows )                                  
    io.to(user.userCompany).emit('notification', [{ express: `file ${item} was deleted` }] ) 

  } catch (error) {
    console.error(error)
  }
  res.send({ express: 'File deleted' });
});

//MOVE FILES
app.post("/api/moveFile", jsonParser, isAuth, async (req, res) => {

  const loggedInUser = req.auth;
  const id  = req.body.id
  const filename  = req.body.filename
  const folder = req.body.path
  const oldfolder = req.body.oldpath
  const user = loggedInUser.email
  const usersCompanyId = loggedInUser.company

  console.log(req.body)

  const directory = loggedInUser.company // maybe refactor and leave as usersCompanyId only
  const uploadedto = "hardcoded" // projects are hardcoded in here for now

  try {
    const res = await pool.query(
      "UPDATE images SET path = $1 WHERE id = $2",
      [folder, filename]
    );
    console.log(`Moved file with the name ${filename} to folder called ${folder}`);

    //update REDIS, delete and add another value
    console.log(`${usersCompanyId}:${uploadedto}:allKeys`, `${usersCompanyId}:${folder}:${id}:${filename}`)
    const deleteRedis = await client.sRem(`${usersCompanyId}:${uploadedto}:allKeys`, `${usersCompanyId}:${oldfolder}:${id}:${filename}`);  
    const addNewRedis = client.sAdd(`${usersCompanyId}:${uploadedto}:allKeys`, [`${usersCompanyId}:${folder}:${id}:${filename}`]);  

    const response = await pool.query("SELECT * FROM images WHERE belongsto = $1",
    [directory]
    );
    io.to(user.userCompany).emit('uploads', response.rows )                               
    io.to(user.userCompany).emit('notification', [{ express: `Moved file with the name ${filename} to folder called ${folder}` }] ) 

  } catch (error) {
    console.error(error)
  }    
  
   res.send({ express: 'upload' });
});



//======================= FOLDERS REST APIS ===========================================

//CREATE FOLDER
app.post('/api/createFolder', jsonParser, isAuth, async (req, res) => {

  const loggedInUser = req.auth;

  const newFolder = req.body.folder
  const user = loggedInUser.email
  const usersCompanyId = loggedInUser.company

  try {
    const res = await pool.query(
      "INSERT INTO folders (folder, company) VALUES ($1, $2)",
      [newFolder, usersCompanyId]
    );
    console.log(`Added a folder with the name ${newFolder}`);

    const response = await pool.query("SELECT * FROM folders WHERE company = $1",
    [usersCompanyId]
    );
    io.to(user.userCompany).emit('folders', response.rows )   

  } catch (error) {
    console.error(error)
  }

  res.send({ express: 'Folders updated' });
});


//DELETE FOLDER
app.post('/api/deleteFolder', jsonParser, isAuth, async (req, res) => {

  const loggedInUser = req.auth;

  const folder = req.body.folder
  const user = loggedInUser.email
  const usersCompanyId = loggedInUser.company

  const company = loggedInUser.company // maybe refactor and leave as usersCompanyId only


  try {
    //get from db, filenames inside the folder 
    const resp = await pool.query("SELECT filename FROM uploads WHERE folder = $1",
    [folder]
    );
  
    const files = resp.rows
  
    //loop to delete from both db and local folder
    for (let i=0; i < files.length; i++) {
        // delete files from db
        const res = await pool.query(
          "DELETE FROM uploads WHERE filename = $1",
          [files[i].filename]
        );

        // delete files from local folder
        const filePath = `./uploads/${files[i].filename}`
          fs.unlink(filePath, (err) => {
        if (err && err.code == "ENOENT") {
          console.info("Error! File doesn't exist.");
        } else if (err) {
          console.error("Something went wrong. Please try again later.");
        } else {
          console.info(`Successfully removed file with the path of ${filePath}`);
        }
      });
    }

    //delete folder from db
    const res = await pool.query(
      "DELETE FROM folders WHERE folder = $1",
      [folder]
    );


    //get from DB updated folders list
    const response = await pool.query("SELECT * FROM folders WHERE company = $1",
    [company]
    );
    io.to(user.userCompany).emit('folders', response.rows )                                                //SEND IO ROOM HERE!!!!!!!!!!!!
    io.to(user.userCompany).emit('notification', [{ express: `folder ${folder} was deleted` }] )           //SEND IO ROOM HERE!!!!!!!!!!!!

  } catch (error) {
    console.error(error)
  }
  res.send({ express: 'File deleted' });
});

// ============================== OTHER TEMPORARY ROUTES ============================

//add a project to add with Insomnia
app.post("/api/addprojects", jsonParser, async (req, res) => {

    const id = nanoid()
    const title = req.body.title
    const branch = req.body.branch
    const owner = "u0iOl81SnUhL67gBi2w-D" // hardcoded owner user "aaa"



        try {
          //file data saved in postgres
          const res = await pool.query(
            "INSERT INTO projects (id, title, branch, owner) VALUES ($1, $2, $3, $4)",
            [id, title, branch, owner]
          );

          //send to redis uploaded file data
          // client.set(`${usersCompanyId}:${uploadedto}:${path}:${id}`, `${req.files[i].originalname}`);
          // console.log(`Added a file with the name ${filename}`);

        } catch (error) {
          console.error(error)
        }


      // const response = await pool.query("SELECT * FROM projects WHERE owner = $1",
      // [owner]
      // );
      // io.to(user.userCompany).emit('uploads', response.rows )                          
      // io.to(user.userCompany).emit('notification', [{ express: `file was uploaded` }] )  
    

   res.send({ express: 'project created' });
});


server.listen(port, () => console.log(`Server has started at PORT 4000.`));




