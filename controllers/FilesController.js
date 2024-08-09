/* eslint-disable consistent-return */
/* eslint-disable max-len */
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { ObjectId } = require('mongodb');
const mime = require('mime-types');
const redisClient = require('../utils/redis');
const dbClient = require('../utils/db');
const { fileQueue } = require('../queues/fileQueue');

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

if (!fs.existsSync(FOLDER_PATH)) {
  fs.mkdirSync(FOLDER_PATH, { recursive: true });
}

const FilesController = {
  async postUpload(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name, type, parentId, isPublic = false, data,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing name' });
    }

    if (!type || !['folder', 'file', 'image'].includes(type)) {
      return res.status(400).json({ error: 'Missing or invalid type' });
    }

    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    const parentObjectId = parentId === 0 ? 0 : new ObjectId(parentId);
    if (parentId) {
      const parentFile = await dbClient.db.collection('files').findOne({ _id: parentObjectId });
      if (!parentFile) {
        return res.status(400).json({ error: 'Parent not found' });
      }

      if (parentFile.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    const file = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentObjectId,
      localPath: '',
    };

    if (type === 'folder') {
      const result = await dbClient.db.collection('files').insertOne(file);
      return res.status(201).json(result.ops[0]);
    }
    const fileId = uuidv4();
    const filePath = path.join(FOLDER_PATH, `${fileId}_${name}`);

    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));

    file.localPath = filePath;
    const result = await dbClient.db.collection('files').insertOne(file);

    if (file.type === 'image') {
      await fileQueue.add({
        userId: file.userId.toString(),
        fileId: file._id.toString(),
      });
    }
    return res.status(201).json(result.ops[0]);
  },

  async getShow(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    return res.status(200).json(file);
  },

  async getIndex(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const parentId = req.query.parentId || 0;
    const page = parseInt(req.query.page, 10) || 0;
    const pageSize = 20;
    const skip = page * pageSize;

    const query = {
      userId: new ObjectId(userId),
      parentId: parentId === 0 ? 0 : new ObjectId(parentId),
    };

    try {
      const files = await dbClient.db.collection('files').aggregate([
        { $match: query },
        { $skip: skip },
        { $limit: pageSize },
      ]).toArray();

      return res.status(200).json(files);
    } catch (error) {
      return res.status(500).json({ error: 'Internal server error' });
    }
  },

  async putPublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }
    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Not found' });
    }

    await dbClient.db.collection('files').updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: true } });
    const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });

    return res.status(200).json(updatedFile);
  },

  async putUnpublish(req, res) {
    const token = req.headers['x-token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fileId = req.params.id;
    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({ error: 'Invalid file ID' });
    }
    const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId), userId: new ObjectId(userId) });

    if (!file) {
      return res.status(404).json({ error: 'Unauthorized' });
    }

    await dbClient.db.collection('files').updateOne({ _id: new ObjectId(fileId) }, { $set: { isPublic: false } });
    const updatedFile = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });

    return res.status(200).json(updatedFile);
  },

  async getFile(req, res) {
    try {
      const fileId = req.params.id;
      const { size } = req.query;

      if (!ObjectId.isValid(fileId)) {
        return res.status(400).json({ error: 'Invalid file ID' });
      }

      const file = await dbClient.db.collection('files').findOne({ _id: new ObjectId(fileId) });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      const token = req.headers['x-token'];
      const userId = token ? await redisClient.get(`auth_${token}`) : null;

      if (!file.isPublic) {
        if (!userId || file.userId.toString() !== userId) {
          return res.status(404).json({ error: 'Not found' });
        }
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doessn't have content" });
      }

      let filePath = file.localPath;

      if (size && [100, 250, 500].includes(Number(size))) {
        filePath = `${filePath}_${size}`;
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Not found' });
      }

      const fileContent = fs.readFileSync(filePath);
      const mimeType = mime.lookup(file.name);

      res.setHeader('Content-Type', mimeType);
      return res.status(200).send(fileContent);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  },
};

module.exports = FilesController;
