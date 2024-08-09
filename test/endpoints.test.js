/* eslint-disable prefer-arrow-callback */
/* eslint-disable func-names */
/* eslint-disable prefer-promise-reject-errors */
/* eslint-disable no-unused-vars */
/* eslint-disable max-len */
/* eslint-disable jest/no-hooks */
/* eslint-disable no-unused-expressions */
/* eslint-disable jest/expect-expect */
/* eslint-disable jest/prefer-expect-assertions */
const chai = require('chai');
const chaiHttp = require('chai-http');
const { v4: uuidv4 } = require('uuid');
const { MongoClient } = require('mongodb');
const { promisify } = require('util');
const { spawn } = require('child_process');
const path = require('path');
const redis = require('redis');
const sha1 = require('sha1');
const app = require('../server');

chai.use(chaiHttp);

describe('aPI Endpoints', () => {
  let testClientDb;
  let testRedisClient;
  let redisDelAsync;
  let redisGetAsync;
  let redisSetAsync;
  let redisKeysAsync;
  let workerProcess;

  let initialUser = null;
  let initialUserId = null;
  let initialUserToken = null;

  const fctRandomString = () => Math.random().toString(36).substring(2, 15);

  const fctRemoveAllRedisKeys = async () => {
    const keys = await redisKeysAsync('auth_*');
    keys.forEach(async (key) => {
      await redisDelAsync(key);
    });
  };

  beforeEach(async function () {
    /*
    this.timeout(5000);

    workerProcess = spawn('node', [path.join(__dirname, '../worker.js')]);

    await new Promise((resolve, reject) => {
      workerProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Worker ready')) {
          resolve();
        }
      });

      workerProcess.stderr.on('data', (data) => {
        console.error(`Worker stderr: ${data}`);
      });

      workerProcess.on('error', (err) => {
        reject(`Failed to start worker process: ${err.message}`);
      });

      setTimeout(() => reject('Worker process did not start in time'), 5000);
    });
    */
    const dbInfo = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '27017',
      database: process.env.DB_DATABASE || 'files_manager',
    };

    const uri = `mongodb://${dbInfo.host}:${dbInfo.port}/${dbInfo.database}`;
    const client = await MongoClient.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true });
    testClientDb = client.db(dbInfo.database);

    await testClientDb.collection('users').deleteMany({});
    await testClientDb.collection('files').deleteMany({});

    initialUser = {
      email: `${fctRandomString()}@me.com`,
      password: sha1(fctRandomString()),
    };

    const createdDocs = await testClientDb.collection('users').insertOne(initialUser);
    if (createdDocs && createdDocs.ops.length > 0) {
      initialUserId = createdDocs.ops[0]._id.toString();
    }

    testRedisClient = redis.createClient();
    redisDelAsync = promisify(testRedisClient.del).bind(testRedisClient);
    redisGetAsync = promisify(testRedisClient.get).bind(testRedisClient);
    redisSetAsync = promisify(testRedisClient.set).bind(testRedisClient);
    redisKeysAsync = promisify(testRedisClient.keys).bind(testRedisClient);

    await new Promise((resolve) => {
      testRedisClient.on('connect', async () => {
        await fctRemoveAllRedisKeys();
        initialUserToken = uuidv4();
        await redisSetAsync(`auth_${initialUserToken}`, initialUserId);
        resolve();
      });
    });
  });

  afterEach(async function () {
    await fctRemoveAllRedisKeys();
    await testClientDb.collection('users').deleteMany({});
    await testClientDb.collection('files').deleteMany({});
    testRedisClient.quit();
    /*
    if (workerProcess) {
      workerProcess.kill('SIGTERM');
      await new Promise((resolve) => {
        workerProcess.on('exit', () => {
          resolve();
        });
      });
    }
      */
  });

  describe('gET /status', () => {
    it('should return status 200 and OK message', () => new Promise((done) => {
      chai.request(app)
        .get('/status')
        .end((err, res) => {
          chai.expect(err).to.be.null;
          chai.expect(res).to.have.status(200);
          chai.expect(res.body).to.deep.equal({ redis: true, db: true });
          done();
        });
    }));
  });

  describe('gET /stats', () => {
    it('should return status 200 and stats object', () => new Promise((done) => {
      chai.request(app)
        .get('/stats')
        .end((err, res) => {
          chai.expect(err).to.be.null;
          chai.expect(res).to.have.status(200);
          chai.expect(res.body).to.deep.equal({ users: 1, files: 0 });
          done();
        });
    }));
  });

  describe('pOST /users', () => {
    it('should create a new user', () => new Promise((done) => {
      const userData = {
        email: `${fctRandomString()}@me.com`,
        password: fctRandomString(),
      };

      chai.request(app)
        .post('/users')
        .send(userData)
        .end((err, res) => {
          chai.expect(err).to.be.null;
          chai.expect(res).to.have.status(201);

          const resUser = res.body;
          chai.expect(resUser.email).to.equal(userData.email);
          chai.expect(resUser.id).to.exist;

          testClientDb.collection('users')
            .findOne({ email: userData.email }, (err, user) => {
              chai.expect(err).to.be.null;
              chai.expect(user).to.exist;
              chai.expect(user.email).to.equal(userData.email);
              done();
            });
        });
    }));

    it('should return 400 for missing email', () => new Promise((done) => {
      const userData = {
        password: fctRandomString(),
      };

      chai.request(app)
        .post('/users')
        .send(userData)
        .end((err, res) => {
          chai.expect(res).to.have.status(400);
          chai.expect(res.body).to.deep.equal({ error: 'Missing email' });
          done();
        });
    }));

    it('should return 400 for missing password', () => new Promise((done) => {
      const userData = {
        email: `${fctRandomString()}@me.com`,
      };

      chai.request(app)
        .post('/users')
        .send(userData)
        .end((err, res) => {
          chai.expect(res).to.have.status(400);
          chai.expect(res.body).to.deep.equal({ error: 'Missing password' });
          done();
        });
    }));
  });

  describe('pOST /files', () => {
    it('should create a folder at the root', () => new Promise((done) => {
      const fileData = {
        name: fctRandomString(),
        type: 'folder',
      };

      chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData)
        .end(async (err, res) => {
          chai.expect(err).to.be.null;
          chai.expect(res).to.have.status(201);

          const resFile = res.body;
          chai.expect(resFile.name).to.equal(fileData.name);
          chai.expect(resFile.userId).to.equal(initialUserId);
          chai.expect(resFile.type).to.equal(fileData.type);
          chai.expect(resFile.parentId).to.equal(0);

          const docs = await testClientDb.collection('files').find({}).toArray();
          chai.expect(docs.length).to.equal(1);

          const docFile = docs[0];
          chai.expect(docFile.name).to.equal(fileData.name);
          chai.expect(docFile._id.toString()).to.equal(resFile.id);
          chai.expect(docFile.userId.toString()).to.equal(initialUserId);
          chai.expect(docFile.type).to.equal(fileData.type);
          chai.expect(docFile.parentId.toString()).to.equal('0');
          done();
        });
    })).timeout(30000);

    it('should create a file at the root', () => new Promise((done) => {
      const fileData = {
        name: fctRandomString(),
        type: 'file',
        data: fctRandomString(),
      };

      chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData)
        .end(async (err, res) => {
          chai.expect(err).to.be.null;
          chai.expect(res).to.have.status(201);

          const resFile = res.body;
          chai.expect(resFile.name).to.equal(fileData.name);
          chai.expect(resFile.userId).to.equal(initialUserId);
          chai.expect(resFile.type).to.equal(fileData.type);
          chai.expect(resFile.parentId).to.equal(0);

          const docs = await testClientDb.collection('files').find({}).toArray();
          chai.expect(docs.length).to.equal(1);

          const docFile = docs[0];
          chai.expect(docFile.name).to.equal(fileData.name);
          chai.expect(docFile._id.toString()).to.equal(resFile.id);
          chai.expect(docFile.userId.toString()).to.equal(initialUserId);
          chai.expect(docFile.type).to.equal(fileData.type);
          chai.expect(docFile.parentId.toString()).to.equal('0');
          done();
        });
    })).timeout(30000);

    it('should create a file inside a folder', async () => {
      // Create a folder first
      const folderData = {
        name: fctRandomString(),
        type: 'folder',
      };

      const folderRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(folderData);

      chai.expect(folderRes).to.have.status(201);
      const folderId = folderRes.body.id;

      // Create a file inside the folder
      const fileData = {
        name: fctRandomString(),
        type: 'file',
        data: fctRandomString(),
        parentId: folderId,
      };

      const fileRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData);

      chai.expect(fileRes).to.have.status(201);
      const resFile = fileRes.body;
      chai.expect(resFile.name).to.equal(fileData.name);
      chai.expect(resFile.userId).to.equal(initialUserId);
      chai.expect(resFile.type).to.equal(fileData.type);
      chai.expect(resFile.parentId).to.equal(folderId);

      const docs = await testClientDb.collection('files').find({}).toArray();
      chai.expect(docs.length).to.equal(2);

      const docFile = docs.find((doc) => doc.type === 'file');
      chai.expect(docFile.name).to.equal(fileData.name);
      chai.expect(docFile._id.toString()).to.equal(resFile.id);
      chai.expect(docFile.userId.toString()).to.equal(initialUserId);
      chai.expect(docFile.type).to.equal(fileData.type);
      chai.expect(docFile.parentId.toString()).to.equal(folderId);
    }).timeout(30000);
  });

  describe('gET /files/:id', () => {
    it('should get file details by id', async () => {
      // Create a file first
      const fileData = {
        name: fctRandomString(),
        type: 'file',
        data: fctRandomString(),
      };

      const fileRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData);

      chai.expect(fileRes).to.have.status(201);
      const fileId = fileRes.body.id;

      // Fetch the file details
      const getRes = await chai.request(app)
        .get(`/files/${fileId}`)
        .set('X-Token', initialUserToken);

      chai.expect(getRes).to.have.status(200);
      const resFile = getRes.body;
      chai.expect(resFile.name).to.equal(fileData.name);
      chai.expect(resFile.userId).to.equal(initialUserId);
      chai.expect(resFile.type).to.equal(fileData.type);
      chai.expect(resFile.parentId).to.equal(0);
    }).timeout(30000);
  });

  describe('gET /files', () => {
    it('should list files for the user', async () => {
      // Create a folder
      const folderData = {
        name: fctRandomString(),
        type: 'folder',
      };

      const folderRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(folderData);

      chai.expect(folderRes).to.have.status(201);
      const folderId = folderRes.body.id;

      // Create a file inside the folder
      const fileData = {
        name: fctRandomString(),
        type: 'file',
        data: fctRandomString(),
        parentId: folderId,
      };

      const fileRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData);

      chai.expect(fileRes).to.have.status(201);

      // List files
      const listRes = await chai.request(app)
        .get('/files')
        .set('X-Token', initialUserToken);

      chai.expect(listRes).to.have.status(200);
      const files = listRes.body;
      chai.expect(files.length).to.equal(2);

      const folder = files.find((file) => file.type === 'folder');
      const file = files.find((file) => file.type === 'file');
      chai.expect(folder.name).to.equal(folderData.name);
      chai.expect(file.name).to.equal(fileData.name);
    }).timeout(30000);
  });

  describe('pUT /files/:id/publish', () => {
    it('should publish a file', async () => {
      // Create a file first
      const fileData = {
        name: fctRandomString(),
        type: 'file',
        data: fctRandomString(),
      };

      const fileRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData);

      chai.expect(fileRes).to.have.status(201);
      const fileId = fileRes.body.id;

      // Publish the file
      const publishRes = await chai.request(app)
        .put(`/files/${fileId}/publish`)
        .set('X-Token', initialUserToken);

      chai.expect(publishRes).to.have.status(200);
      const resFile = publishRes.body;
      chai.expect(resFile.isPublic).to.be.true;
    }).timeout(30000);
  });

  describe('pUT /files/:id/unpublish', () => {
    it('should unpublish a file', async () => {
      // Create a file first
      const fileData = {
        name: fctRandomString(),
        type: 'file',
        data: fctRandomString(),
      };

      const fileRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData);

      chai.expect(fileRes).to.have.status(201);
      const fileId = fileRes.body.id;

      // Publish the file first
      await chai.request(app)
        .put(`/files/${fileId}/publish`)
        .set('X-Token', initialUserToken);

      // Unpublish the file
      const unpublishRes = await chai.request(app)
        .put(`/files/${fileId}/unpublish`)
        .set('X-Token', initialUserToken);

      chai.expect(unpublishRes).to.have.status(200);
      const resFile = unpublishRes.body;
      chai.expect(resFile.isPublic).to.be.false;
    }).timeout(30000);
  });

  describe('gET /files/:id/data', () => {
    it('should get file data by id', async () => {
      // Create a file first
      const fileData = {
        name: fctRandomString(),
        type: 'file',
        data: fctRandomString(),
      };

      const fileRes = await chai.request(app)
        .post('/files')
        .set('X-Token', initialUserToken)
        .send(fileData);

      chai.expect(fileRes).to.have.status(201);
      const fileId = fileRes.body.id;

      // Fetch the file data
      const getDataRes = await chai.request(app)
        .get(`/files/${fileId}/data`)
        .set('X-Token', initialUserToken);

      chai.expect(getDataRes).to.have.status(200);
      chai.expect(getDataRes.text).to.equal(fileData.data);
    }).timeout(30000);
  });
});
